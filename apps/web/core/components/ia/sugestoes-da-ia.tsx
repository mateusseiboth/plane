/**
 * Os trechos prontos que a IA devolve na análise.
 *
 * Sugestão que só pode ser lida obriga a redigitar; por isso cada trecho traz o
 * botão de colar, que joga o texto direto no editor de onde a análise saiu.
 * Sem `aoColar` os trechos continuam valendo como leitura — só não têm ação.
 */
import { ClipboardPaste } from "lucide-react";
// plane imports
import { cn } from "@plane/utils";

type TSugestoesDaIaProps = {
  sugestoes: string[];
  /** Recebe o trecho e o insere onde ele faz sentido (descrição, comentário). */
  aoColar?: (trecho: string) => void;
  rotuloColar?: string;
  className?: string;
};

export const SugestoesDaIa = (props: TSugestoesDaIaProps) => {
  const { sugestoes, aoColar, rotuloColar = "Colar", className } = props;

  if (sugestoes.length === 0) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-11 font-medium text-tertiary">Trechos sugeridos</p>
      <ul className="space-y-1.5">
        {sugestoes.map((trecho) => (
          <li
            key={trecho}
            className="flex items-start gap-2 rounded-md border border-subtle bg-layer-2 px-2.5 py-2"
          >
            <p className="min-w-0 flex-1 whitespace-pre-wrap text-12 text-secondary">{trecho}</p>
            {aoColar && (
              <button
                type="button"
                onClick={() => aoColar(trecho)}
                className="flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-11 text-accent-primary transition-colors hover:bg-layer-transparent-hover"
              >
                <ClipboardPaste className="size-3" />
                {rotuloColar}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
