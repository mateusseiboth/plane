/**
 * Texto fantasma para campos de uma linha — `<input>` e `<textarea>`. O editor
 * de descrição resolve isso com decoração do ProseMirror, mas um campo comum
 * não tem onde pendurar nada.
 *
 * A técnica é uma cópia invisível do que já foi digitado, desenhada por cima do
 * campo com a mesma tipografia e o mesmo espaçamento; a sugestão vem logo
 * depois dela, em cinza, e por isso cai exatamente à frente do cursor.
 *
 * Duas situações em que ele se cala em vez de mentir sobre a posição: cursor
 * fora do fim do texto, e `textarea` que já passou de uma linha. E se o texto
 * passar da largura visível, o `overflow-hidden` engole a sugestão — some em
 * silêncio, que é o comportamento certo.
 */
import { useState } from "react";
import type { KeyboardEvent, ReactNode, SyntheticEvent } from "react";
// plane imports
import { cn } from "@plane/utils";

type TCampoDeTexto = HTMLInputElement | HTMLTextAreaElement;

type TTextoFantasmaInputProps = {
  valor: string;
  sugestao: string;
  /** Espelhe as classes de espaçamento, borda e tipografia do campo embrulhado. */
  classNameCampo?: string;
  children: ReactNode;
  onAceitar: (texto: string) => void;
  onDescartar: () => void;
};

const ehCampoDeTexto = (alvo: EventTarget | null): alvo is TCampoDeTexto =>
  typeof (alvo as TCampoDeTexto | null)?.selectionStart === "number";

/**
 * Um `textarea` de uma linha se comporta como `input`. Quebrou linha, não há
 * onde desenhar a continuação sem errar a posição.
 */
const cabeEmUmaLinha = (campo: TCampoDeTexto) => {
  if (campo.tagName !== "TEXTAREA") return true;
  if (campo.value.includes("\n")) return false;
  const estilo = window.getComputedStyle(campo);
  const linha = Number.parseFloat(estilo.lineHeight);
  if (!Number.isFinite(linha) || linha <= 0) return false;
  const conteudo = campo.scrollHeight - Number.parseFloat(estilo.paddingTop) - Number.parseFloat(estilo.paddingBottom);
  return conteudo < linha * 1.5;
};

export const TextoFantasmaInput = (props: TTextoFantasmaInputProps) => {
  const { valor, sugestao, classNameCampo, children, onAceitar, onDescartar } = props;
  const [cabe, setCabe] = useState(true);

  const mostrar = sugestao.length > 0 && cabe;

  const conferirCampo = (evento: SyntheticEvent) => {
    if (!ehCampoDeTexto(evento.target)) return;
    const campo = evento.target;
    setCabe(campo.selectionStart === campo.value.length && cabeEmUmaLinha(campo));
  };

  const aoTeclar = (evento: KeyboardEvent<HTMLDivElement>) => {
    if (!mostrar) return;
    if (evento.key === "Tab") {
      evento.preventDefault();
      onAceitar(valor + sugestao);
      return;
    }
    if (evento.key === "Escape") {
      // sem isto o Esc fecharia o modal em vez de descartar a sugestão
      evento.preventDefault();
      evento.stopPropagation();
      onDescartar();
    }
  };

  return (
    <div
      // a interação é toda do campo embrulhado; este contêiner só escuta o que
      // sobe dele para posicionar o fantasma e tratar Tab/Esc
      role="presentation"
      className="relative"
      onKeyDown={aoTeclar}
      onKeyUp={conferirCampo}
      onSelect={conferirCampo}
      onClick={conferirCampo}
    >
      {children}
      {mostrar && (
        <div
          aria-hidden
          className={cn("pointer-events-none absolute inset-0 overflow-hidden whitespace-pre", classNameCampo)}
        >
          <span className="invisible">{valor}</span>
          <span className="text-placeholder">{sugestao}</span>
        </div>
      )}
    </div>
  );
};
