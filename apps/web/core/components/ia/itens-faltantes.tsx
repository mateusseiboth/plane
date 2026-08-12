/**
 * O que ainda falta no chamado segundo o checklist de aceitação da Aula 18-3.
 *
 * Uma linha discreta logo abaixo do editor, recolhida por padrão: é onde os
 * olhos de quem escreve já estão, e não rouba espaço da caixa de texto. Com a
 * lista vazia — inclusive quando a IA está desligada — não sobra borda nem
 * espaço reservado: o componente simplesmente não existe.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
// plane imports
import { cn } from "@plane/utils";
// services
import type { TItemFaltante } from "@/services/sugestao-de-requisito.service";

type TItensFaltantesProps = {
  itens: TItemFaltante[];
  className?: string;
};

const rotuloDe = (total: number) =>
  total === 1 ? "Falta 1 item do levantamento" : `Faltam ${total} itens do levantamento`;

export const ItensFaltantes = (props: TItensFaltantesProps) => {
  const { itens, className } = props;
  const [aberto, setAberto] = useState(false);

  if (itens.length === 0) return null;

  return (
    <div className={cn("text-11 text-tertiary", className)}>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setAberto((anterior) => !anterior)}
        className="flex items-center gap-1 transition-colors hover:text-secondary"
      >
        {aberto ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <span>{rotuloDe(itens.length)}</span>
      </button>
      {aberto && (
        <ul className="mt-1 space-y-0.5 pl-4">
          {itens.map((item) => (
            <li key={`${item.bloco}-${item.item}`} className="flex gap-1.5">
              <span className="shrink-0 text-placeholder">{item.bloco}</span>
              <span>{item.item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
