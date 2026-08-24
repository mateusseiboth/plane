/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * A janela que pede a resposta ao cliente quando um chamado do portal é concluído.
 *
 * Fica montada no espaço de trabalho inteiro, não em uma tela: concluir acontece
 * no quadro, no detalhe, no peek, na planilha e na triagem, e a janela precisa
 * aparecer venha a conclusão de onde vier. Quem manda é o servidor — ver
 * `use-resposta-ao-cliente`.
 *
 * Responder é OPCIONAL. Bloquear a conclusão faria o cartão voltar sozinho para
 * a coluna anterior e travaria o time por um texto que ninguém escreveu ainda.
 * Em vez disso a conclusão passa, a janela cobra, e "concluir sem responder" é
 * um clique explícito que fica gravado com nome e hora.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalWidth, ModalCore } from "@plane/ui";
import { useRespostaAoCliente } from "@/hooks/use-resposta-ao-cliente";

const LIMITE = 20000;

/**
 * O que a janela promete depende de onde veio a solicitação.
 *
 * Prometer "aparece em Minhas solicitações" para um pedido que o atendimento
 * abriu pelo telefone seria mentira: não existe portal do outro lado. Ali a
 * resposta chega pelo sino de quem abriu, e é isso que a frase diz.
 */
function ondeVaiAparecer(atual: { cliente?: string; origem?: string }): string {
  const quem = atual.cliente || "Quem abriu";
  if (atual.origem === "portal")
    return `${quem} abriu esta solicitação pelo portal. O que você escrever aqui aparece para ele em “Minhas solicitações”.`;
  return `${quem} abriu esta solicitação. O que você escrever aqui fica no chamado e avisa essa pessoa.`;
}

export function RespostaAoClienteModal() {
  const { workspaceSlug } = useParams();
  const { atual, adiar, resolver } = useRespostaAoCliente(workspaceSlug?.toString());
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Cada chamado começa com a caixa em branco: texto que sobrou do anterior iria
  // para o cliente errado.
  useEffect(() => setTexto(""), [atual?.issue_id]);

  if (!atual) return null;

  const executar = async (conteudo: string | undefined, sucesso: string) => {
    setEnviando(true);
    try {
      await resolver(conteudo);
      setToast({ type: TOAST_TYPE.SUCCESS, title: sucesso });
    } catch (erro: unknown) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Não foi possível registrar a resposta",
        message: (erro as { detail?: string })?.detail ?? "Tente novamente em instantes.",
      });
    } finally {
      setEnviando(false);
    }
  };

  const doPortal = atual.origem === "portal";

  return (
    <ModalCore isOpen handleClose={adiar} width={EModalWidth.XXL}>
      <div className="flex flex-col gap-4 p-5">
        <div>
          <h3 className="text-lg font-medium text-primary">
            {doPortal ? "Responder ao cliente" : "Responder a solicitação"}
          </h3>
          <p className="mt-1 text-13 text-secondary">
            <span className="font-medium">{atual.codigo}</span> · {atual.titulo}
          </p>
          <p className="mt-2 text-13 text-secondary">{ondeVaiAparecer(atual)}</p>
        </div>

        <textarea
          value={texto}
          maxLength={LIMITE}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Conte o que foi feito, em uma linguagem que quem pediu entenda."
          className="focus:border-accent-primary min-h-40 w-full resize-y rounded-md border border-strong bg-layer-1 p-3 text-13 text-primary outline-none"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="link"
            size="lg"
            disabled={enviando}
            onClick={() => void executar(undefined, "Chamado concluído sem resposta ao cliente")}
          >
            Concluir sem responder
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="lg" disabled={enviando} onClick={adiar}>
              Agora não
            </Button>
            <Button
              variant="primary"
              size="lg"
              loading={enviando}
              disabled={enviando || !texto.trim()}
              onClick={() => void executar(texto.trim(), "Resposta enviada ao cliente")}
            >
              Enviar resposta
            </Button>
          </div>
        </div>
      </div>
    </ModalCore>
  );
}
