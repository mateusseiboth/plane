/**
 * Tradução do pós-atendimento do SAC para `pos_atendimentos`. Puro: o script
 * `scripts/import-pos-atendimento.ts` lê o MySQL (ou os comentários `pos-N` que o
 * importador antigo gravou) e grava; aqui só se decide o quê.
 */
import { CLASSIFICACAO, EXPECTATIVA, MEIO_CONTATO, isCodigoDe } from "@modules/pos-atendimento/pos-atendimento.codes";

/** Linha da tabela `posatendimento` do SAC. */
export type LinhaDoSac = {
  posatendimento_id: number;
  posatendimento_chamados_id: number;
  posatendimento_usuarios_id: number | null;
  posatendimento_data: Date | string | null;
  posatendimento_tipo: number | null;
  posatendimento_observacao: string | null;
  posatendimento_solucao: number | null;
  posatendimento_satisfacao: number | null;
  posatendimento_verificado: number | null;
  posatendimento_usuarios_id_qualidade: number | null;
  pos_atendimento_observacao_qualidade: string | null;
};

/** Comentário `pos-N` gravado pelo §12 do importador antigo (`migrate-sac.ts`). */
export type ComentarioPos = {
  issueId: string;
  externalId: string | null;
  actorId: string | null;
  createdAt: Date;
  commentStripped: string | null;
  commentJson: unknown;
};

const PREFIXO_QUALIDADE = "Qualidade: ";

const readCodigo = <T extends Record<string, number>>(tabela: T, valor: unknown): T[keyof T] | null =>
  isCodigoDe(tabela, valor) ? valor : null;

/** Texto do legado: sem tags, sem espaço sobrando, quebra de linha Unix. */
export const normalizeTextoLegado = (valor: unknown): string =>
  String(valor ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((linha) => linha.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

const toDate = (valor: Date | string | null): Date => {
  const data = valor ? new Date(valor) : new Date(0);
  return Number.isNaN(data.getTime()) ? new Date(0) : data;
};

/**
 * Linha do MySQL → registro. O legado não guarda QUANDO foi verificado: o
 * verificado fica com a data do próprio contato.
 */
export function mapLinhaDoSac(linha: LinhaDoSac) {
  const recordedAt = toDate(linha.posatendimento_data);
  const isVerificado = linha.posatendimento_verificado === 1;
  return {
    legacyId: linha.posatendimento_id,
    expectativa: readCodigo(EXPECTATIVA, linha.posatendimento_solucao),
    classificacao: readCodigo(CLASSIFICACAO, linha.posatendimento_satisfacao),
    meioContato: readCodigo(MEIO_CONTATO, linha.posatendimento_tipo),
    observacao: normalizeTextoLegado(linha.posatendimento_observacao),
    recordedAt,
    verifiedAt: isVerificado ? recordedAt : null,
    verificationComment: normalizeTextoLegado(linha.pos_atendimento_observacao_qualidade) || null,
    legacyRecordedBy: linha.posatendimento_usuarios_id || null,
    legacyVerifiedBy: linha.posatendimento_usuarios_id_qualidade || null,
  };
}

export type PosDoSac = ReturnType<typeof mapLinhaDoSac>;

type MetadataDoComentario = { tipo?: unknown; satisfacao?: unknown; verificado?: unknown };

const readMetadata = (json: unknown): MetadataDoComentario =>
  ((json as { metadata?: MetadataDoComentario } | null)?.metadata ?? {}) as MetadataDoComentario;

/**
 * Comentário `pos-N` → registro, sem o MySQL. A 1ª linha é o cabeçalho que o
 * importador escreveu; a "Qualidade: ..." é a observação da verificação; o resto é
 * a observação do contato. A expectativa foi gravada como booleano e se perdeu:
 * fica nula.
 */
export function mapComentarioPos(comentario: ComentarioPos) {
  const numero = /^pos-(\d+)$/.exec(comentario.externalId ?? "");
  if (!numero) return null;
  const meta = readMetadata(comentario.commentJson);
  const [, ...linhas] = (comentario.commentStripped ?? "").split("\n");
  const qualidade = linhas.find((l) => l.startsWith(PREFIXO_QUALIDADE));
  return {
    legacyId: Number(numero[1]),
    issueId: comentario.issueId,
    expectativa: null,
    classificacao: readCodigo(CLASSIFICACAO, meta.satisfacao),
    meioContato: readCodigo(MEIO_CONTATO, meta.tipo),
    observacao: normalizeTextoLegado(linhas.filter((l) => l !== qualidade).join("\n")),
    recordedById: comentario.actorId,
    recordedAt: comentario.createdAt,
    verifiedAt: meta.verificado === true ? comentario.createdAt : null,
    verificationComment: qualidade ? normalizeTextoLegado(qualidade.slice(PREFIXO_QUALIDADE.length)) || null : null,
  };
}

export type PosDoComentario = NonNullable<ReturnType<typeof mapComentarioPos>>;

/** chamado do SAC → issue; chamado de visita cujo pós foi feito pela visita → visita. */
export type MapasDoSac = { chamados: Map<number, string>; visitas: Map<number, string> };

export function resolveAlvoDoSac(
  chamadoId: number,
  { chamados, visitas }: MapasDoSac
): { issueId: string } | { visitId: string } | null {
  const visitId = visitas.get(chamadoId);
  if (visitId) return { visitId };
  const issueId = chamados.get(chamadoId);
  return issueId ? { issueId } : null;
}

/**
 * O SAC deixou gravar mais de um pós por chamado (220 linhas). Aqui é um por
 * chamado ou visita: fica o mais recente (maior id), os outros são relatados.
 */
export function keepOnePorAlvo<T extends { legacyId: number; alvo: string }>(itens: T[]) {
  const ordenados = itens.toSorted((a, b) => b.legacyId - a.legacyId);
  const vistos = new Set<string>();
  const mantidos: T[] = [];
  const descartados: T[] = [];
  ordenados.forEach((item) => {
    const destino = vistos.has(item.alvo) ? descartados : mantidos;
    destino.push(item);
    vistos.add(item.alvo);
  });
  return { mantidos, descartados };
}
