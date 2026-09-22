/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Um cartão = um endereço. O link só aparece quando existe de verdade: sem a
// configuração que ele exige, o cartão traz o aviso no lugar do link.

import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { buildEndereco, readCaminhoDoCartao, readValorInicial } from "@/components/links-uteis/helpers";
import type { TCampoDoLink, TCartaoDeLink } from "@/services/links-uteis.service";

const campoClasse = "rounded border border-subtle bg-surface-1 px-2 py-1 text-13";

type TCampoProps = { campo: TCampoDoLink; valor: string; onChange: (valor: string) => void };

/** Campo com lista fechada (os sistemas do espaço). */
function CampoComLista({ campo, valor, onChange }: TCampoProps) {
  return (
    <select aria-label={campo.rotulo} className={campoClasse} value={valor} onChange={(e) => onChange(e.target.value)}>
      {campo.opcoes.map((opcao) => (
        <option key={opcao.valor} value={opcao.valor}>
          {opcao.rotulo}
        </option>
      ))}
    </select>
  );
}

/** Campo digitado (o protocolo do atendimento). */
function CampoLivre({ campo, valor, onChange }: TCampoProps) {
  return (
    <input
      aria-label={campo.rotulo}
      className={campoClasse}
      placeholder={campo.exemplo}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Strategy do campo: lista quando a API manda opções, digitação quando não manda. */
const CAMPOS = { lista: CampoComLista, livre: CampoLivre };

const readTipoDoCampo = (campo: TCampoDoLink) => (campo.opcoes.length > 0 ? "lista" : "livre");

async function copiar(endereco: string) {
  try {
    await navigator.clipboard.writeText(endereco);
    setToast({ type: TOAST_TYPE.SUCCESS, title: "Copiado", message: "O endereço está na área de transferência." });
  } catch {
    setToast({
      type: TOAST_TYPE.ERROR,
      title: "Não deu para copiar",
      message: "Selecione o endereço na tela e copie.",
    });
  }
}

type Props = { cartao: TCartaoDeLink; origem: string };

function EnderecoDoCartao({ cartao, origem }: Props) {
  const [valor, setValor] = useState(() => readValorInicial(cartao));
  const endereco = buildEndereco(origem, readCaminhoDoCartao(cartao, valor));
  const Campo = cartao.campo ? CAMPOS[readTipoDoCampo(cartao.campo)] : null;

  return (
    <div className="mt-3 space-y-2">
      {Campo && cartao.campo && (
        <div className="flex items-center gap-2">
          <span className="text-12 text-secondary">{cartao.campo.rotulo}</span>
          <Campo campo={cartao.campo} valor={valor} onChange={setValor} />
        </div>
      )}

      <p className="font-mono truncate rounded border border-subtle bg-surface-2 px-2 py-1.5 text-12 text-secondary">
        {endereco || `Informe ${cartao.campo?.rotulo.toLowerCase() ?? "o valor"} para montar o endereço.`}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!endereco}
          onClick={() => void copiar(endereco)}
          className="flex items-center gap-1 rounded border border-subtle px-2 py-1 text-12 hover:bg-surface-2 disabled:opacity-50"
        >
          <Copy className="h-3.5 w-3.5" />
          Copiar
        </button>
        <a
          href={endereco || undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!endereco}
          className="flex items-center gap-1 rounded border border-subtle px-2 py-1 text-12 hover:bg-surface-2 aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Abrir em nova aba
        </a>
      </div>
    </div>
  );
}

export function CartaoDeLink({ cartao, origem }: Props) {
  return (
    <article className="rounded-lg border border-subtle bg-surface-1 p-4">
      <h3 className="text-14 font-semibold">{cartao.titulo}</h3>
      <p className="mt-1 text-13 text-secondary">{cartao.descricao}</p>
      <p className="mt-0.5 text-12 text-tertiary">{cartao.quemUsa}</p>

      {cartao.aviso ? (
        <p className="mt-3 rounded border border-subtle bg-surface-2 px-2 py-1.5 text-12 text-secondary">
          {cartao.aviso}
        </p>
      ) : (
        <EnderecoDoCartao cartao={cartao} origem={origem} />
      )}
    </article>
  );
}
