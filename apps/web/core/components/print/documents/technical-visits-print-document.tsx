/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// local imports
import { PrintDocument } from "../print-document";
import { PrintHtml } from "../print-html";
import { PrintFields, PrintSection } from "../print-section";

export type TTechnicalVisitRecord = {
  id: string;
  visit_number?: number | string | null;
  status?: number;
  status_label?: string | null;
  city?: string | null;
  contacts?: string | null;
  period?: string | null;
  scheduled_date?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  summary?: string | null;
  conclusion?: string | null;
  mot_update?: boolean;
  mot_bug_fix?: boolean;
  mot_training?: boolean;
  mot_improvement?: boolean;
  mot_commercial?: boolean;
  mot_other?: boolean;
  mot_other_description?: string | null;
  entity?: { name?: string | null } | null;
};

const MOTIVATION_LABELS: { key: keyof TTechnicalVisitRecord; label: string }[] = [
  { key: "mot_update", label: "Atualização" },
  { key: "mot_bug_fix", label: "Correção de erro" },
  { key: "mot_training", label: "Treinamento" },
  { key: "mot_improvement", label: "Melhoria" },
  { key: "mot_commercial", label: "Comercial" },
  { key: "mot_other", label: "Outro" },
];

const CELL = "border border-neutral-300 px-2 py-1 align-top";

const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "—");

type ListProps = {
  visits: TTechnicalVisitRecord[];
  subtitle?: string | null;
  statusLabel?: string;
};

/** Documento de impressão da listagem de visitas técnicas. */
export const TechnicalVisitsPrintDocument = function TechnicalVisitsPrintDocument(props: ListProps) {
  const { visits, subtitle, statusLabel } = props;

  return (
    <PrintDocument
      title="Visitas técnicas"
      subtitle={subtitle}
      meta={[
        { label: "Situação", value: statusLabel },
        { label: "Total", value: `${visits.length} visita(s)` },
      ]}
    >
      {visits.length === 0 ? (
        <p className="py-4 text-xs">Nenhuma visita técnica encontrada.</p>
      ) : (
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-neutral-100 text-left">
              <th className={CELL}>Nº</th>
              <th className={CELL}>Entidade</th>
              <th className={CELL}>Cidade</th>
              <th className={CELL}>Agendada para</th>
              <th className={CELL}>Situação</th>
              <th className={CELL}>Contatos</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((visit) => (
              <tr key={visit.id}>
                <td className={CELL}>{visit.visit_number ?? "—"}</td>
                <td className={CELL}>{visit.entity?.name ?? "—"}</td>
                <td className={CELL}>{visit.city ?? "—"}</td>
                <td className={CELL}>{formatDateTime(visit.scheduled_date)}</td>
                <td className={CELL}>{visit.status_label ?? "—"}</td>
                <td className={CELL}>{visit.contacts ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PrintDocument>
  );
};

type DetailProps = {
  visit: TTechnicalVisitRecord;
};

/** Documento de impressão do relatório de uma visita técnica. */
export const TechnicalVisitPrintDocument = function TechnicalVisitPrintDocument(props: DetailProps) {
  const { visit } = props;

  const motivations = MOTIVATION_LABELS.filter(({ key }) => !!visit[key])
    .map(({ label }) => label)
    .concat(visit.mot_other && visit.mot_other_description ? [visit.mot_other_description] : [])
    .join(", ");

  return (
    <PrintDocument
      title={`Visita técnica ${visit.visit_number ? `#${visit.visit_number}` : ""}`.trim()}
      subtitle={visit.entity?.name}
      meta={[{ label: "Situação", value: visit.status_label }]}
    >
      <PrintSection title="Dados da visita">
        <PrintFields
          items={[
            { label: "Entidade", value: visit.entity?.name ?? "—" },
            { label: "Cidade", value: visit.city ?? "—" },
            { label: "Situação", value: visit.status_label ?? "—" },
            { label: "Agendada para", value: formatDateTime(visit.scheduled_date) },
            { label: "Início", value: formatDateTime(visit.started_at) },
            { label: "Término", value: formatDateTime(visit.finished_at) },
            { label: "Período", value: visit.period ?? "—" },
            { label: "Contatos", value: visit.contacts ?? "—" },
            { label: "Motivos", value: motivations || "—" },
          ]}
        />
      </PrintSection>

      <PrintSection title="Resumo dos atendimentos">
        <PrintHtml html={visit.summary} fallback="Sem resumo." />
      </PrintSection>

      <PrintSection title="Conclusão">
        <PrintHtml html={visit.conclusion} fallback="Sem conclusão." />
      </PrintSection>
    </PrintDocument>
  );
};
