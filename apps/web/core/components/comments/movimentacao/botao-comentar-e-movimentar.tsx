import { observer } from "mobx-react";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";

export type TMovimentacaoDoComentario = {
  projectId: string;
  stateId: string | null | undefined;
  mover: (stateId: string) => Promise<void>;
};

type Props = {
  movimentacao: TMovimentacaoDoComentario;
  disabled: boolean;
  onEscolherEtapa: (stateId: string) => void;
};

/**
 * Ao lado de "Comentário": grava o comentário e pergunta para qual etapa o
 * chamado vai. A lista é a do seletor de etapa, já filtrada pelas transições
 * da função de quem está logado.
 */
export const BotaoComentarEMovimentar = observer(function BotaoComentarEMovimentar(props: Props) {
  const { movimentacao, disabled, onEscolherEtapa } = props;

  return (
    <StateDropdown
      value={movimentacao.stateId}
      projectId={movimentacao.projectId}
      onChange={(stateId) => stateId !== movimentacao.stateId && onEscolherEtapa(stateId)}
      disabled={disabled}
      buttonVariant="border-with-text"
      placement="top-end"
      button={
        <span className="flex items-center rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5 text-11 font-medium whitespace-nowrap text-primary hover:bg-surface-2">
          Comentar e movimentar
        </span>
      }
    />
  );
});
