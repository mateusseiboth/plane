import type { TIssue } from "@plane/types";
import { ModalDeMotivo } from "@/components/inbox/modals/modal-de-motivo";
import { REGRAS_DO_NAO_ATENDIDO } from "@/components/inbox/modals/regras-do-motivo";
import { formatNumeroNoSistema } from "@/helpers/numero-no-sistema.helper";
import { useProject } from "@/hooks/store/use-project";

type Props = {
  data: Partial<TIssue>;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (motivo: string) => Promise<void>;
};

/** "Não atendido": o motivo vai para a Qualidade e o chamado volta para a triagem. */
export function NaoAtendidoModal(props: Props) {
  const { isOpen, onClose, data, onSubmit } = props;
  const { getProjectById } = useProject();
  const sistema = data.project_id ? getProjectById(data.project_id) : undefined;

  return (
    <ModalDeMotivo
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={onSubmit}
      regras={REGRAS_DO_NAO_ATENDIDO}
      titulo="Não atendido"
      descricao={
        <>
          <span className="font-medium text-primary">{formatNumeroNoSistema(sistema, data.sequence_id)}</span> volta
          para a triagem. A Qualidade recebe o que faltou.
        </>
      }
      rotulo="O que faltou"
      placeholder="O que o cliente ainda não consegue fazer"
      botao={{ texto: "Devolver para a triagem", enviando: "Devolvendo", variante: "error-fill" }}
    />
  );
}
