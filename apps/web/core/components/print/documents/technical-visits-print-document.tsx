/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TTechnicalVisit } from "@/components/technical-visits/types";
import { VISIT_MOTIVOS } from "@/components/technical-visits/visit-display";
import { buildTechnicianNames, buildTrainingSheets } from "@/components/technical-visits/visit-rules";
// local imports
import { PrintDocument } from "../print-document";
import { PrintHtml } from "../print-html";
import { PrintFields, PrintSection } from "../print-section";

/** Mantido pelo nome antigo: é o mesmo contrato da API. */
export type TTechnicalVisitRecord = TTechnicalVisit;

const CELL = "border border-neutral-300 px-2 py-1 align-top";

const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "—");
const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString("pt-BR") : "—");

const buildTitulo = (visit: Pick<TTechnicalVisit, "visit_number">, prefixo = "Visita técnica") =>
  `${prefixo} ${visit.visit_number ? `nº ${visit.visit_number}` : ""}`.trim();

/** Nomes dos responsáveis cadastrados. O texto do SAC é impresso à parte. */
const contactNames = (visit: TTechnicalVisit) =>
  (visit.contact_records ?? []).map((contact) => contact.name).join(", ");

const buildMotivos = (visit: TTechnicalVisit) =>
  VISIT_MOTIVOS.filter(({ key }) => !!visit[key])
    .map(({ label }): string => label)
    .concat(visit.mot_other && visit.mot_other_description ? [visit.mot_other_description] : [])
    .join(", ");

const joinNames = (items: { name: string }[] | undefined) => (items ?? []).map((item) => item.name).join(", ");

type ListProps = {
  visits: TTechnicalVisit[];
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
        <p className="text-xs py-4">Nenhuma visita técnica encontrada.</p>
      ) : (
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-neutral-100 text-left">
              <th className={CELL}>Nº</th>
              <th className={CELL}>Entidade</th>
              <th className={CELL}>Cidade</th>
              <th className={CELL}>Técnico</th>
              <th className={CELL}>Agendada para</th>
              <th className={CELL}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((visit) => (
              <tr key={visit.id}>
                <td className={CELL}>{visit.visit_number ?? "—"}</td>
                <td className={CELL}>{visit.entity?.name ?? "—"}</td>
                <td className={CELL}>{visit.city ?? "—"}</td>
                <td className={CELL}>{buildTechnicianNames(visit) || "—"}</td>
                <td className={CELL}>{formatDateTime(visit.scheduled_date)}</td>
                <td className={CELL}>
                  {visit.status_label ?? "—"}
                  {visit.is_overdue ? " (vencida)" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PrintDocument>
  );
};

type DetailProps = {
  visit: TTechnicalVisit;
  /** A página monta os dois documentos da visita e imprime só o escolhido. */
  skip?: boolean;
};

function SignatureLines({ labels }: { labels: string[] }) {
  return (
    <div className="print-avoid-break mt-12 grid grid-cols-2 gap-10 text-center text-[11px]">
      {labels.map((label) => (
        <div key={label}>
          <div className="border-neutral-500 mb-1 border-t" />
          {label}
        </div>
      ))}
    </div>
  );
}

/** Relatório de viagem da visita, com campo de assinatura (o que volta assinado e conclui a visita). */
export const TechnicalVisitPrintDocument = function TechnicalVisitPrintDocument(props: DetailProps) {
  const { visit, skip } = props;

  return (
    <PrintDocument
      title={buildTitulo(visit)}
      subtitle={visit.entity?.name}
      meta={[{ label: "Situação", value: visit.status_label }]}
      skip={skip}
    >
      <PrintSection title="Relatório de viagem">
        <PrintFields
          items={[
            { label: "Entidade", value: visit.entity?.name ?? "—" },
            { label: "Município", value: visit.city ?? "—" },
            { label: "Técnico(s)", value: buildTechnicianNames(visit) || "—" },
            { label: "Sistema(s)", value: joinNames(visit.projects) || "—" },
            { label: "Funcionalidades", value: joinNames(visit.modules) || "—" },
            { label: "Período", value: visit.period ?? "—" },
            { label: "Agendada para", value: formatDateTime(visit.scheduled_date) },
            { label: "Chegada", value: formatDateTime(visit.started_at) },
            { label: "Partida", value: formatDateTime(visit.finished_at) },
            { label: "Motivos", value: buildMotivos(visit) || "—" },
            { label: "Responsáveis", value: contactNames(visit) || "—" },
            ...(visit.contacts ? [{ label: "Contatos (sistema antigo)", value: visit.contacts }] : []),
          ]}
        />
      </PrintSection>

      <PrintSection title="Resumo (situação da entidade antes da visita)">
        <PrintHtml html={visit.summary} fallback="Sem resumo." />
      </PrintSection>

      <PrintSection title="Conclusão (situação da entidade depois da visita)">
        <PrintHtml html={visit.conclusion} fallback="Sem conclusão." />
      </PrintSection>

      <PrintSection title="Chamados vinculados">
        {visit.issues?.length ? (
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-neutral-100 text-left">
                <th className={CELL}>Chamado</th>
                <th className={CELL}>Título</th>
                <th className={CELL}>Etapa</th>
              </tr>
            </thead>
            <tbody>
              {visit.issues.map((issue) => (
                <tr key={issue.id}>
                  <td className={CELL}>{issue.code}</td>
                  <td className={CELL}>{issue.name}</td>
                  <td className={CELL}>{issue.state?.name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Nenhum chamado vinculado.</p>
        )}
      </PrintSection>

      <SignatureLines labels={["Técnico de suporte", "Responsável do setor"]} />
    </PrintDocument>
  );
};

/** Lista de presença do treinamento: uma folha por sistema da visita. */
export const TechnicalVisitTrainingPrintDocument = function TechnicalVisitTrainingPrintDocument(props: DetailProps) {
  const { visit, skip } = props;
  const folhas = buildTrainingSheets(visit);

  return (
    <PrintDocument
      title={buildTitulo(visit, "Lista de presença do treinamento")}
      subtitle={visit.entity?.name}
      skip={skip}
    >
      {folhas.map((folha, indice) => (
        <section key={folha.sistema ?? "sem-sistema"} className={indice > 0 ? "print-break-before pt-2" : "pt-2"}>
          <PrintFields
            items={[
              { label: "Entidade", value: visit.entity?.name ?? "—" },
              { label: "Município", value: visit.city ?? "—" },
              { label: "Data", value: formatDate(visit.started_at ?? visit.scheduled_date) },
              { label: "Sistema", value: folha.sistema ?? "Todos os sistemas utilizados" },
              { label: "Técnico(s)", value: buildTechnicianNames(visit) || "—" },
              { label: "Funcionalidades", value: folha.funcionalidades.join(", ") || "—" },
            ]}
          />
          <p className="mt-3 text-[11px] leading-snug">
            Declaramos que recebemos o treinamento do sistema {folha.sistema ?? "indicado acima"} em suas
            funcionalidades de cadastros, lançamentos, consultas e relatórios, e que estamos aptos a utilizá-lo nas
            tarefas do setor.
          </p>
          <table className="mt-3 w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-neutral-100 text-left">
                <th className={`${CELL} w-8`}>Nº</th>
                <th className={CELL}>Nome</th>
                <th className={`${CELL} w-40`}>Cargo ou setor</th>
                <th className={`${CELL} w-56`}>Assinatura</th>
              </tr>
            </thead>
            <tbody>
              {folha.participantes.map((nome, linha) => (
                <tr key={`${linha}-${nome}`} className="h-8">
                  <td className={CELL}>{linha + 1}</td>
                  <td className={CELL}>{nome}</td>
                  <td className={CELL} />
                  <td className={CELL} />
                </tr>
              ))}
            </tbody>
          </table>
          <SignatureLines labels={["Técnico de suporte", "Responsável do setor"]} />
        </section>
      ))}
    </PrintDocument>
  );
};
