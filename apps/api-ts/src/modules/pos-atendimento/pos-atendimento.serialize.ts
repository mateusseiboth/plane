/** Contrato snake_case do pós-atendimento (`TPosAtendimento` / `TPosFilaItem` no web). */
import {
  POS_ORIGEM,
  POS_SITUACAO_LABELS,
  getClassificacaoLabel,
  getExpectativaLabel,
  getMeioContatoLabel,
  getProblemaResolvidoLabel,
} from "@modules/pos-atendimento/pos-atendimento.codes";
import type { IssueItemRow, PosPessoa, PosRow, VisitItemRow } from "@modules/pos-atendimento/pos-atendimento.dao";
import { getConcluidoEm, getSituacao } from "@modules/pos-atendimento/pos-atendimento.rules";
import { formatNumeroDoChamado } from "@utils/numero-do-chamado";

export type PessoaDto = { id: string; display_name: string };
export type SistemaDto = { id: string; name: string; identifier: string };

export type PessoasPorId = Map<string, PessoaDto>;

export const serializePessoa = (p: PosPessoa): PessoaDto => ({
  id: p.id,
  display_name: p.displayName || `${p.firstName} ${p.lastName}`.trim(),
});

const findPessoa = (pessoas: PessoasPorId, id: string | null) => (id ? (pessoas.get(id) ?? null) : null);

export function serializePos(pos: PosRow, pessoas: PessoasPorId) {
  const situacao = getSituacao(pos);
  return {
    id: pos.id,
    origem: pos.visitId ? POS_ORIGEM.VISITA : POS_ORIGEM.CHAMADO,
    issue_id: pos.issueId,
    visit_id: pos.visitId,
    expectativa: pos.expectativa,
    expectativa_label: getExpectativaLabel(pos.expectativa),
    classificacao: pos.classificacao,
    classificacao_label: getClassificacaoLabel(pos.classificacao),
    problema_resolvido: pos.problemaResolvido,
    problema_resolvido_label: pos.problemaResolvido ? getProblemaResolvidoLabel(pos.problemaResolvido) : null,
    meio_contato: pos.meioContato,
    meio_contato_label: getMeioContatoLabel(pos.meioContato),
    observacao: pos.observacao,
    recorded_by: findPessoa(pessoas, pos.recordedById),
    recorded_at: pos.recordedAt.toISOString(),
    verified_by: findPessoa(pessoas, pos.verifiedById),
    verified_at: pos.verifiedAt?.toISOString() ?? null,
    verification_comment: pos.verificationComment,
    situacao,
    situacao_label: POS_SITUACAO_LABELS[situacao],
    is_legacy: pos.legacyId !== null,
  };
}

export type PosDto = ReturnType<typeof serializePos>;

const baseDoItem = (pos: PosRow | null, pessoas: PessoasPorId) => {
  const situacao = getSituacao(pos);
  return { situacao, situacao_label: POS_SITUACAO_LABELS[situacao], pos: pos ? serializePos(pos, pessoas) : null };
};

export function serializeIssueItem(row: IssueItemRow, pos: PosRow | null, pessoas: PessoasPorId) {
  return {
    origem: POS_ORIGEM.CHAMADO,
    id: row.id,
    code: `${row.project.identifier}-${row.sequenceId}`,
    ticket_number: formatNumeroDoChamado(row),
    title: row.name,
    project_id: row.projectId,
    sequence_id: row.sequenceId,
    sistemas: [row.project] as SistemaDto[],
    entity: row.entity,
    responsaveis: row.assignees.map((a) => serializePessoa(a.assignee)),
    concluded_at: getConcluidoEm(row).toISOString(),
    ...baseDoItem(pos, pessoas),
  };
}

const readProjectIds = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];

export const findVisitProjectIds = (row: { projectIds: unknown }) => readProjectIds(row.projectIds);

export function serializeVisitItem(
  row: VisitItemRow,
  pos: PosRow | null,
  pessoas: PessoasPorId,
  sistemas: Map<string, SistemaDto>
) {
  const tecnicos = [row.technician, row.technician2].filter((t): t is PosPessoa => !!t);
  return {
    origem: POS_ORIGEM.VISITA,
    id: row.id,
    code: row.visitNumber ?? "",
    ticket_number: null,
    title: row.visitNumber ? `Visita técnica ${row.visitNumber}` : "Visita técnica",
    project_id: null,
    sequence_id: null,
    sistemas: findVisitProjectIds(row)
      .map((id) => sistemas.get(id))
      .filter((s): s is SistemaDto => !!s),
    entity: row.entity,
    responsaveis: tecnicos.map(serializePessoa),
    concluded_at: getConcluidoEm(row).toISOString(),
    ...baseDoItem(pos, pessoas),
  };
}

export type PosFilaItemDto = ReturnType<typeof serializeIssueItem> | ReturnType<typeof serializeVisitItem>;
