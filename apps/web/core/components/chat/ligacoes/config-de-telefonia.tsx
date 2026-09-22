/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import useSWR from "swr";
import { Copy, Plus, Trash2 } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { groupErrosPorCampo } from "@/components/chat/ligacoes/ligacao-helpers";
import { useTelefoniaConfig } from "@/components/chat/ligacoes/use-ligacoes";
import { chatApi } from "@/services/chat.service";
import type { ErroDaLigacao, RamalConfigurado } from "@/services/ligacoes.service";

type Props = { slug: string; apiUrl: string };

const CAIXA = "w-full rounded-md border border-subtle bg-surface-1 px-2 py-1.5 text-sm text-primary outline-none";
const BOTAO = "rounded-md bg-primary px-3 py-1.5 text-13 text-on-color disabled:opacity-50";
const BOTAO_SECUNDARIO = "rounded-md border border-subtle px-3 py-1.5 text-13 text-secondary hover:bg-layer-1";

const toastErro = (e: unknown, padrao: string) =>
  setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: (e as ErroDaLigacao)?.detail || padrao });

const copyText = async (texto: string) => {
  await navigator.clipboard.writeText(texto).catch(() => {});
  setToast({ type: TOAST_TYPE.SUCCESS, title: "Copiado", message: "Cole na configuração do PBX." });
};

function TokenDeServico({ slug, apiUrl }: Props) {
  const { data, refetch, api } = useTelefoniaConfig(apiUrl, slug);
  const [novoToken, setNovoToken] = useState<string | null>(null);
  const endereco = `${apiUrl.replace(/\/$/, "")}/workspaces/${slug}/telefonia/ligacoes/`;

  const onGenerate = async () => {
    if (data?.has_token && !window.confirm("Gerar um token novo desliga o atual. Continuar?")) return;
    try {
      const gerado = await api.generateToken(slug);
      setNovoToken(gerado.token);
      void refetch();
    } catch (e) {
      toastErro(e, "Não foi possível gerar o token.");
    }
  };

  const onRevoke = async () => {
    if (!window.confirm("O PBX deixa de registrar ligações até um token novo ser gerado. Continuar?")) return;
    try {
      await api.revokeToken(slug);
      setNovoToken(null);
      void refetch();
    } catch (e) {
      toastErro(e, "Não foi possível revogar o token.");
    }
  };

  return (
    <section className="space-y-3">
      <h3 className="text-14 font-semibold text-primary">Integração com o PBX</h3>
      <div>
        <label htmlFor="endereco-do-pbx" className="mb-1 block text-12 text-secondary">
          Endereço que o PBX chama (POST)
        </label>
        <div className="flex gap-2">
          <input id="endereco-do-pbx" readOnly value={endereco} className={CAIXA} />
          <button onClick={() => void copyText(endereco)} className={BOTAO_SECUNDARIO} title="Copiar endereço">
            <Copy className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="text-12 text-secondary">
        {data?.has_token ? `Token ativo terminado em ${data.token_last4}.` : "Nenhum token ativo."}
      </p>
      {novoToken && (
        <div className="space-y-1 rounded-md border border-warning-subtle bg-warning-subtle p-3">
          <p className="text-12 text-warning-primary">Copie agora. Ele não aparece de novo.</p>
          <div className="flex gap-2">
            <input readOnly value={novoToken} className={`${CAIXA} font-mono`} />
            <button onClick={() => void copyText(novoToken)} className={BOTAO_SECUNDARIO} title="Copiar token">
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onGenerate} className={BOTAO}>
          {data?.has_token ? "Gerar token novo" : "Gerar token"}
        </button>
        {data?.has_token && (
          <button onClick={onRevoke} className={BOTAO_SECUNDARIO}>
            Revogar
          </button>
        )}
      </div>
    </section>
  );
}

function Ramais({ slug, apiUrl }: Props) {
  const { data, refetch, api } = useTelefoniaConfig(apiUrl, slug);
  const { data: atendentes } = useSWR(["CHAT_ATENDENTES", slug], () => chatApi(apiUrl).attendants(slug), {
    revalidateOnFocus: false,
  });
  const [rascunho, setRascunho] = useState<RamalConfigurado[] | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const ramais = rascunho ?? data?.ramais ?? [];
  const opcoes = (atendentes?.results ?? []).map((a) => ({ value: a.user_id, label: a.name }));

  const updateRamal = (i: number, parte: Partial<RamalConfigurado>) =>
    setRascunho(ramais.map((r, j) => (j === i ? { ...r, ...parte } : r)));

  const onSave = async () => {
    setErros({});
    try {
      await api.saveRamais(
        slug,
        ramais.map(({ extension, user_id }) => ({ extension, user_id }))
      );
      setRascunho(null);
      void refetch();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Ramais atualizados." });
    } catch (e) {
      setErros(groupErrosPorCampo(e as ErroDaLigacao));
      toastErro(e, "Não foi possível salvar os ramais.");
    }
  };

  return (
    <section className="space-y-3">
      <h3 className="text-14 font-semibold text-primary">Ramais</h3>
      <p className="text-12 text-secondary">A ligação atendida no ramal cai direto na caixa da pessoa.</p>
      {ramais.map((r, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="w-28">
            <input
              value={r.extension}
              onChange={(e) => updateRamal(i, { extension: e.target.value })}
              placeholder="Ramal"
              className={CAIXA}
            />
            {erros[`ramais[${i}].extension`] && (
              <p className="mt-1 text-11 text-danger-primary">{erros[`ramais[${i}].extension`]}</p>
            )}
          </div>
          <div className="flex-1">
            <SelectPesquisavel
              value={r.user_id}
              onChange={(user_id) => updateRamal(i, { user_id })}
              opcoes={opcoes}
              placeholder="Atendente"
              searchPlaceholder="Buscar atendente"
            />
            {erros[`ramais[${i}].user_id`] && (
              <p className="mt-1 text-11 text-danger-primary">{erros[`ramais[${i}].user_id`]}</p>
            )}
          </div>
          <button
            onClick={() => setRascunho(ramais.filter((_, j) => j !== i))}
            className="rounded p-2 text-secondary hover:bg-layer-1"
            title="Remover ramal"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <button
          onClick={() => setRascunho([...ramais, { extension: "", user_id: "" }])}
          className={`${BOTAO_SECUNDARIO} flex items-center gap-1`}
        >
          <Plus className="h-4 w-4" />
          Adicionar ramal
        </button>
        <button onClick={onSave} disabled={!rascunho} className={BOTAO}>
          Salvar ramais
        </button>
      </div>
    </section>
  );
}

/** Aba Telefonia da configuração do chat (`chat.administrar`): token do PBX e ramais. */
export function ConfigDeTelefonia({ slug, apiUrl }: Props) {
  return (
    <div className="max-w-2xl space-y-8">
      <TokenDeServico slug={slug} apiUrl={apiUrl} />
      <Ramais slug={slug} apiUrl={apiUrl} />
    </div>
  );
}
