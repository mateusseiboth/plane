/**
 * O que a análise faz com o resultado. Cada modo carrega uma frase que diz o
 * que acontece na prática — a diferença entre eles não é de intensidade, é de
 * consequência, e só um deles impede alguém de trabalhar.
 */
import { AlertTriangle } from "lucide-react";
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { MODOS_DE_ANALISE, type TModoDeAnalise } from "@/services/configuracao-de-ia.service";

const DESCRICAO_DOS_MODOS: Record<TModoDeAnalise, { label: string; descricao: string }> = {
  avisar: {
    label: "Avisar",
    descricao: "Mostra o que falta e deixa salvar assim mesmo. Recomendado.",
  },
  exigir: {
    label: "Exigir",
    descricao: "Bloqueia o salvamento enquanto a nota estiver abaixo da mínima.",
  },
  silencioso: {
    label: "Silencioso",
    descricao: "Analisa e guarda o resultado sem mostrar nada a quem salva.",
  },
};

const OPCOES = MODOS_DE_ANALISE.map((modo) => ({
  value: modo,
  label: DESCRICAO_DOS_MODOS[modo].label,
  descricao: DESCRICAO_DOS_MODOS[modo].descricao,
}));

type Props = {
  valor: TModoDeAnalise;
  onChange: (modo: TModoDeAnalise) => void;
  minimoAceitacao: number;
  disabled?: boolean;
};

export function SeletorDeModo(props: Props) {
  const { valor, onChange, minimoAceitacao, disabled = false } = props;

  return (
    <div className="flex flex-col gap-3">
      <SelectPesquisavel<TModoDeAnalise>
        value={valor}
        onChange={onChange}
        opcoes={OPCOES}
        disabled={disabled}
        className="w-full max-w-sm"
      />
      <p className="text-13 text-secondary">{DESCRICAO_DOS_MODOS[valor].descricao}</p>

      {valor === "exigir" && !disabled && <AvisoDoModoExigir minimoAceitacao={minimoAceitacao} />}
    </div>
  );
}

/**
 * O único modo com consequência dura merece um aviso do tamanho da
 * consequência: alguém vai ficar sem conseguir abrir o chamado.
 */
function AvisoDoModoExigir({ minimoAceitacao }: { minimoAceitacao: number }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-warning-primary/40 bg-warning-subtle p-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-primary" />
      <div className="min-w-0 text-13 text-secondary">
        <p className="text-sm font-medium text-primary">Este modo impede o salvamento</p>
        <p className="mt-0.5">
          Quem escrever um chamado com nota abaixo de <strong>{minimoAceitacao}%</strong> não consegue salvar até
          melhorar o texto. Use quando a equipe já conhece o checklist — em time novo, prefira{" "}
          <strong>Avisar</strong>.
        </p>
        <p className="mt-1">
          Se a IA estiver fora do ar ou demorar demais, o chamado salva normalmente mesmo neste modo: um serviço
          indisponível nunca trava o trabalho.
        </p>
      </div>
    </div>
  );
}
