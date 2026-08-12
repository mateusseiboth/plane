/**
 * Os cinco porquês (Parte 2 da Aula 18-3), quando a causa raiz não está clara.
 *
 * O contrato diz que a lista só vem preenchida nesse caso — então lista vazia
 * é lista que não se desenha, nem como título.
 */
import { cn } from "@plane/utils";

type TCincoPorquesProps = {
  porques: string[];
  className?: string;
};

export const CincoPorques = (props: TCincoPorquesProps) => {
  const { porques, className } = props;

  if (porques.length === 0) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-11 font-medium text-tertiary">Cinco porquês</p>
      <ol className="space-y-1">
        {porques.map((porque, indice) => (
          <li key={porque} className="flex gap-2 text-12 text-secondary">
            <span className="shrink-0 text-placeholder">{indice + 1}.</span>
            <span className="min-w-0">{porque}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};
