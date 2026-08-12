/**
 * Sincronização idempotente dos vínculos N:N de um chamado — etiquetas
 * (issue_labels) e responsáveis (issue_assignees).
 *
 * Essas tabelas usam exclusão lógica e a chave única inclui a coluna apagada:
 * (issue_id, label_id, deleted_at). No Postgres NULL é distinto de NULL, o que
 * derruba duas suposições do código antigo:
 *
 *  1. carimbar TODAS as linhas do chamado com o mesmo `deleted_at` para depois
 *     recriar as escolhidas colide assim que existem duas linhas da mesma
 *     etiqueta (a viva e um resíduo de troca anterior): as duas viram o mesmo
 *     par (issue_id, label_id, deleted_at). Era o `{"detail":"Registro já
 *     existe."}` que aparecia na terceira etiqueta e, dali em diante, travava
 *     também a remoção — toda troca passa pelo mesmo caminho;
 *  2. `createMany({skipDuplicates: true})` não deduplica linhas vivas, porque
 *     ON CONFLICT não enxerga conflito entre dois NULL. Cada troca deixava um
 *     resíduo a mais na tabela.
 *
 * A regra aqui é manter NO MÁXIMO UMA linha por (chamado, alvo): a linha
 * existente é reaproveitada — restaurada quando o vínculo volta, carimbada
 * quando sai — e linhas redundantes de trocas anteriores são descartadas. Com
 * isso, aplicar o mesmo conjunto duas vezes dá exatamente o mesmo resultado e
 * remover funciona sempre.
 */
import type {Prisma} from "@prisma/client";
import prisma from "@db";

/** Aceita tanto o cliente global quanto o de dentro de uma transação. */
export type ClienteDeVinculos = Prisma.TransactionClient | typeof prisma;

export type EscopoDoVinculo = {
  issueId: string;
  workspaceId: string;
  projectId: string;
};

type TabelaDeVinculos = {
  findMany: (args: any) => Promise<any[]>;
  createMany: (args: any) => Promise<unknown>;
  updateMany: (args: any) => Promise<unknown>;
  deleteMany: (args: any) => Promise<unknown>;
};

type EstrategiaDeVinculo = {
  /** Coluna que aponta para o outro lado do vínculo. */
  campo: "labelId" | "assigneeId";
  tabela: (cliente: ClienteDeVinculos) => TabelaDeVinculos;
};

type LinhaDeVinculo = {id: string; alvoId: string; deletedAt: Date | null};

const ESTRATEGIAS = {
  etiqueta: {
    campo: "labelId",
    tabela: (cliente) => cliente.issueLabel as unknown as TabelaDeVinculos,
  },
  responsavel: {
    campo: "assigneeId",
    tabela: (cliente) => cliente.issueAssignee as unknown as TabelaDeVinculos,
  },
} satisfies Record<string, EstrategiaDeVinculo>;

function agruparPorAlvo(linhas: LinhaDeVinculo[]): Map<string, LinhaDeVinculo[]> {
  const grupos = new Map<string, LinhaDeVinculo[]>();
  for (const linha of linhas) {
    const grupo = grupos.get(linha.alvoId);
    if (grupo) {
      grupo.push(linha);
      continue;
    }
    grupos.set(linha.alvoId, [linha]);
  }
  return grupos;
}

/**
 * Entre as linhas do mesmo alvo, a que fica é a viva; sem nenhuma viva, fica a
 * apagada mais recente. As demais são resíduo e são descartadas.
 */
function linhaPrincipal(linhas: LinhaDeVinculo[]): LinhaDeVinculo {
  const viva = linhas.find((l) => l.deletedAt === null);
  if (viva) return viva;
  return linhas.reduce((maisNova, atual) =>
    (atual.deletedAt?.getTime() ?? 0) > (maisNova.deletedAt?.getTime() ?? 0) ? atual : maisNova,
  );
}

type Plano = {
  criar: string[];
  restaurar: string[];
  carimbar: string[];
  descartar: string[];
};

function planejar(existentes: LinhaDeVinculo[], desejados: Set<string>): Plano {
  const plano: Plano = {criar: [], restaurar: [], carimbar: [], descartar: []};
  const grupos = agruparPorAlvo(existentes);

  for (const [alvoId, linhas] of grupos) {
    const principal = linhaPrincipal(linhas);
    // Resíduos nunca sobrevivem: são eles que colidem na próxima troca.
    plano.descartar.push(...linhas.filter((l) => l.id !== principal.id).map((l) => l.id));

    if (desejados.has(alvoId)) {
      if (principal.deletedAt) plano.restaurar.push(principal.id);
      continue;
    }
    if (!principal.deletedAt) plano.carimbar.push(principal.id);
  }

  for (const alvoId of desejados) {
    if (!grupos.has(alvoId)) plano.criar.push(alvoId);
  }
  return plano;
}

async function executar(
  estrategia: EstrategiaDeVinculo,
  {issueId, workspaceId, projectId}: EscopoDoVinculo,
  plano: Plano,
  tabela: TabelaDeVinculos,
) {
  // Os resíduos saem primeiro: é o que garante que o carimbo abaixo não
  // esbarre em outra linha do mesmo alvo já carimbada.
  if (plano.descartar.length) await tabela.deleteMany({where: {id: {in: plano.descartar}}});
  if (plano.restaurar.length) await tabela.updateMany({where: {id: {in: plano.restaurar}}, data: {deletedAt: null}});
  if (plano.carimbar.length) await tabela.updateMany({where: {id: {in: plano.carimbar}}, data: {deletedAt: new Date()}});
  if (plano.criar.length) {
    await tabela.createMany({
      data: plano.criar.map((alvoId) => ({issueId, [estrategia.campo]: alvoId, workspaceId, projectId})),
    });
  }
}

async function sincronizar(
  estrategia: EstrategiaDeVinculo,
  escopo: EscopoDoVinculo,
  alvos: string[],
  cliente: ClienteDeVinculos,
) {
  const tabela = estrategia.tabela(cliente);
  const linhas = await tabela.findMany({where: {issueId: escopo.issueId}, select: {id: true, deletedAt: true, [estrategia.campo]: true}});
  const existentes: LinhaDeVinculo[] = linhas.map((l) => ({id: l.id, alvoId: l[estrategia.campo], deletedAt: l.deletedAt}));

  await executar(estrategia, escopo, planejar(existentes, new Set(alvos)), tabela);
}

/** Deixa o chamado exatamente com estas etiquetas. Repetir a chamada não muda nada. */
export function sincronizarEtiquetas(escopo: EscopoDoVinculo, etiquetas: string[], cliente: ClienteDeVinculos = prisma) {
  return sincronizar(ESTRATEGIAS.etiqueta, escopo, etiquetas, cliente);
}

/** Deixa o chamado exatamente com estes responsáveis. Repetir a chamada não muda nada. */
export function sincronizarResponsaveis(escopo: EscopoDoVinculo, responsaveis: string[], cliente: ClienteDeVinculos = prisma) {
  return sincronizar(ESTRATEGIAS.responsavel, escopo, responsaveis, cliente);
}
