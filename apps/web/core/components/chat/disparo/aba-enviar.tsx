/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { ENTITY_TYPES } from "@/components/entities/entity-form-modal";
import { groupErrosPorCampo } from "@/components/chat/ligacoes/ligacao-helpers";
import { FILTROS_VAZIOS, buildFiltrosDoEnvio, type EstadoDosFiltros } from "@/components/chat/disparo/disparo-helpers";
import { BOTAO, ERRO_DO_CAMPO, ROTULO, toastErro, toastSucesso } from "@/components/chat/disparo/estilos";
import { useDisparoApi, useMensagensDeDisparo, usePreviaDoEnvio } from "@/components/chat/disparo/use-disparo";
import { useProject } from "@/hooks/store/use-project";
import { useEntities } from "@/hooks/use-entities";
import type { ErroDoDisparo } from "@/services/disparo.service";

type Props = {
  slug: string;
  apiUrl: string;
  mensagemId: string;
  onMensagemChange: (id: string) => void;
  onEnviado: (execucaoId: string) => void;
};

function Previa({ slug, apiUrl, filtros }: { slug: string; apiUrl: string; filtros: EstadoDosFiltros }) {
  const { data, error, isLoading } = usePreviaDoEnvio(apiUrl, slug, buildFiltrosDoEnvio(filtros));
  if (isLoading) return <p className="text-13 text-tertiary">Contando destinatários…</p>;
  if (error || !data) return <p className="text-13 text-danger-primary">Não foi possível contar os destinatários.</p>;
  return (
    <div className="rounded-md border border-subtle bg-layer-1 p-3 text-13">
      <p className="font-semibold text-primary">{data.total} destinatário(s)</p>
      <p className="text-12 text-tertiary">
        {data.without_telefone} sem telefone válido e {data.repetidos} número(s) repetido(s) ficaram de fora.
      </p>
    </div>
  );
}

export const AbaEnviar = observer(function AbaEnviar({ slug, apiUrl, mensagemId, onMensagemChange, onEnviado }: Props) {
  const api = useDisparoApi(apiUrl);
  const { data: mensagens } = useMensagensDeDisparo(apiUrl, slug);
  const { entities } = useEntities(slug);
  const { workspaceProjectIds, getProjectById } = useProject();
  const [filtros, setFiltros] = useState<EstadoDosFiltros>(FILTROS_VAZIOS);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const opcoesDeMensagem = mensagens.map((m) => ({ value: m.id, label: m.titulo }));
  const opcoesDeEntidade = useMemo(
    () =>
      (entities ?? [])
        .filter((e) => filtros.entityType === null || e.entity_type === filtros.entityType)
        .map((e) => ({ value: e.id, label: e.name })),
    [entities, filtros.entityType]
  );
  const opcoesDeSistema = (workspaceProjectIds ?? [])
    .map((id) => getProjectById(id))
    .filter((p) => !!p)
    .map((p) => ({ value: p!.id, label: p!.name }));
  const mensagem = mensagens.find((m) => m.id === mensagemId);

  const update = (parte: Partial<EstadoDosFiltros>) => setFiltros((f) => ({ ...f, ...parte }));

  const onSend = async () => {
    if (!mensagem) return;
    const previa = await api.previa(slug, buildFiltrosDoEnvio(filtros)).catch(() => null);
    if (!window.confirm(`Enviar "${mensagem.titulo}" para ${previa?.total ?? 0} destinatário(s)?`)) return;
    setErros({});
    setEnviando(true);
    try {
      const execucao = await api.send(slug, mensagem.id, buildFiltrosDoEnvio(filtros));
      toastSucesso("Envio iniciado. Acompanhe no Histórico.");
      onEnviado(execucao.id);
    } catch (e) {
      setErros(groupErrosPorCampo(e as ErroDoDisparo));
      toastErro(e, "Não foi possível iniciar o envio.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <span className={ROTULO}>Mensagem</span>
        <SelectPesquisavel
          value={mensagemId}
          onChange={onMensagemChange}
          opcoes={opcoesDeMensagem}
          placeholder="Escolha a mensagem"
          searchable
        />
      </div>
      <div>
        <span className={ROTULO}>Tipo de entidade</span>
        <SelectPesquisavel<number | null>
          value={filtros.entityType}
          onChange={(v) => update({ entityType: v, entityId: "" })}
          opcoes={ENTITY_TYPES}
          opcaoVazia={{ value: null, label: "Todos os tipos" }}
        />
        {erros.entity_type && <p className={ERRO_DO_CAMPO}>{erros.entity_type}</p>}
      </div>
      <div>
        <span className={ROTULO}>Entidade</span>
        <SelectPesquisavel
          value={filtros.entityId}
          onChange={(v) => update({ entityId: v })}
          opcoes={opcoesDeEntidade}
          opcaoVazia={{ value: "", label: "Todas as entidades" }}
          searchable
        />
        {erros.entity_id && <p className={ERRO_DO_CAMPO}>{erros.entity_id}</p>}
      </div>
      <div>
        <span className={ROTULO}>Sistema</span>
        <SelectPesquisavel
          value={filtros.projectId}
          onChange={(v) => update({ projectId: v })}
          opcoes={opcoesDeSistema}
          opcaoVazia={{ value: "", label: "Todos os sistemas" }}
          searchable
        />
        {erros.project_id && <p className={ERRO_DO_CAMPO}>{erros.project_id}</p>}
      </div>
      <Previa slug={slug} apiUrl={apiUrl} filtros={filtros} />
      <button onClick={() => void onSend()} disabled={!mensagem || enviando} className={BOTAO}>
        Enviar
      </button>
    </div>
  );
});
