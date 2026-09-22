/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
// components
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { PrintButton, PrintDocument, PrintSection } from "@/components/print";
// hooks
import { useChatMotivos, useRegistrosDeAtendimento, useRelatorioDeAtendimentos } from "@/hooks/use-chat-atendimento";
import { useEntities } from "@/hooks/use-entities";
// services
import type { FiltroDeAtendimentos, RegistroDeAtendimento, RelatorioDeAtendimentos } from "@/services/chat.service";

type Celula = string | number | null;
type Secao = { titulo: string; colunas: string[]; linhas: Celula[][] };

const texto = (valor: Celula) => (valor === null || valor === "" ? "—" : String(valor));
const formatData = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");
const toData = (d: Date) => d.toISOString().slice(0, 10);

/**
 * As tabelas do relatório, uma só definição para a tela e para a impressão
 * (a lista de colunas não se repete).
 */
function buildSecoes(r: RelatorioDeAtendimentos): Secao[] {
  return [
    {
      titulo: "Por atendente",
      colunas: ["Atendente", "Total", "Finalizados", "Abandonados", "Duração média (min)"],
      linhas: r.por_atendente.map((a) => [a.name, a.total, a.finalizados, a.abandonados, a.duracao_media_min]),
    },
    {
      titulo: "Tipo de abandono",
      colunas: ["Tipo", "Total"],
      linhas: r.por_tipo_abandono.map((a) => [a.rotulo, a.total]),
    },
    {
      titulo: "Por sistema",
      colunas: ["Sistema", "Total", "Finalizados", "Abandonados"],
      linhas: r.por_sistema.map((s) => [s.sistema, s.total, s.finalizados, s.abandonados]),
    },
    {
      titulo: "Por dia da semana",
      colunas: ["Dia", "Atendimentos"],
      linhas: r.por_dia_da_semana.map((d) => [d.rotulo, d.total]),
    },
    {
      titulo: "Por motivo",
      colunas: ["Motivo", "Finalizados"],
      linhas: r.por_motivo.map((m) => [m.motivo, m.total]),
    },
  ];
}

const ESTILO = {
  tela: {
    tabela: "w-full text-sm",
    cabecalho: "bg-layer-2 text-12 text-secondary",
    celula: "p-2 text-left font-normal",
    linha: "border-t border-subtle",
  },
  impressao: {
    tabela: "w-full border-collapse text-[10px]",
    cabecalho: "bg-neutral-100",
    celula: "border border-neutral-300 px-2 py-1 text-left",
    linha: "",
  },
} as const;

function Tabela({ secao, estilo }: { secao: Secao; estilo: keyof typeof ESTILO }) {
  const e = ESTILO[estilo];
  if (secao.linhas.length === 0) return <p className="py-2 text-12 text-secondary">Nada no período.</p>;
  return (
    <table className={e.tabela}>
      <thead className={e.cabecalho}>
        <tr>
          {secao.colunas.map((c) => (
            <th key={c} className={e.celula}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {secao.linhas.map((linha) => (
          <tr key={linha.join("|")} className={e.linha}>
            {secao.colunas.map((coluna, j) => (
              <td key={coluna} className={e.celula}>
                {texto(linha[j] ?? null)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const CAIXA = "rounded-md border border-subtle bg-surface-2 px-2 py-1.5 text-13 text-primary";

type Props = { slug: string; apiUrl: string; projetos: { value: string; label: string }[] };

/**
 * Relatórios de atendimento do chat (semanal por atendente, finalizados x
 * abandonados, tipo de abandono, por sistema, por dia da semana, por motivo) e
 * a consulta dos registros encerrados, com impressão.
 */
export function RelatoriosDeAtendimento({ slug, apiUrl, projetos }: Props) {
  const hoje = new Date();
  const [filtro, setFiltro] = useState<FiltroDeAtendimentos>({
    from: toData(new Date(hoje.getTime() - 6 * 24 * 60 * 60 * 1000)),
    to: toData(hoje),
  });
  const { relatorio, isLoading } = useRelatorioDeAtendimentos(apiUrl, slug, filtro);
  const { registros } = useRegistrosDeAtendimento(apiUrl, slug, filtro);
  const { entities } = useEntities(slug);
  const { motivos } = useChatMotivos(apiUrl, slug);
  const nomeDaEntidade = new Map((entities ?? []).map((e) => [e.id, e.name]));

  const setCampo = (campo: keyof FiltroDeAtendimentos) => (valor: string) =>
    setFiltro((atual) => ({ ...atual, [campo]: valor || undefined }));

  const secoes = relatorio ? buildSecoes(relatorio) : [];
  const periodo = `${filtro.from ?? ""} a ${filtro.to ?? ""}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-12 text-secondary">
          De
          <input
            type="date"
            value={filtro.from ?? ""}
            onChange={(e) => setCampo("from")(e.target.value)}
            className={CAIXA}
          />
        </label>
        <label className="flex flex-col gap-1 text-12 text-secondary">
          Até
          <input
            type="date"
            value={filtro.to ?? ""}
            onChange={(e) => setCampo("to")(e.target.value)}
            className={CAIXA}
          />
        </label>
        <SelectPesquisavel
          value={filtro.entity_id ?? ""}
          onChange={setCampo("entity_id")}
          opcoes={(entities ?? []).map((e) => ({ value: e.id, label: e.name }))}
          opcaoVazia={{ value: "", label: "Todas as entidades" }}
          searchPlaceholder="Buscar entidade"
          className="w-52"
        />
        <SelectPesquisavel
          value={filtro.project_id ?? ""}
          onChange={setCampo("project_id")}
          opcoes={projetos}
          opcaoVazia={{ value: "", label: "Todos os sistemas" }}
          searchPlaceholder="Buscar sistema"
          className="w-44"
        />
        <SelectPesquisavel
          value={filtro.motivo ?? ""}
          onChange={setCampo("motivo")}
          opcoes={motivos.map((m) => ({ value: m.label, label: m.label }))}
          opcaoVazia={{ value: "", label: "Todos os motivos" }}
          className="w-40"
        />
        <PrintButton
          appearance="label"
          documentTitle={`Relatório de atendimentos ${periodo}`}
          auditEntity="chat_session"
          auditEntityId="relatorio"
          auditMetadata={{ ...filtro }}
          disabled={!relatorio}
        />
      </div>

      {isLoading && <p className="text-13 text-secondary">Carregando relatório…</p>}

      {relatorio && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Atendimentos", relatorio.finalizacao.total],
              ["Finalizados", relatorio.finalizacao.finalizados],
              ["Abandonados", relatorio.finalizacao.abandonados],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="flex flex-col gap-1 rounded-xl border border-subtle p-4">
                <span className="text-28 leading-none font-semibold">{valor}</span>
                <span className="text-12 text-secondary">{rotulo}</span>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {secoes.map((secao) => (
              <div key={secao.titulo}>
                <h4 className="mb-2 text-13 font-semibold">{secao.titulo}</h4>
                <div className="overflow-hidden rounded-xl border border-subtle">
                  <Tabela secao={secao} estilo="tela" />
                </div>
              </div>
            ))}
          </div>

          <PrintDocument
            title="Relatório de atendimentos"
            subtitle={periodo}
            meta={[
              { label: "Atendimentos", value: String(relatorio.finalizacao.total) },
              { label: "Finalizados", value: String(relatorio.finalizacao.finalizados) },
              { label: "Abandonados", value: String(relatorio.finalizacao.abandonados) },
            ]}
          >
            {secoes.map((secao) => (
              <PrintSection key={secao.titulo} title={secao.titulo}>
                <Tabela secao={secao} estilo="impressao" />
              </PrintSection>
            ))}
          </PrintDocument>
        </>
      )}

      <div>
        <h4 className="mb-2 text-13 font-semibold">Registros de atendimento ({registros.length})</h4>
        <div className="overflow-x-auto rounded-xl border border-subtle">
          <table className="text-sm w-full">
            <thead className="bg-layer-2 text-12 text-secondary">
              <tr>
                {[
                  "Protocolo",
                  "Encerrado em",
                  "Cliente",
                  "Entidade",
                  "Sistema",
                  "Motivo",
                  "Funcionalidade",
                  "Atendente",
                  "Situação",
                  "Chamado",
                ].map((c) => (
                  <th key={c} className="font-normal p-2 text-left">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {registros.map((r: RegistroDeAtendimento) => (
                <tr key={r.id} className="border-t border-subtle" title={r.close_note ?? undefined}>
                  <td className="p-2">
                    <Link href={`/${slug}/chat-view/${r.protocol}`} className="underline">
                      {r.protocol}
                    </Link>
                  </td>
                  <td className="p-2">{formatData(r.closed_at)}</td>
                  <td className="p-2">{texto(r.client_name)}</td>
                  <td className="p-2">{texto(r.entity_id ? (nomeDaEntidade.get(r.entity_id) ?? null) : null)}</td>
                  <td className="p-2">{texto(r.project_name)}</td>
                  <td className="p-2">{texto(r.close_reason)}</td>
                  <td className="p-2">{texto(r.close_module_name)}</td>
                  <td className="p-2">{texto(r.attendant_name)}</td>
                  <td className="p-2">{r.abandonado ? `Abandono: ${r.abandono}` : "Finalizado"}</td>
                  <td className="p-2">
                    {r.issue_label ? (
                      <Link href={`/${slug}/browse/${r.issue_label}/`} className="underline">
                        {r.issue_label}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {registros.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-4 text-center text-13 text-secondary">
                    Nenhum atendimento encerrado no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
