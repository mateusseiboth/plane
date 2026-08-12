/**
 * Medidor de aceitação: quanto do checklist da Aula 18-3 o chamado já atende.
 *
 * A nota vem do checklist determinístico do lado do modelo, não da conversa —
 * por isso vale mostrá-la como número. Sem nota (`null`) o medidor não aparece:
 * um zero inventado seria pior que silêncio.
 */
import { CircularProgressIndicator } from "@plane/ui";
import { cn } from "@plane/utils";

type TMedidorDeAceitacaoProps = {
  aceitacao: number | null;
  /** Só no modo `exigir`: a linha que o chamado precisa cruzar para salvar. */
  minimo?: number | null;
  className?: string;
};

type TFaixa = {
  ate: number;
  traco: string;
  texto: string;
  rotulo: string;
};

/** Da pior para a melhor: a primeira faixa que couber ganha. */
const FAIXAS: TFaixa[] = [
  { ate: 49, traco: "stroke-danger-primary", texto: "text-danger-primary", rotulo: "Levantamento incompleto" },
  { ate: 79, traco: "stroke-warning-primary", texto: "text-warning-primary", rotulo: "Dá para melhorar" },
  { ate: 100, traco: "stroke-success-primary", texto: "text-success-primary", rotulo: "Pronto para virar teste" },
];

const faixaDe = (aceitacao: number): TFaixa => FAIXAS.find((faixa) => aceitacao <= faixa.ate) ?? FAIXAS[2];

export const MedidorDeAceitacao = (props: TMedidorDeAceitacaoProps) => {
  const { aceitacao, minimo, className } = props;

  if (aceitacao === null) return null;

  const faixa = faixaDe(aceitacao);
  const abaixoDoMinimo = typeof minimo === "number" && aceitacao < minimo;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <CircularProgressIndicator size={44} strokeWidth={4} percentage={aceitacao} strokeColor={faixa.traco}>
        <span className={cn("text-11 font-semibold", faixa.texto)}>{aceitacao}</span>
      </CircularProgressIndicator>
      <div className="min-w-0">
        <p className="text-13 font-medium text-primary">{aceitacao}% de aceitação</p>
        <p className={cn("text-11", abaixoDoMinimo ? "text-danger-primary" : "text-tertiary")}>
          {abaixoDoMinimo ? `Mínimo exigido neste espaço: ${minimo}%` : faixa.rotulo}
        </p>
      </div>
    </div>
  );
};
