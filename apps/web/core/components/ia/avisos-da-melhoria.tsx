/**
 * As suspeitas da guarda do servidor sobre a proposta da IA.
 *
 * Ficam **junto do botão de aplicar**, e não no alto da janela, porque é ali que
 * a decisão acontece: "a IA pode ter perdido 4.2.1" só serve a quem está com o
 * dedo no botão. O trecho suspeito aparece inteiro — aviso genérico ("verifique
 * o texto") não ajuda ninguém a decidir.
 *
 * Elas informam e nada mais: a proposta chega inteira, a guarda não veta, e o
 * autor pode aplicar mesmo com aviso na tela. Sem suspeita nenhuma — provedor
 * externo que não sabe dizer, ou nada suspeito — o bloco não existe.
 */
import { TriangleAlert } from "lucide-react";
// plane imports
import { cn } from "@plane/utils";
// services
import type { TAvisosDeMelhoria } from "@/services/ai.service";

type TAvisosDaMelhoriaProps = {
  avisos: TAvisosDeMelhoria | null;
  className?: string;
};

type TLinha = {
  chave: keyof TAvisosDeMelhoria;
  rotulo: string;
};

const LINHAS: TLinha[] = [
  { chave: "perdidos", rotulo: "A IA pode ter perdido:" },
  { chave: "inventados", rotulo: "A IA pode ter inventado:" },
];

export const AvisosDaMelhoria = (props: TAvisosDaMelhoriaProps) => {
  const { avisos, className } = props;

  if (!avisos) return null;

  const linhas = LINHAS.filter((linha) => avisos[linha.chave].length > 0);
  if (linhas.length === 0) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border border-warning-primary/40 bg-warning-subtle p-2.5",
        className
      )}
    >
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning-primary" />
      <div className="min-w-0 space-y-1">
        {linhas.map((linha) => (
          <p key={linha.chave} className="flex flex-wrap items-center gap-1 text-12 text-secondary">
            <span className="font-medium text-primary">{linha.rotulo}</span>
            {avisos[linha.chave].map((trecho) => (
              <code key={trecho} className="rounded bg-surface-2 px-1 py-0.5 text-11 text-primary">
                {trecho}
              </code>
            ))}
          </p>
        ))}
        <p className="text-11 text-tertiary">Confira antes de aplicar. Nada foi bloqueado — a decisão é sua.</p>
      </div>
    </div>
  );
};
