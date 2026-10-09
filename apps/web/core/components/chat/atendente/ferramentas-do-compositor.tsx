/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import { KeyRound, MessageSquareText, Pencil, X } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// local imports
import { EditorDeFrases } from "@/components/chat/atendente/aba-de-frases";
import { groupFrases, readErroDoCampo } from "@/components/chat/atendente/atendente-helpers";
import { useAtendenteApi, useFrasesProntas } from "@/components/chat/atendente/use-atendente";
import type { ChatMessage } from "@/services/chat.service";
import type { ErroDoChat, FrasePronta } from "@/services/atendente.service";

const BOTAO = "rounded-lg p-2 text-secondary transition-colors hover:bg-layer-2 hover:text-primary";

type Props = {
  slug: string;
  apiUrl: string;
  sessionId: string;
  /** Enviar sem o nome do atendente (vale para a mensagem e para a chave). */
  semNome: boolean;
  onSemNomeChange: (valor: boolean) => void;
  /** Frase escolhida: o compositor a coloca no rascunho. */
  onFrase: (texto: string) => void;
  onChaveEnviada?: (mensagem: ChatMessage) => void;
};

/**
 * Ferramentas ao lado do campo de mensagem: frases prontas, chave de acesso
 * remoto e "sem meu nome". Legado: `popChatAtendimento.php` (frases e "enviar
 * somente a mensagem") e `popChatAt_enviachave.php`.
 */
export function FerramentasDoCompositor({
  slug,
  apiUrl,
  sessionId,
  semNome,
  onSemNomeChange,
  onFrase,
  onChaveEnviada,
}: Props) {
  return (
    <div className="flex items-center gap-0.5">
      <MenuDeFrases slug={slug} apiUrl={apiUrl} onFrase={onFrase} />
      <BotaoDaChave slug={slug} apiUrl={apiUrl} sessionId={sessionId} semNome={semNome} onEnviada={onChaveEnviada} />
      <label
        className="flex cursor-pointer items-center gap-1 px-1 text-11 whitespace-nowrap text-secondary"
        title="Envia só a mensagem, sem o seu nome."
      >
        <input type="checkbox" checked={semNome} onChange={(e) => onSemNomeChange(e.target.checked)} />
        Sem meu nome
      </label>
    </div>
  );
}

const OPCAO_DA_FRASE =
  "block w-full border-b border-subtle px-3 py-2 text-left text-13 text-primary last:border-b-0 hover:bg-layer-1";

function GrupoDeFrases({
  titulo,
  frases,
  onEscolher,
}: {
  titulo: string;
  frases: FrasePronta[];
  onEscolher: (texto: string) => void;
}) {
  if (!frases.length) return null;
  return (
    <div>
      <div className="tracking-wider sticky top-0 bg-layer-1 px-3 py-1 text-11 font-semibold text-tertiary uppercase">
        {titulo}
      </div>
      {frases.map((f) => (
        <button key={f.id} type="button" onClick={() => onEscolher(f.texto)} className={OPCAO_DA_FRASE}>
          {f.texto}
        </button>
      ))}
    </div>
  );
}

function MenuDeFrases({ slug, apiUrl, onFrase }: { slug: string; apiUrl: string; onFrase: (texto: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState(false);
  const { frases, isLoading, refetch } = useFrasesProntas(apiUrl, slug);
  const { minhas, doEspaco } = groupFrases(frases);

  const escolher = (texto: string) => {
    onFrase(texto);
    setAberto(false);
  };

  const editarMinhas = () => {
    setAberto(false);
    setEditando(true);
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setAberto(!aberto)} className={BOTAO} title="Frases prontas">
        <MessageSquareText className="h-5 w-5" />
      </button>
      {aberto && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Fechar frases"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setAberto(false)}
          />
          <div className="shadow-lg absolute bottom-full left-0 z-20 mb-2 flex max-h-80 w-80 flex-col rounded-lg border border-subtle bg-surface-1">
            <div className="overflow-y-auto">
              <GrupoDeFrases titulo="Minhas frases" frases={minhas} onEscolher={escolher} />
              <GrupoDeFrases titulo="Do espaço" frases={doEspaco} onEscolher={escolher} />
              {frases.length === 0 && (
                <p className="px-3 py-3 text-12 text-secondary">
                  {isLoading ? "Carregando…" : "Nenhuma frase cadastrada."}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={editarMinhas}
              className="flex items-center gap-1.5 border-t border-subtle px-3 py-2 text-12 text-secondary hover:bg-layer-1 hover:text-primary"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar minhas frases
            </button>
          </div>
        </>
      )}
      {editando && (
        <JanelaDasMinhasFrases
          slug={slug}
          apiUrl={apiUrl}
          frases={minhas}
          isLoading={isLoading}
          onMudou={refetch}
          onFechar={() => setEditando(false)}
        />
      )}
    </div>
  );
}

/** As frases pessoais do atendente: só ele vê e edita. */
function JanelaDasMinhasFrases({
  slug,
  apiUrl,
  frases,
  isLoading,
  onMudou,
  onFechar,
}: {
  slug: string;
  apiUrl: string;
  frases: FrasePronta[];
  isLoading: boolean;
  onMudou: () => Promise<unknown>;
  onFechar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fechar"
        className="absolute inset-0 cursor-default bg-black/40"
        onClick={onFechar}
      />
      <div
        role="dialog"
        className="shadow-2xl relative mx-4 flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-subtle bg-surface-1 p-5"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary">Minhas frases</h2>
          <button type="button" onClick={onFechar} className="rounded p-1 text-secondary hover:bg-layer-2">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto">
          <EditorDeFrases
            slug={slug}
            apiUrl={apiUrl}
            escopo="pessoal"
            frases={frases}
            isLoading={isLoading}
            onMudou={onMudou}
            descricao="Só você vê estas frases. As do espaço continuam disponíveis no mesmo botão."
            vazio={<p className="text-13 text-secondary">Você ainda não tem frases próprias.</p>}
          />
        </div>
      </div>
    </div>
  );
}

function BotaoDaChave({
  slug,
  apiUrl,
  sessionId,
  semNome,
  onEnviada,
}: {
  slug: string;
  apiUrl: string;
  sessionId: string;
  semNome: boolean;
  onEnviada?: (mensagem: ChatMessage) => void;
}) {
  const api = useAtendenteApi(apiUrl);
  const [aberto, setAberto] = useState(false);
  const [chave, setChave] = useState("");
  const [erro, setErro] = useState<ErroDoChat | null>(null);
  const [enviando, setEnviando] = useState(false);

  const fechar = () => {
    setAberto(false);
    setChave("");
    setErro(null);
  };

  const enviar = async () => {
    setEnviando(true);
    try {
      onEnviada?.(await api.sendChave(slug, sessionId, chave, semNome));
      fechar();
    } catch (e) {
      const recusa = e as ErroDoChat;
      setErro(recusa);
      if (!recusa?.errors?.length)
        setToast({ type: TOAST_TYPE.ERROR, title: "Chave não enviada", message: recusa?.detail ?? "Tente de novo." });
    } finally {
      setEnviando(false);
    }
  };

  const erroDaChave = readErroDoCampo(erro, "chave");

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className={BOTAO} title="Enviar chave de acesso remoto">
        <KeyRound className="h-5 w-5" />
      </button>
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Fechar"
            className="absolute inset-0 cursor-default bg-black/40"
            onClick={fechar}
          />
          <div
            role="dialog"
            className="shadow-2xl relative mx-4 w-full max-w-sm rounded-xl border border-subtle bg-surface-1 p-5"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-primary">Chave de acesso remoto</h2>
              <button type="button" onClick={fechar} className="rounded p-1 text-secondary hover:bg-layer-2">
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              value={chave}
              onChange={(e) => setChave(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void enviar()}
              placeholder="Ex.: 123 456 789"
              className={`font-mono text-sm w-full rounded-md border bg-layer-2 px-3 py-2 text-primary outline-none ${
                erroDaChave ? "border-danger-primary" : "border-subtle"
              }`}
            />
            {erroDaChave && <p className="mt-1 text-11 text-danger-primary">{erroDaChave}</p>}
            <p className="mt-2 text-11 text-tertiary">O cliente recebe a chave em destaque, pronta para copiar.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={fechar}
                className="rounded-md px-3 py-1.5 text-13 text-secondary hover:bg-layer-2"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void enviar()}
                disabled={enviando}
                className="bg-primary rounded-md px-3 py-1.5 text-13 font-medium text-on-color disabled:opacity-50"
              >
                {enviando ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
