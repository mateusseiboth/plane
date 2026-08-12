/**
 * O resultado da análise ao salvar, na modal do chamado (e abaixo da caixa de
 * comentário, que não tem modal).
 *
 * A ordem é a de quem lê com pressa: primeiro a nota, depois a frase curta que
 * resume, depois o que exatamente falta, e só então os trechos prontos e os
 * cinco porquês. No modo `exigir` a faixa de bloqueio vem antes de tudo, porque
 * é ela que explica por que o botão parou.
 *
 * Nada a dizer → o componente não existe. Recurso desligado nunca chega aqui:
 * quem decide é o `useAnaliseDeChamado`.
 */
import { RefreshCw, Sparkles } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
// components
import { CincoPorques } from "@/components/ia/cinco-porques";
import { ItensFaltantes } from "@/components/ia/itens-faltantes";
import { MedidorDeAceitacao } from "@/components/ia/medidor-de-aceitacao";
import { SugestoesDaIa } from "@/components/ia/sugestoes-da-ia";
// services
import type { TAnaliseDeChamado } from "@/services/analise-de-chamado.service";
import { itensFaltantesDosBlocos } from "@/services/analise-de-chamado.service";

type TPainelDeAnaliseProps = {
  analise: TAnaliseDeChamado | null;
  /** `mostrar_indicador` da configuração do espaço. */
  mostrarIndicador?: boolean;
  /** Modo `exigir` com nota abaixo do mínimo: o salvar está travado. */
  bloqueado?: boolean;
  minimoAceitacao?: number;
  analisando?: boolean;
  aoReanalisar?: () => void;
  /** Cola um trecho sugerido no editor de onde a análise veio. */
  aoColar?: (trecho: string) => void;
  rotuloColar?: string;
  className?: string;
};

export const PainelDeAnalise = (props: TPainelDeAnaliseProps) => {
  const {
    analise,
    mostrarIndicador = true,
    bloqueado = false,
    minimoAceitacao,
    analisando = false,
    aoReanalisar,
    aoColar,
    rotuloColar,
    className,
  } = props;

  if (!analise) return null;

  const faltantes = itensFaltantesDosBlocos(analise.blocos);

  return (
    <div
      className={cn(
        "space-y-3 rounded-md border bg-surface-2 p-3",
        bloqueado ? "border-danger-strong" : "border-subtle",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="size-3.5 shrink-0 text-accent-primary" />
          <span className="text-11 font-medium text-tertiary">Análise de levantamento de requisitos</span>
        </div>
        {aoReanalisar && (
          <Button
            variant="ghost"
            size="sm"
            onClick={aoReanalisar}
            loading={analisando}
            prependIcon={<RefreshCw />}
            className="shrink-0"
          >
            Analisar de novo
          </Button>
        )}
      </div>

      {bloqueado && (
        <p className="rounded-sm bg-danger-subtle px-2.5 py-1.5 text-12 text-danger-primary">
          Este espaço exige {minimoAceitacao}% de aceitação para salvar. Complete os itens abaixo e analise de novo.
        </p>
      )}

      {mostrarIndicador && (
        <MedidorDeAceitacao aceitacao={analise.aceitacao} minimo={bloqueado ? minimoAceitacao : null} />
      )}

      {analise.feedback.trim().length > 0 && (
        <p className="whitespace-pre-wrap text-12 text-secondary">{analise.feedback}</p>
      )}

      <ItensFaltantes itens={faltantes} inicialmenteAberto rotulo={`O que falta (${faltantes.length})`} />

      <SugestoesDaIa sugestoes={analise.sugestoes} aoColar={aoColar} rotuloColar={rotuloColar} />

      <CincoPorques porques={analise.porques} />
    </div>
  );
};
