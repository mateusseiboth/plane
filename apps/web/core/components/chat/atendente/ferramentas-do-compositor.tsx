/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import { MessageSquareText, Pencil, X } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// local imports
import { EditorDeFrases } from "@/components/chat/atendente/aba-de-frases";
import { groupFrases } from "@/components/chat/atendente/atendente-helpers";
import { useAtendenteApi, useFrasesProntas } from "@/components/chat/atendente/use-atendente";
import type { FrasePronta } from "@/services/atendente.service";

const BOTAO = "rounded-lg p-2 text-secondary transition-colors hover:bg-layer-2 hover:text-primary";

type Props = {
  slug: string;
  apiUrl: string;
  /** Enviar sem o nome do atendente. */
  semNome: boolean;
  onSemNomeChange: (valor: boolean) => void;
  /** Frase escolhida: o compositor a coloca no rascunho. */
  onFrase: (texto: string) => void;
};

/**
 * Ferramentas ao lado do campo de mensagem: frases prontas e "sem meu nome".
 * Legado: `popChatAtendimento.php` (frases e "enviar somente a mensagem"). O
 * envio de chave de acesso remoto saiu da tela a pedido do dono; a rota
 * continua no chat-backend.
 */
export function FerramentasDoCompositor({ slug, apiUrl, semNome, onSemNomeChange, onFrase }: Props) {
  return (
    <div className="flex items-center gap-0.5">
      <MenuDeFrases slug={slug} apiUrl={apiUrl} onFrase={onFrase} />
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
