/**
 * A solicitação de que o chamado nasceu, como o detalhe do chamado mostra.
 *
 * Solicitação e chamado são a MESMA linha de `issues`: a triagem só acrescenta
 * o vínculo em `intake_issues` (ver `createSolicitacao` em @utils/intake e o
 * portal em modules/portal/solicitacoes). O chamado "veio de uma solicitação"
 * quando esse vínculo existe e está vivo.
 *
 * O texto ORIGINAL é o da versão mais antiga da descrição: cada versão guarda o
 * estado de ANTES de uma edição (ver @utils/versoes-da-descricao). Chamado sem
 * versão nunca teve a descrição reescrita, então o texto atual é o original, e
 * o painel diz isso. A prioridade pedida sai da primeira troca de prioridade
 * do histórico pelo mesmo raciocínio.
 *
 * As consultas vivem no include do GET do chamado (`ISSUE_BY_ID_INCLUDE` em
 * @utils/serialize); aqui só regra pura.
 */

export type OrigemDaSolicitacao = "chat" | "portal" | "app";

/** `external_source` do chamado vence `intake_issues.source`: o chat abre pela triagem do time ("in-app"). */
const ORIGEM_POR_MARCA: Record<string, OrigemDaSolicitacao> = { chat: "chat", portal: "portal" };

export function resolveOrigemDaSolicitacao(marcas: {
  source: string | null;
  externalSource: string | null;
}): OrigemDaSolicitacao {
  return ORIGEM_POR_MARCA[marcas.externalSource ?? ""] ?? ORIGEM_POR_MARCA[marcas.source ?? ""] ?? "app";
}

type VinculoComATriagem = { deletedAt: Date | null };

export const hasSolicitacaoDeOrigem = (vinculos: VinculoComATriagem[] | undefined): boolean =>
  (vinculos ?? []).some((v) => !v.deletedAt);

export type TextoOriginal = { html: string; isTextoAtual: boolean };

export function pickTextoOriginal(
  versaoMaisAntiga: { descriptionHtml: string | null } | null | undefined,
  atual: string
): TextoOriginal {
  if (versaoMaisAntiga?.descriptionHtml) return { html: versaoMaisAntiga.descriptionHtml, isTextoAtual: false };
  return { html: atual, isTextoAtual: true };
}

export const pickPrioridadePedida = (
  primeiraTroca: { oldValue: string | null } | null | undefined,
  atual: string
): string => primeiraTroca?.oldValue ?? atual;

export type ChamadoComOrigem = {
  name: string;
  priority: string;
  descriptionHtml: string;
  externalSource: string | null;
  createdBy?: { displayName: string | null } | null;
  entity?: { name: string } | null;
  portalRequest?: { account: { name: string } | null } | null;
  moduleIssues?: Array<{ module: { name: string } | null }>;
  /** A versão mais antiga primeiro. */
  versions?: Array<{ descriptionHtml: string | null; name: string | null }>;
  /** As trocas de prioridade, a mais antiga primeiro. */
  activities?: Array<{ oldValue: string | null }>;
  intakeIssues?: Array<{ id: string; createdAt: Date; source: string; deletedAt: Date | null }>;
};

export type SolicitacaoDoChamado = {
  id: string;
  aberta_em: string;
  aberta_por: string | null;
  origem: OrigemDaSolicitacao;
  entidade: string | null;
  modulo: string | null;
  prioridade: string;
  titulo: string;
  descricao_html: string;
  is_texto_atual: boolean;
};

export function buildSolicitacaoDoChamado(chamado: ChamadoComOrigem): SolicitacaoDoChamado | null {
  const vinculo = (chamado.intakeIssues ?? []).find((v) => !v.deletedAt);
  if (!vinculo) return null;
  const versao = chamado.versions?.[0];
  const texto = pickTextoOriginal(versao, chamado.descriptionHtml);
  return {
    id: vinculo.id,
    aberta_em: vinculo.createdAt.toISOString(),
    aberta_por: chamado.createdBy?.displayName ?? chamado.portalRequest?.account?.name ?? null,
    origem: resolveOrigemDaSolicitacao({ source: vinculo.source, externalSource: chamado.externalSource }),
    entidade: chamado.entity?.name ?? null,
    modulo: chamado.moduleIssues?.find((m) => m.module)?.module?.name ?? null,
    prioridade: pickPrioridadePedida(chamado.activities?.[0], chamado.priority),
    titulo: (texto.isTextoAtual ? null : versao?.name) ?? chamado.name,
    descricao_html: texto.html,
    is_texto_atual: texto.isTextoAtual,
  };
}
