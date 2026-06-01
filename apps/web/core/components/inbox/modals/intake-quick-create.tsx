"use client";

import { useState } from "react";
import { observer } from "mobx-react";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { useProject } from "@/hooks/store/use-project";
import { InboxIssueCreateModalRoot } from "./create-modal/modal";

// D2 — Para usuários do tipo Atendimento, "criar novo item" abre um intake.
// Primeiro escolhem o projeto (entre os projetos onde são Atendimento) e então
// o formulário de intake daquele projeto.
type Props = {
  workspaceSlug: string;
  projectIds: string[];
  isOpen: boolean;
  onClose: () => void;
};

export const IntakeQuickCreate = observer(function IntakeQuickCreate(props: Props) {
  const { workspaceSlug, projectIds, isOpen, onClose } = props;
  const { getProjectById } = useProject();
  // pré-seleciona quando há apenas um projeto
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projectIds.length === 1 ? projectIds[0] : null
  );

  const close = () => {
    setSelectedProjectId(projectIds.length === 1 ? projectIds[0] : null);
    onClose();
  };

  if (!isOpen) return null;

  if (selectedProjectId) {
    return (
      <InboxIssueCreateModalRoot
        workspaceSlug={workspaceSlug}
        projectId={selectedProjectId}
        modalState={isOpen}
        handleModalClose={close}
      />
    );
  }

  // seletor de projeto
  return (
    <ModalCore isOpen={isOpen} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <div className="p-5">
        <h3 className="mb-1 text-lg font-medium text-primary">Novo intake</h3>
        <p className="mb-4 text-xs text-secondary-text">Selecione o projeto para abrir um novo intake.</p>
        <div className="max-h-[320px] space-y-1 overflow-y-auto">
          {projectIds.length === 0 && (
            <p className="py-6 text-center text-sm text-secondary-text">Você não pertence a nenhum projeto de atendimento.</p>
          )}
          {projectIds.map((pid) => {
            const project = getProjectById(pid);
            return (
              <button
                key={pid}
                onClick={() => setSelectedProjectId(pid)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-primary transition-colors hover:bg-surface-2"
              >
                <span className="font-medium">{project?.identifier ?? ""}</span>
                <span className="truncate">{project?.name ?? pid}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={close} className="rounded-md px-3 py-1.5 text-sm text-secondary-text hover:bg-surface-2">
            Cancelar
          </button>
        </div>
      </div>
    </ModalCore>
  );
});
