/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// local imports
import { readErroDoCampo } from "@/components/chat/atendente/atendente-helpers";
import { useAtendenteApi, useFrasesDoEspaco, useFrasesProntas } from "@/components/chat/atendente/use-atendente";
import type { ErroDoChat, EscopoDaFrase, FrasePronta } from "@/services/atendente.service";

const CAIXA = "w-full rounded-md border bg-surface-1 px-2 py-1.5 text-sm text-primary outline-none";
const BOTAO = "rounded-md bg-primary px-3 py-1.5 text-13 text-on-color disabled:opacity-50";
const BOTAO_LEVE = "rounded-md border border-subtle px-3 py-1.5 text-13";

const mensagemDoErro = (e: unknown) => (e as ErroDoChat | null)?.detail ?? "Tente de novo.";

type EditorProps = {
  slug: string;
  apiUrl: string;
  /** Grupo editado: as do espaço (configuração) ou as próprias (compositor). */
  escopo: EscopoDaFrase;
  frases: FrasePronta[];
  isLoading: boolean;
  /** Recarrega a lista depois de gravar. */
  onMudou: () => Promise<unknown>;
  descricao: string;
  /** O que aparece quando o grupo está vazio. */
  vazio: ReactNode;
};

/**
 * Inclui, altera e exclui as frases de um grupo. A mesma tela serve às frases do
 * espaço (aba Frases da configuração) e às de cada atendente (compositor): só
 * muda o `escopo`, que escolhe a rota.
 */
export function EditorDeFrases({ slug, apiUrl, escopo, frases, isLoading, onMudou, descricao, vazio }: EditorProps) {
  const api = useAtendenteApi(apiUrl);
  const [nova, setNova] = useState("");
  const [erro, setErro] = useState<ErroDoChat | null>(null);

  const run = async (acao: () => Promise<unknown>, sucesso: string) => {
    try {
      await acao();
      setErro(null);
      await onMudou();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: sucesso });
    } catch (e) {
      setErro(e as ErroDoChat);
      setToast({ type: TOAST_TYPE.ERROR, title: "Não salvo", message: mensagemDoErro(e) });
    }
  };

  const create = () =>
    run(async () => {
      await api.createFrase(slug, escopo, { texto: nova, ordem: frases.length });
      setNova("");
    }, "Frase incluída.");

  if (isLoading) return <div className="text-sm text-secondary">Carregando…</div>;

  const erroDoTexto = readErroDoCampo(erro, "texto");

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <p className="text-12 text-secondary">{descricao}</p>
      {frases.length === 0 && vazio}
      {frases.map((frase, i) => (
        <LinhaDaFrase
          key={frase.id}
          frase={frase}
          onSalvar={(texto) =>
            void run(() => api.updateFrase(slug, escopo, frase.id, { texto, ordem: i }), "Frase alterada.")
          }
          onExcluir={() => void run(() => api.deleteFrase(slug, escopo, frase.id), "Frase excluída.")}
        />
      ))}
      <div className="flex flex-col gap-1">
        <span className="text-13 font-medium">Nova frase</span>
        <textarea
          rows={2}
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          className={`${CAIXA} ${erroDoTexto ? "border-danger-primary" : "border-subtle"}`}
        />
        {erroDoTexto && <span className="text-11 text-danger-primary">{erroDoTexto}</span>}
        <button type="button" className={`${BOTAO} self-start`} onClick={() => void create()}>
          Incluir
        </button>
      </div>
    </div>
  );
}

/**
 * Aba "Frases" da configuração do chat (`chat.administrar`): as frases do
 * espaço, que todo atendente vê no compositor.
 */
export function AbaDeFrases({ slug, apiUrl }: { slug: string; apiUrl: string }) {
  const { frases, isLoading, api, refetch: refetchDoEspaco } = useFrasesDoEspaco(apiUrl, slug);
  // O compositor lê outra lista (as do espaço e as próprias): recarrega junto.
  const { refetch: refetchDoCompositor } = useFrasesProntas(apiUrl, slug);
  const refetch = () => Promise.all([refetchDoEspaco(), refetchDoCompositor()]);

  const seedPadrao = async () => {
    try {
      await api.seedFrasesPadrao(slug);
      await refetch();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Frases padrão incluídas." });
    } catch (e) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Não salvo", message: mensagemDoErro(e) });
    }
  };

  return (
    <EditorDeFrases
      slug={slug}
      apiUrl={apiUrl}
      escopo="espaco"
      frases={frases}
      isLoading={isLoading}
      onMudou={refetch}
      descricao="Frases do espaço: todo atendente vê no botão de frases, ao lado da mensagem."
      vazio={
        <div className="flex items-center gap-3 rounded-md border border-dashed border-subtle p-3 text-13 text-secondary">
          Nenhuma frase cadastrada.
          <button type="button" className={BOTAO_LEVE} onClick={() => void seedPadrao()}>
            Usar as frases padrão
          </button>
        </div>
      }
    />
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
