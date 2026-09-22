/**
 * Contrato JSON da visita técnica (snake_case, como o resto da API).
 */
import { entityContactDto } from "@modules/entity-contact";
import { isChamadoAberto } from "@modules/technical-visit/visit-closing";
import { isVisitOverdue } from "@modules/technical-visit/visit-filters";
import { getVisitStatusLabel } from "@modules/technical-visit/visit-status";
import { readIds } from "@modules/technical-visit/visit.dao";

const isoDate = (d: Date | null | undefined) => (d ? d.toISOString() : null);

type Tecnico = { id: string; displayName: string; firstName: string; lastName: string } | null | undefined;

const tecnicoDto = (t: Tecnico) =>
  t
    ? {
        id: t.id,
        display_name: t.displayName,
        first_name: t.firstName,
        last_name: t.lastName,
      }
    : null;

/** Código do chamado como aparece na tela (`ESIC-12`). */
export const buildCodigoDoChamado = (issue: { sequenceId: number; project?: { identifier: string } | null }) =>
  `${issue.project?.identifier ?? ""}-${issue.sequenceId}`;

const chamadoDto = (issue: any) => ({
  id: issue.id,
  name: issue.name,
  sequence_id: issue.sequenceId,
  project_id: issue.projectId,
  project_identifier: issue.project?.identifier ?? null,
  code: buildCodigoDoChamado(issue),
  state: issue.state ? { name: issue.state.name, group: issue.state.group } : null,
  is_open: isChamadoAberto(issue.state?.group),
});

const anexoDto = (anexo: any) => {
  const atributos = (anexo.attributes ?? {}) as Record<string, unknown>;
  return {
    id: anexo.id,
    name: (atributos.name as string) ?? "arquivo",
    size: anexo.size ?? 0,
    mime_type: anexo.mimeType ?? null,
    uploaded_by: (atributos.uploaded_by as string) ?? null,
    created_at: isoDate(anexo.createdAt),
  };
};

export type DetalhesDaVisita = {
  projects: { id: string; name: string; identifier: string }[];
  modules: { id: string; name: string; projectId: string }[];
  anexos: unknown[];
};

const detalhesDto = (detalhes: DetalhesDaVisita) => ({
  projects: detalhes.projects,
  modules: detalhes.modules.map((m) => ({ id: m.id, name: m.name, project_id: m.projectId })),
  attachments: detalhes.anexos.map(anexoDto),
});

export function serializeVisit(v: any, agora: Date, detalhes?: DetalhesDaVisita) {
  const issues = (v.visitIssues ?? []).map((link: any) => chamadoDto(link.issue));
  return {
    id: v.id,
    workspace: v.workspaceId,
    technician_id: v.technicianId ?? null,
    technician2_id: v.technician2Id ?? null,
    technician: tecnicoDto(v.technician),
    technician2: tecnicoDto(v.technician2),
    entity_id: v.entityId ?? null,
    entity: v.entity ? { id: v.entity.id, name: v.entity.name, city: v.entity.city ?? null } : null,
    // Texto livre herdado do SAC: continua valendo ao lado dos responsáveis
    // cadastrados, porque não dá para reconstituí-lo em pessoas.
    contacts: v.contacts ?? null,
    contact_records: (v.contactRecords ?? [])
      .filter((r: any) => r.contact && !r.contact.deletedAt)
      .map((r: any) => entityContactDto(r.contact)),
    city: v.city ?? null,
    scheduled_date: isoDate(v.scheduledDate),
    started_at: isoDate(v.startedAt),
    finished_at: isoDate(v.finishedAt),
    status: v.status,
    status_label: getVisitStatusLabel(v.status),
    is_overdue: isVisitOverdue(v, agora),
    period: v.period ?? null,
    mot_update: v.motUpdate,
    mot_bug_fix: v.motBugFix,
    mot_training: v.motTraining,
    mot_improvement: v.motImprovement,
    mot_commercial: v.motCommercial,
    mot_other: v.motOther,
    mot_other_description: v.motOtherDescription ?? null,
    summary: v.summary ?? null,
    conclusion: v.conclusion ?? null,
    project_ids: readIds(v.projectIds),
    module_ids: readIds(v.moduleIds),
    issue_ids: issues.map((i: { id: string }) => i.id),
    issues,
    visit_number: v.visitNumber ?? null,
    created_by: v.createdById ?? null,
    created_at: isoDate(v.createdAt),
    updated_at: isoDate(v.updatedAt),
    ...(detalhes ? detalhesDto(detalhes) : {}),
  };
}
