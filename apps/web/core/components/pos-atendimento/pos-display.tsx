/**
 * Peças de exibição do pós-atendimento usadas pela fila, pelo painel do detalhe e
 * pelo relatório.
 */
import { cn } from "@plane/utils";
import { VisitFieldError } from "@/components/technical-visits/visit-display";
import { formatData } from "@/components/pos-atendimento/helpers";
import type { TPosAtendimento, TPosPessoa, TPosSituacao } from "@/components/pos-atendimento/types";

const SITUACAO_CORES: Record<TPosSituacao, string> = {
  pending: "bg-orange-100 text-orange-800",
  to_verify: "bg-yellow-100 text-yellow-800",
  verified: "bg-green-100 text-green-800",
};

export function PosSituacaoBadge({ situacao, label }: { situacao: TPosSituacao; label: string }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-11 font-medium", SITUACAO_CORES[situacao])}>{label}</span>;
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  if (!valor) return null;
  return (
    <div className="flex gap-2 text-13">
      <span className="w-40 shrink-0 text-secondary">{rotulo}</span>
      <span className="whitespace-pre-wrap text-primary">{valor}</span>
    </div>
  );
}

/** "22/09/2026 por Ana" (ou só a data, se a conta não existe mais). */
const describeQuando = (data: string | null, pessoa: TPosPessoa | null) => {
  if (!data) return null;
  return pessoa ? `${formatData(data)} por ${pessoa.display_name}` : formatData(data);
};

/** O que foi respondido, quem registrou e quem verificou. */
export function PosDetalhes({ pos }: { pos: TPosAtendimento }) {
  return (
    <div className="space-y-1.5">
      <Linha rotulo="Atendeu a expectativa" valor={pos.expectativa_label} />
      <Linha rotulo="Classificação" valor={pos.classificacao_label} />
      <Linha rotulo="Problema resolvido" valor={pos.problema_resolvido_label} />
      <Linha rotulo="Meio de contato" valor={pos.meio_contato_label} />
      <Linha rotulo="Observação" valor={pos.observacao} />
      <Linha rotulo="Registrado" valor={describeQuando(pos.recorded_at, pos.recorded_by)} />
      <Linha rotulo="Verificado" valor={describeQuando(pos.verified_at, pos.verified_by)} />
      <Linha rotulo="Comentário da verificação" valor={pos.verification_comment} />
    </div>
  );
}

type TOpcao = { value: string; label: string };

/** Grupo de opções do formulário, com a mensagem da API embaixo. */
export function OpcoesRadio(props: {
  name: string;
  titulo: string;
  options: TOpcao[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const { name, titulo, options, value, onChange, error } = props;
  return (
    <fieldset>
      <legend className="mb-1 text-12 font-medium text-secondary">{titulo}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded border px-3 py-1.5 text-13",
              value === o.value ? "border-accent-primary text-accent-primary" : "border-subtle text-secondary"
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
      <VisitFieldError message={error} />
    </fieldset>
  );
}
