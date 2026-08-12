/**
 * Montagem do contexto do chamado enviado ao modelo.
 *
 * O modelo é um especialista em levantamento de requisitos: sem saber de que
 * projeto, de que entidade e do que já foi dito no chamado, ele só consegue
 * repetir lugar-comum. Aqui juntamos título, descrição, comentários recentes,
 * tipo (correção/melhoria), projeto, entidade e o texto extraído dos anexos.
 *
 * Nada aqui lança: contexto incompleto ainda rende sugestão, então cada parte
 * que falha é omitida em silêncio.
 */

import prisma from "@db";
import type {ConfigIaRequisitos} from "@modules/ia-requisitos/config";
import {extrairTextoDeImagem} from "@modules/ia-requisitos/ocr";
import type {AnexoIa, CampoIa, ContextoIa} from "@modules/ia-requisitos/tipos";
import {serveAsset} from "@utils/storage";

/** Últimos comentários enviados, em ordem cronológica. */
const MAX_COMENTARIOS = 5;
/** Anexos com OCR por chamada — cada um custa uma ida ao worker dentro do orçamento. */
const MAX_ANEXOS = 3;
/** Acima disso o OCR não compensa o tempo (contrato: teto de 2 s no total). */
const MAX_BYTES_OCR = 5 * 1024 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O que do chamado salvo entra no contexto, por campo em edição (contrato).
 * Mandar de volta o que a pessoa está digitando só confunde o modelo — o texto
 * em edição já viaja em `texto_atual`.
 */
const PARTES_POR_CAMPO: Record<CampoIa, {titulo: boolean; descricao: boolean}> = {
  titulo: {titulo: false, descricao: false},
  descricao: {titulo: true, descricao: false},
  comentario: {titulo: true, descricao: true},
};

/** Rótulos padrão do fork que classificam o chamado (ver utils/project-defaults). */
const TIPO_POR_ROTULO: Record<string, string> = {
  correcao: "correcao",
  melhoria: "melhoria",
  duvida: "duvida",
};

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function semHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O que a tela sabe e o banco ainda não: no modal de novo chamado o título e a
 * descrição só existem no navegador. Entra como RESERVA — o registro salvo
 * sempre vence — e passa pelos mesmos tetos de tamanho do resto.
 */
export type ContextoInformado = {
  projeto?: unknown;
  entidade?: unknown;
  titulo?: unknown;
  descricao?: unknown;
  comentarios?: unknown;
  tipo?: unknown;
};

export type PedidoDeContexto = {
  workspaceId: string;
  projectId: string;
  issueId?: string | null;
  /** Tipo informado pela tela quando o chamado ainda nem existe. */
  tipo?: string | null;
  /** Entidade informada pela tela quando o chamado ainda nem existe. */
  entityId?: string | null;
  /** Contexto que a tela já tem em mãos, usado como reserva. */
  informado?: ContextoInformado | null;
  campo: CampoIa;
  cfg: ConfigIaRequisitos;
};

/** Tetos por campo: o que vem da tela é dado do usuário indo para fora. */
const LIMITE = {nome: 200, titulo: 500, descricao: 5000, comentario: 2000} as const;

function textoInformado(valor: unknown, limite: number): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo ? limpo.slice(0, limite) : null;
}

function comentariosInformados(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((c) => textoInformado(c, LIMITE.comentario))
    .filter((c): c is string => Boolean(c))
    .slice(-MAX_COMENTARIOS);
}

/**
 * Projeto de um chamado existente. A caixa de comentário sabe em que chamado
 * está, nem sempre em que projeto — e a permissão é por projeto.
 */
export async function projetoDoChamado(workspaceId: string, issueId: string): Promise<string | null> {
  const chamado = await prisma.issue.findFirst({
    where: {id: issueId, workspaceId, deletedAt: null},
    select: {projectId: true},
  });
  return chamado?.projectId ?? null;
}

/** Nome do arquivo como o usuário o vê, com o id como último recurso. */
function nomeDoAnexo(anexo: {id: string; asset: string; attributes: unknown}): string {
  const nome = (anexo.attributes as any)?.name;
  if (typeof nome === "string" && nome.trim()) return nome.trim();
  return anexo.asset.split("/").pop() || anexo.id;
}

/**
 * O binário do anexo. `IssueAttachment.asset` guarda o id do `FileAsset` no
 * fluxo atual e o caminho antigo nos registros migrados — as duas formas são
 * aceitas, como nas rotas legadas de asset.
 */
async function conteudoDoAnexo(chaveOuId: string): Promise<{blob: Blob; tipo: string} | null> {
  const alternativas: any[] = [{asset: {endsWith: chaveOuId}}];
  if (UUID_RE.test(chaveOuId)) alternativas.unshift({id: chaveOuId});

  const arquivo = await prisma.fileAsset.findFirst({where: {OR: alternativas, isDeleted: false}});
  if (!arquivo) return null;
  if (arquivo.size > MAX_BYTES_OCR) return null;

  // A chave no storage é o id do asset (ver utils/storage e modules/asset).
  const resposta = await serveAsset(arquivo.id, arquivo.mimeType);
  if (!resposta) return null;
  return {blob: await resposta.blob(), tipo: arquivo.mimeType ?? ""};
}

/**
 * Anexos com o texto extraído. O modelo é de texto: é no print que costuma
 * estar a mensagem de erro, então sem OCR o anexo não agrega nada.
 * Os OCRs vão em paralelo para caberem no orçamento de tempo.
 */
async function carregarAnexos(cfg: ConfigIaRequisitos, issueId: string): Promise<AnexoIa[]> {
  const anexos = await prisma.issueAttachment.findMany({
    where: {issueId, deletedAt: null},
    orderBy: {createdAt: "desc"},
    take: MAX_ANEXOS,
  });

  return Promise.all(
    anexos.map(async (anexo) => {
      const nome = nomeDoAnexo(anexo);
      try {
        const arquivo = await conteudoDoAnexo(anexo.asset);
        if (!arquivo || !arquivo.tipo.startsWith("image/")) return {nome, texto_extraido: ""};
        return {nome, texto_extraido: await extrairTextoDeImagem(cfg, {nome, tipo: arquivo.tipo, conteudo: arquivo.blob})};
      } catch (e: any) {
        console.warn(`[ia-requisitos] anexo "${nome}" ficou sem texto extraído:`, e?.message ?? e);
        return {nome, texto_extraido: ""};
      }
    }),
  );
}

/** Tipo do chamado: o informado pela tela vence; senão, sai dos rótulos do item. */
function tipoDoChamado(informado: string | null | undefined, rotulos: string[]): string | null {
  const explicito = TIPO_POR_ROTULO[normalizar(informado ?? "")];
  if (explicito) return explicito;
  for (const rotulo of rotulos) {
    const derivado = TIPO_POR_ROTULO[normalizar(rotulo)];
    if (derivado) return derivado;
  }
  return null;
}

export async function montarContexto(pedido: PedidoDeContexto): Promise<ContextoIa> {
  const partes = PARTES_POR_CAMPO[pedido.campo];

  const projeto = await prisma.project.findFirst({
    where: {id: pedido.projectId, workspaceId: pedido.workspaceId, deletedAt: null},
    select: {name: true},
  });

  const chamado = pedido.issueId
    ? await prisma.issue.findFirst({
        where: {id: pedido.issueId, projectId: pedido.projectId, workspaceId: pedido.workspaceId, deletedAt: null},
        select: {
          id: true,
          name: true,
          descriptionStripped: true,
          descriptionHtml: true,
          entity: {select: {name: true}},
          labels: {select: {label: {select: {name: true}}}},
        },
      })
    : null;

  const entidadeInformada = pedido.entityId
    ? await prisma.entity.findFirst({
        where: {id: pedido.entityId, workspaceId: pedido.workspaceId, deletedAt: null},
        select: {name: true},
      })
    : null;

  const comentarios = chamado
    ? (
        await prisma.issueComment.findMany({
          where: {issueId: chamado.id, deletedAt: null},
          orderBy: {createdAt: "desc"},
          take: MAX_COMENTARIOS,
          select: {commentStripped: true, commentHtml: true},
        })
      )
        .reverse()
        .map((c) => c.commentStripped?.trim() || semHtml(c.commentHtml ?? ""))
        .filter(Boolean)
    : [];

  const anexos = chamado ? await carregarAnexos(pedido.cfg, chamado.id) : [];
  const rotulos = chamado?.labels.map((l) => l.label.name) ?? [];
  const daTela = pedido.informado ?? {};

  const contexto: ContextoIa = {
    tipo: tipoDoChamado(pedido.tipo ?? textoInformado(daTela.tipo, LIMITE.nome), rotulos),
    projeto: projeto?.name ?? textoInformado(daTela.projeto, LIMITE.nome),
    entidade: chamado?.entity?.name ?? entidadeInformada?.name ?? textoInformado(daTela.entidade, LIMITE.nome),
    comentarios: comentarios.length ? comentarios : comentariosInformados(daTela.comentarios),
    anexos,
  };

  // Do chamado salvo quando ele existe; do que está na tela enquanto não existe.
  if (partes.titulo) {
    const titulo = chamado?.name?.trim() || textoInformado(daTela.titulo, LIMITE.titulo);
    if (titulo) contexto.titulo = titulo;
  }
  if (partes.descricao) {
    const salva = chamado ? chamado.descriptionStripped?.trim() || semHtml(chamado.descriptionHtml ?? "") : "";
    const descricao = salva || textoInformado(daTela.descricao, LIMITE.descricao);
    if (descricao) contexto.descricao = descricao;
  }

  return contexto;
}
