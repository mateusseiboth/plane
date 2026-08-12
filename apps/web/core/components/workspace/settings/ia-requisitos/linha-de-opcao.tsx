/**
 * Uma opção da tela de IA de requisitos: nome, o que ela faz em português
 * claro e o controle correspondente.
 *
 * Opção que não vale agora fica **visível e apagada**, com o motivo escrito.
 * Sumir com o controle esconde a existência do recurso; deixá-lo clicável sem
 * efeito faz a pessoa acreditar que configurou algo. O meio-termo é mostrar,
 * apagar e dizer por quê.
 */
import type { ReactNode } from "react";
import { cn } from "@plane/utils";

type Props = {
  titulo: string;
  explicacao: ReactNode;
  /** Quando presente, a linha aparece apagada e este é o motivo exibido. */
  motivoDesabilitado?: string;
  /** Controles largos (select, campo de texto) ficam abaixo do texto. */
  controleAbaixo?: boolean;
  children: ReactNode;
};

export function LinhaDeOpcao(props: Props) {
  const { titulo, explicacao, motivoDesabilitado, controleAbaixo = false, children } = props;

  return (
    <div className="rounded-md border border-subtle p-3">
      <div className="flex items-center justify-between gap-4">
        <div className={cn("min-w-0", { "opacity-60": Boolean(motivoDesabilitado) })}>
          <p className="text-sm font-medium text-primary">{titulo}</p>
          <p className="text-13 text-secondary">{explicacao}</p>
        </div>
        {!controleAbaixo && <div className="shrink-0">{children}</div>}
      </div>

      {controleAbaixo && <div className="mt-3">{children}</div>}

      {motivoDesabilitado && <p className="mt-2 text-11 text-tertiary">{motivoDesabilitado}</p>}
    </div>
  );
}
