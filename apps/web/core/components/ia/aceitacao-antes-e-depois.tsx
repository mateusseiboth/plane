/**
 * A nota do checklist antes e depois da proposta da IA.
 *
 * É **referência, não veredito** (Parte 3 do contrato): o checklist não decide
 * mais se vale melhorar — ele informa quem decide. Por isso os dois medidores
 * aparecem sem `minimo`: nenhuma linha a cruzar, nenhum botão travado por causa
 * do número.
 *
 * Reaproveita o `MedidorDeAceitacao` da análise ao salvar, que já sabe desenhar
 * a nota e a faixa; aqui só entram os rótulos que dizem qual é qual. Provedor
 * que não devolve as duas notas não desenha nada.
 */
import { ArrowRight } from "lucide-react";
// plane imports
import { cn } from "@plane/utils";
// components
import { MedidorDeAceitacao } from "@/components/ia/medidor-de-aceitacao";
// services
import type { TAceitacaoDaMelhoria } from "@/services/ai.service";

type TAceitacaoAntesEDepoisProps = {
  aceitacao: TAceitacaoDaMelhoria | null;
  className?: string;
};

export const AceitacaoAntesEDepois = (props: TAceitacaoAntesEDepoisProps) => {
  const { aceitacao, className } = props;

  if (!aceitacao) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-surface-2 px-3 py-2", className)}>
      <div>
        <p className="text-11 text-tertiary">O seu texto</p>
        <MedidorDeAceitacao aceitacao={aceitacao.antes} />
      </div>
      <ArrowRight className="size-4 shrink-0 text-tertiary" />
      <div>
        <p className="text-11 text-tertiary">Com a proposta da IA</p>
        <MedidorDeAceitacao aceitacao={aceitacao.depois} />
      </div>
      <p className="min-w-0 flex-1 text-11 text-tertiary">
        Referência do checklist de levantamento. A nota não aprova nem reprova nada — quem decide é você.
      </p>
    </div>
  );
};
