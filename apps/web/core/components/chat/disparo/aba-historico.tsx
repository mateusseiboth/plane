/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { ArrowLeft } from "lucide-react";
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { ENTITY_TYPES } from "@/components/entities/entity-form-modal";
import {
  COR_DO_ITEM,
  describeFiltros,
  getProgresso,
  statusDoEnvioLabel,
  statusDoItemLabel,
} from "@/components/chat/disparo/disparo-helpers";
import {
  BOTAO_SECUNDARIO,
  CABECALHO,
  CELULA,
  TABELA,
  formatDataHora,
  toastErro,
} from "@/components/chat/disparo/estilos";
import { useDetalheDoEnvio, useExecucoesDeDisparo } from "@/components/chat/disparo/use-disparo";
import { useProject } from "@/hooks/store/use-project";
import { useEntities } from "@/hooks/use-entities";
import type { ExecucaoDeDisparo } from "@/services/disparo.service";

type Props = {
  slug: string;
  apiUrl: string;
  mensagemId: string;
  execucaoId: string | null;
  onExecucaoChange: (id: string | null) => void;
};

const FILTROS_DO_ITEM = [
  { value: "", label: "Todos os telefones" },
  { value: "enviado", label: "Enviados" },
  { value: "falhou", label: "Com falha" },
  { value: "pendente", label: "Na fila" },
  { value: "cancelado", label: "Cancelados" },
];

const TIPOS = Object.fromEntries(ENTITY_TYPES.map((t) => [t.value, t.label]));

/** Nomes para descrever os filtros gravados em cada envio. */
function useNomesDosFiltros(slug: string) {
  const { entities } = useEntities(slug);
  const { workspaceProjectIds, getProjectById } = useProject();
  const sistemas = Object.fromEntries(
    (workspaceProjectIds ?? []).map((id) => [id, getProjectById(id)?.name ?? ""] as const)
  );
  const entidades = useMemo(() => Object.fromEntries((entities ?? []).map((e) => [e.id, e.name])), [entities]);
  return { tipos: TIPOS, entidades, sistemas };
}

function Progresso({ execucao }: { execucao: ExecucaoDeDisparo }) {
  const percentual = getProgresso(execucao.resumo);
  return (
    <div className="min-w-32">
      <div className="h-1.5 w-full overflow-hidden rounded bg-layer-2">
        <div className="h-full bg-accent-primary" style={{ width: `${percentual}%` }} />
      </div>
      <div className="mt-1 text-11 text-tertiary">
        {execucao.resumo.enviado} enviado(s), {execucao.resumo.falhou} com falha
      </div>
    </div>
  );
}

const DetalheDoEnvio = observer(function DetalheDoEnvio({
  slug,
  apiUrl,
  execucaoId,
  onVoltar,
}: {
  slug: string;
  apiUrl: string;
  execucaoId: string;
  onVoltar: () => void;
}) {
  const { data, isLoading, refetch, api } = useDetalheDoEnvio(apiUrl, slug, execucaoId);
  const nomes = useNomesDosFiltros(slug);
  const [status, setStatus] = useState("");
  const itens = (data?.itens ?? []).filter((i) => !status || i.status === status);

  const onCancel = async () => {
    if (!window.confirm("Cancelar o envio? Quem ainda não recebeu fica sem a mensagem.")) return;
    try {
      await api.cancel(slug, execucaoId);
      void refetch();
    } catch (e) {
      toastErro(e, "Não foi possível cancelar o envio.");
    }
  };

  if (isLoading || !data) return <p className="text-13 text-tertiary">Carregando…</p>;

  return (
    <div className="space-y-4">
      <button onClick={onVoltar} className={`${BOTAO_SECUNDARIO} flex items-center gap-1`}>
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-14 font-semibold text-primary">{data.titulo}</h3>
          <p className="text-12 text-tertiary">
            {formatDataHora(data.created_at)} por {data.created_by_name} · {describeFiltros(data.filtros, nomes)}
          </p>
          <p className="text-12 text-tertiary">
            {statusDoEnvioLabel(data.status)} · {data.total} destinatário(s) · {data.without_telefone} sem telefone ·{" "}
            {data.repetidos} repetido(s)
          </p>
        </div>
        {data.status === "em_andamento" && (
          <button onClick={() => void onCancel()} className={BOTAO_SECUNDARIO}>
            Cancelar envio
          </button>
        )}
      </div>
      <Progresso execucao={data} />
      <div className="max-w-60">
        <SelectPesquisavel value={status} onChange={setStatus} opcoes={FILTROS_DO_ITEM} />
      </div>
      <table className={TABELA}>
        <thead className={CABECALHO}>
          <tr>
            <th className={CELULA}>Telefone</th>
            <th className={CELULA}>Responsável</th>
            <th className={CELULA}>Entidade</th>
            <th className={CELULA}>Situação</th>
            <th className={CELULA}>Quando</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((i) => (
            <tr key={i.id} className="border-b border-subtle">
              <td className={`${CELULA} font-mono text-12`}>{i.telefone}</td>
              <td className={CELULA}>{i.contact_name}</td>
              <td className={CELULA}>{i.entity_name}</td>
              <td className={`${CELULA} ${COR_DO_ITEM[i.status] ?? "text-secondary"}`}>
                {statusDoItemLabel(i.status)}
                {i.erro && <div className="text-11 text-tertiary">{i.erro}</div>}
              </td>
              <td className={CELULA}>{formatDataHora(i.tentado_em)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export const AbaHistorico = observer(function AbaHistorico({
  slug,
  apiUrl,
  mensagemId,
  execucaoId,
  onExecucaoChange,
}: Props) {
  const { data: execucoes, isLoading } = useExecucoesDeDisparo(apiUrl, slug, mensagemId || undefined);
  const nomes = useNomesDosFiltros(slug);

  if (execucaoId)
    return (
      <DetalheDoEnvio slug={slug} apiUrl={apiUrl} execucaoId={execucaoId} onVoltar={() => onExecucaoChange(null)} />
    );
  if (isLoading) return <p className="text-13 text-tertiary">Carregando…</p>;
  if (!execucoes.length) return <p className="text-13 text-tertiary">Nenhum envio ainda.</p>;

  return (
    <table className={TABELA}>
      <thead className={CABECALHO}>
        <tr>
          <th className={CELULA}>Quando</th>
          <th className={CELULA}>Mensagem</th>
          <th className={CELULA}>Quem enviou</th>
          <th className={CELULA}>Para</th>
          <th className={CELULA}>Destinatários</th>
          <th className={CELULA}>Andamento</th>
          <th className={CELULA}>Situação</th>
        </tr>
      </thead>
      <tbody>
        {execucoes.map((e) => (
          <tr
            key={e.id}
            onClick={() => onExecucaoChange(e.id)}
            className="cursor-pointer border-b border-subtle hover:bg-layer-1"
          >
            <td className={CELULA}>{formatDataHora(e.created_at)}</td>
            <td className={CELULA}>{e.titulo}</td>
            <td className={CELULA}>{e.created_by_name}</td>
            <td className={CELULA}>{describeFiltros(e.filtros, nomes)}</td>
            <td className={CELULA}>{e.total}</td>
            <td className={CELULA}>
              <Progresso execucao={e} />
            </td>
            <td className={CELULA}>{statusDoEnvioLabel(e.status)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
});
