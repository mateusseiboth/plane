/**
 * Os arquivos que o cliente anexa à solicitação, no portal.
 *
 * Dois compromissos guiam o arquivo inteiro:
 *
 *  1. **Um caminho de arquivo só.** O anexo do portal é o MESMO anexo que a
 *     equipe já vê no chamado: `file_assets` para o binário (via `@utils/storage`,
 *     que grava no S3 configurado ou no disco) e `issue_attachments` para o
 *     vínculo com o chamado. Nada de segunda pasta, segunda tabela ou segundo
 *     visualizador.
 *  2. **Quem envia é gente de fora.** Sem conta no Plane, sem cadeira, sem
 *     vínculo com o time. Então nada do que o navegador afirma sobre o arquivo
 *     vale por si: a extensão, o tipo informado e os primeiros bytes precisam
 *     contar a mesma história, e o tipo que guardamos é o NOSSO, nunca o que
 *     veio no formulário.
 *
 * O que fica de fora é tão importante quanto o que entra: SVG e HTML executam
 * script no navegador de quem abrir, então são recusados mesmo sendo "só uma
 * imagem" e "só um texto".
 */

import { randomUUID } from "crypto";
import prisma from "@db";
import { saveAsset, serveAsset } from "@utils/storage";

export type FamiliaDeAnexo = "imagem" | "video" | "audio" | "documento";

/**
 * Os tetos.
 *
 * 25 MB cobre foto de celular, captura de tela e PDF de ofício com folga.
 * Vídeo tem faixa própria (100 MB) porque a gravação de tela do problema é
 * justamente o anexo mais útil que um cliente manda — e a que mais pesa. Acima
 * disso o caminho é outro (link do Drive na descrição), não um upload de 500 MB
 * atravessando o proxy.
 */
export const LIMITES_DE_ANEXO = {
  /** Arquivos por solicitação. */
  porSolicitacao: 5,
  tamanho: {
    padrao: 25 * 1024 * 1024,
    video: 100 * 1024 * 1024,
  },
  /** Envios por conta, para o portal não virar hospedagem de arquivo. */
  envios: { max: 20, janelaMs: 10 * 60_000 },
} as const;

/** Sobra para o cabeçalho do multipart em cima do maior arquivo aceito. */
export const TETO_DO_CORPO = LIMITES_DE_ANEXO.tamanho.video + 1024 * 1024;

/** Deslocamento e bytes (em hexa) que o formato sempre traz no começo. */
type Assinatura = readonly [number, string];

type Formato = {
  readonly mime: string;
  readonly extensoes: readonly string[];
  readonly familia: FamiliaDeAnexo;
  /** Outros tipos que o navegador costuma informar para o mesmo arquivo. */
  readonly apelidos?: readonly string[];
  readonly assinaturas?: readonly Assinatura[];
  /** Conferência própria, para formato que não tem assinatura (texto puro). */
  readonly confere?: (inicio: Uint8Array) => boolean;
};

/** Texto de verdade: sem byte nulo e sem cara de marcação. */
function pareceTexto(inicio: Uint8Array): boolean {
  if (inicio.includes(0)) return false;
  const comeco = new TextDecoder("utf-8", { fatal: false }).decode(inicio.slice(0, 64)).trimStart();
  return !comeco.startsWith("<");
}

const FORMATOS: readonly Formato[] = [
  // ── Imagem ────────────────────────────────────────────────────────────────
  { mime: "image/png", extensoes: ["png"], familia: "imagem", assinaturas: [[0, "89504e470d0a1a0a"]] },
  {
    mime: "image/jpeg",
    extensoes: ["jpg", "jpeg"],
    familia: "imagem",
    apelidos: ["image/jpg"],
    assinaturas: [[0, "ffd8ff"]],
  },
  {
    mime: "image/gif",
    extensoes: ["gif"],
    familia: "imagem",
    assinaturas: [
      [0, "474946383761"],
      [0, "474946383961"],
    ],
  },
  // RIFF no começo e "WEBP" no oitavo byte.
  { mime: "image/webp", extensoes: ["webp"], familia: "imagem", assinaturas: [[8, "57454250"]] },
  {
    mime: "image/heic",
    extensoes: ["heic", "heif"],
    familia: "imagem",
    apelidos: ["image/heif"],
    assinaturas: [
      [4, "6674797068656963"],
      [4, "667479706d696631"],
      [4, "6674797068656978"],
      [4, "667479706d736631"],
    ],
  },
  { mime: "image/bmp", extensoes: ["bmp"], familia: "imagem", assinaturas: [[0, "424d"]] },

  // ── Vídeo ─────────────────────────────────────────────────────────────────
  { mime: "video/mp4", extensoes: ["mp4", "m4v"], familia: "video", assinaturas: [[4, "66747970"]] },
  { mime: "video/quicktime", extensoes: ["mov"], familia: "video", assinaturas: [[4, "66747970"]] },
  { mime: "video/webm", extensoes: ["webm"], familia: "video", assinaturas: [[0, "1a45dfa3"]] },
  { mime: "video/x-matroska", extensoes: ["mkv"], familia: "video", assinaturas: [[0, "1a45dfa3"]] },
  { mime: "video/3gpp", extensoes: ["3gp"], familia: "video", assinaturas: [[4, "66747970"]] },

  // ── Áudio ─────────────────────────────────────────────────────────────────
  {
    mime: "audio/mpeg",
    extensoes: ["mp3"],
    familia: "audio",
    apelidos: ["audio/mp3"],
    assinaturas: [
      [0, "494433"],
      [0, "fffb"],
      [0, "fff3"],
      [0, "fff2"],
      [0, "fffa"],
    ],
  },
  { mime: "audio/ogg", extensoes: ["ogg", "oga"], familia: "audio", assinaturas: [[0, "4f676753"]] },
  {
    mime: "audio/wav",
    extensoes: ["wav"],
    familia: "audio",
    apelidos: ["audio/x-wav", "audio/wave"],
    assinaturas: [[8, "57415645"]],
  },
  { mime: "audio/mp4", extensoes: ["m4a"], familia: "audio", assinaturas: [[4, "66747970"]] },

  // ── Documento ─────────────────────────────────────────────────────────────
  { mime: "application/pdf", extensoes: ["pdf"], familia: "documento", assinaturas: [[0, "255044462d"]] },
  { mime: "text/plain", extensoes: ["txt", "log"], familia: "documento", confere: pareceTexto },
  {
    mime: "text/csv",
    extensoes: ["csv"],
    familia: "documento",
    apelidos: ["application/csv", "text/plain"],
    confere: pareceTexto,
  },
  // Os formatos XML da Office são ZIP por dentro (PK\x03\x04); os antigos (.doc,
  // .xls) e os com macro (.docm) ficam de fora — carregam código.
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensoes: ["docx"],
    familia: "documento",
    assinaturas: [[0, "504b0304"]],
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extensoes: ["xlsx"],
    familia: "documento",
    assinaturas: [[0, "504b0304"]],
  },
] as const;

const POR_EXTENSAO: ReadonlyMap<string, Formato> = new Map(
  FORMATOS.flatMap((formato) => formato.extensoes.map((extensao) => [extensao, formato] as const))
);

/** O que o cliente vê na tela quando erra o tipo — a mesma lista de cima, em português. */
export const TIPOS_EM_PORTUGUES = "imagem, vídeo, áudio, PDF, texto, planilha ou documento do Word";

/** Bytes suficientes para reconhecer qualquer assinatura da tabela. */
const BYTES_DE_RECONHECIMENTO = 64;

export type ArquivoRecebido = {
  nome: string;
  tipoInformado: string;
  tamanho: number;
  inicio: Uint8Array;
};

export type ConferenciaDoArquivo =
  | { aceito: true; nome: string; tipo: string; familia: FamiliaDeAnexo }
  | { aceito: false; situacao: 400 | 413 | 415; detalhe: string };

/** Nome de arquivo sem caminho, sem controle e do tamanho de um nome. */
export function nomeSeguro(bruto: unknown): string {
  const semCaminho =
    String(bruto ?? "")
      .split(/[\\/]/)
      .pop() ?? "";
  const limpo = semCaminho
    // oxlint-disable-next-line no-control-regex -- é o ponto: caractere de controle sai fora.
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return limpo || "arquivo";
}

function extensaoDe(nome: string): string {
  const partes = nome.toLowerCase().split(".");
  return partes.length > 1 ? partes.pop()! : "";
}

function hexDe(bytes: Uint8Array, deslocamento: number, quantidade: number): string {
  return Array.from(bytes.slice(deslocamento, deslocamento + quantidade))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Os primeiros bytes confirmam o formato? */
function assinaturaConfere(formato: Formato, inicio: Uint8Array): boolean {
  if (formato.confere) return formato.confere(inicio);
  const assinaturas = formato.assinaturas ?? [];
  if (!assinaturas.length) return true;
  return assinaturas.some(([deslocamento, esperado]) => hexDe(inicio, deslocamento, esperado.length / 2) === esperado);
}

/** O tipo informado pelo navegador combina com o formato da extensão? */
function tipoInformadoConfere(formato: Formato, informado: string): boolean {
  const tipo = informado.toLowerCase().split(";")[0]!.trim();
  // Sem palpite nenhum: o navegador não reconheceu, e quem decide é a extensão.
  if (!tipo || tipo === "application/octet-stream") return true;
  return tipo === formato.mime || (formato.apelidos ?? []).includes(tipo);
}

function tetoDe(familia: FamiliaDeAnexo): number {
  return familia === "video" ? LIMITES_DE_ANEXO.tamanho.video : LIMITES_DE_ANEXO.tamanho.padrao;
}

const emMegabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));

/**
 * O arquivo pode entrar?
 *
 * A ordem das perguntas é a ordem do custo: o que dá para recusar sem olhar o
 * conteúdo vem antes.
 */
export function conferirArquivo(arquivo: ArquivoRecebido): ConferenciaDoArquivo {
  const nome = nomeSeguro(arquivo.nome);
  if (arquivo.tamanho <= 0) return { aceito: false, situacao: 400, detalhe: "O arquivo chegou vazio." };

  const formato = POR_EXTENSAO.get(extensaoDe(nome));
  const recusaDeTipo = {
    aceito: false as const,
    situacao: 415 as const,
    detalhe: `Tipo de arquivo não aceito. Envie ${TIPOS_EM_PORTUGUES}.`,
  };
  if (!formato) return recusaDeTipo;
  if (!tipoInformadoConfere(formato, arquivo.tipoInformado)) return recusaDeTipo;

  const teto = tetoDe(formato.familia);
  if (arquivo.tamanho > teto) {
    return {
      aceito: false,
      situacao: 413,
      detalhe:
        `O arquivo passa do limite de ${emMegabytes(teto)} MB. ` +
        `Vídeo vai até ${emMegabytes(LIMITES_DE_ANEXO.tamanho.video)} MB; ` +
        `os demais, até ${emMegabytes(LIMITES_DE_ANEXO.tamanho.padrao)} MB.`,
    };
  }

  // Último e mais caro: o conteúdo desmente a extensão?
  if (!assinaturaConfere(formato, arquivo.inicio)) {
    return {
      aceito: false,
      situacao: 415,
      detalhe: "O conteúdo do arquivo não corresponde à extensão dele.",
    };
  }

  return { aceito: true, nome, tipo: formato.mime, familia: formato.familia };
}

// ── Guarda e leitura ─────────────────────────────────────────────────────────

/** O anexo como o cliente o vê: nome, tamanho e quando enviou. */
export type AnexoDoPortal = {
  id: string;
  nome: string;
  tipo: string;
  tamanho: number;
  enviado_em: string | null;
};

/** Entidade 2 = chamado, a mesma que o upload da equipe usa (ver modules/asset). */
const ENTIDADE_CHAMADO = 2;
const ORIGEM = "portal";

/** O registro de `issue_attachments` no formato que o portal mostra. */
export function anexoDoChamado(anexo: { id: string; attributes: unknown; createdAt: Date | null }): AnexoDoPortal {
  const atributos = (anexo.attributes ?? {}) as Record<string, unknown>;
  return {
    id: anexo.id,
    nome: typeof atributos.name === "string" ? atributos.name : "arquivo",
    tipo: typeof atributos.type === "string" ? atributos.type : "application/octet-stream",
    tamanho: typeof atributos.size === "number" ? atributos.size : 0,
    enviado_em: anexo.createdAt?.toISOString() ?? null,
  };
}

export async function anexosDaSolicitacao(issueId: string): Promise<AnexoDoPortal[]> {
  const anexos = await prisma.issueAttachment.findMany({
    where: { issueId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, attributes: true, createdAt: true },
  });
  return anexos.map(anexoDoChamado);
}

export function contarAnexos(issueId: string): Promise<number> {
  return prisma.issueAttachment.count({ where: { issueId, deletedAt: null } });
}

/** Bytes que bastam para reconhecer o formato, sem carregar o arquivo inteiro. */
export async function primeirosBytes(arquivo: Blob): Promise<Uint8Array> {
  return new Uint8Array(await arquivo.slice(0, BYTES_DE_RECONHECIMENTO).arrayBuffer());
}

/**
 * Grava o binário e amarra o anexo ao chamado.
 *
 * A chave no storage é o id do `file_assets`, exatamente como no upload da
 * equipe — é o que faz a rota `/assets/v2/.../:asset_id/` servir este arquivo
 * sem nenhum caso especial para o portal.
 */
export async function guardarAnexo(dados: {
  issueId: string;
  projectId: string;
  workspaceId: string;
  arquivo: Blob;
  nome: string;
  tipo: string;
  tamanho: number;
}): Promise<AnexoDoPortal> {
  const id = randomUUID();
  const atributos = { name: dados.nome, type: dados.tipo, size: dados.tamanho, origem: ORIGEM };

  await prisma.fileAsset.create({
    data: {
      id,
      workspaceId: dados.workspaceId,
      projectId: dados.projectId,
      entityType: ENTIDADE_CHAMADO,
      entityId: dados.issueId,
      asset: `issues/${dados.issueId}/portal/${id}`,
      size: dados.tamanho,
      mimeType: dados.tipo,
      attributes: atributos,
      isUploaded: false,
    },
  });

  await saveAsset(id, dados.arquivo);
  await prisma.fileAsset.update({ where: { id }, data: { isUploaded: true } });

  const anexo = await prisma.issueAttachment.create({
    data: {
      issueId: dados.issueId,
      workspaceId: dados.workspaceId,
      projectId: dados.projectId,
      // O id do file_asset: é ele que a rota de download da equipe resolve.
      asset: id,
      attributes: atributos,
      externalSource: ORIGEM,
    },
    select: { id: true, attributes: true, createdAt: true },
  });
  return anexoDoChamado(anexo);
}

/**
 * O arquivo de volta para o cliente, sempre como download.
 *
 * Nunca inline: o portal é público, e servir conteúdo enviado de fora na mesma
 * origem da página é convite para transformar um anexo em página nossa.
 */
export async function servirAnexoDoCliente(issueId: string, anexoId: string): Promise<Response | null> {
  const anexo = await prisma.issueAttachment.findFirst({
    where: { id: anexoId, issueId, deletedAt: null },
    select: { id: true, asset: true, attributes: true },
  });
  if (!anexo) return null;
  const { nome, tipo } = anexoDoChamado({ ...anexo, createdAt: null });
  const resposta = await serveAsset(anexo.asset, tipo);
  if (!resposta) return null;

  const cabecalhos = new Headers(resposta.headers);
  const nomeAscii = nome.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  cabecalhos.set(
    "Content-Disposition",
    `attachment; filename="${nomeAscii}"; filename*=UTF-8''${encodeURIComponent(nome)}`
  );
  cabecalhos.set("X-Content-Type-Options", "nosniff");
  cabecalhos.set("Cache-Control", "private, max-age=0, no-store");
  return new Response(resposta.body, { status: resposta.status, headers: cabecalhos });
}
