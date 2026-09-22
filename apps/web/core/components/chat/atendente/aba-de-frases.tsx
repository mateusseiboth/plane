/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// local imports
import { readErroDoCampo } from "@/components/chat/atendente/atendente-helpers";
import { useFrasesProntas } from "@/components/chat/atendente/use-atendente";
import type { ErroDoChat, FrasePronta } from "@/services/atendente.service";

const CAIXA = "w-full rounded-md border bg-surface-1 px-2 py-1.5 text-sm text-primary outline-none";
const BOTAO = "rounded-md bg-primary px-3 py-1.5 text-13 text-on-color disabled:opacity-50";
const BOTAO_LEVE = "rounded-md border border-subtle px-3 py-1.5 text-13";

const mensagemDoErro = (e: unknown) => (e as ErroDoChat | null)?.detail ?? "Tente de novo.";

/**
 * Aba "Frases" da configuração do chat (`chat.administrar`): as frases que o
 * atendente insere pelo menu do compositor.
 */
export function AbaDeFrases({ slug, apiUrl }: { slug: string; apiUrl: string }) {
  const { frases, isLoading, api, refetch } = useFrasesProntas(apiUrl, slug);
  const [nova, setNova] = useState("");
  const [erro, setErro] = useState<ErroDoChat | null>(null);

  const run = async (acao: () => Promise<unknown>, sucesso: string) => {
    try {
      await acao();
      setErro(null);
      await refetch();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: sucesso });
    } catch (e) {
      setErro(e as ErroDoChat);
      setToast({ type: TOAST_TYPE.ERROR, title: "Não salvo", message: mensagemDoErro(e) });
    }
  };

  const create = () =>
    run(async () => {
      await api.createFrase(slug, { texto: nova, ordem: frases.length });
      setNova("");
    }, "Frase incluída.");

  if (isLoading) return <div className="text-sm text-secondary">Carregando…</div>;

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <p className="text-12 text-secondary">Frases que o atendente insere pelo botão de frases, ao lado da mensagem.</p>
      {frases.length === 0 && (
        <div className="flex items-center gap-3 rounded-md border border-dashed border-subtle p-3 text-13 text-secondary">
          Nenhuma frase cadastrada.
          <button
            type="button"
            className={BOTAO_LEVE}
            onClick={() => void run(() => api.seedFrasesPadrao(slug), "Frases padrão incluídas.")}
          >
            Usar as frases padrão
          </button>
        </div>
      )}
      {frases.map((frase, i) => (
        <LinhaDaFrase
          key={frase.id}
          frase={frase}
          onSalvar={(texto) => void run(() => api.updateFrase(slug, frase.id, { texto, ordem: i }), "Frase alterada.")}
          onExcluir={() => void run(() => api.deleteFrase(slug, frase.id), "Frase excluída.")}
        />
      ))}
      <div className="flex flex-col gap-1">
        <span className="text-13 font-medium">Nova frase</span>
        <textarea
          rows={2}
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          className={`${CAIXA} ${readErroDoCampo(erro, "texto") ? "border-danger-primary" : "border-subtle"}`}
        />
        {readErroDoCampo(erro, "texto") && (
          <span className="text-11 text-danger-primary">{readErroDoCampo(erro, "texto")}</span>
        )}
        <button type="button" className={`${BOTAO} self-start`} onClick={() => void create()}>
          Incluir
        </button>
      </div>
    </div>
  );
}

function LinhaDaFrase({
  frase,
  onSalvar,
  onExcluir,
}: {
  frase: FrasePronta;
  onSalvar: (texto: string) => void;
  onExcluir: () => void;
}) {
  const [texto, setTexto] = useState(frase.texto);
  const alterada = texto !== frase.texto;
  return (
    <div className="flex items-start gap-2">
      <textarea
        rows={2}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className={`${CAIXA} border-subtle`}
      />
      <div className="flex flex-col gap-1">
        <button type="button" className={BOTAO} disabled={!alterada} onClick={() => onSalvar(texto)}>
          Salvar
        </button>
        <button
          type="button"
          className="rounded p-1.5 text-secondary hover:bg-danger-subtle hover:text-danger-primary"
          onClick={onExcluir}
          title="Excluir frase"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
