/**
 * Ação "Criar visita técnica" no detalhe do chamado. A visita nasce vinculada ao
 * chamado; entidade, cidade e sistema vêm dele (a API completa).
 */
import { useState } from "react";
import { MapPin } from "lucide-react";
import { IconButton } from "@plane/propel/icon-button";
import { Tooltip } from "@plane/propel/tooltip";
import { useAppRouter } from "@/hooks/use-app-router";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { useVisitPermissions } from "@/hooks/use-technical-visits";
import { CreateVisitModal, type TVisitSourceIssue } from "./create-visit-modal";

type Props = {
  workspaceSlug: string;
  issue: TVisitSourceIssue;
};

export function CreateVisitFromIssueButton({ workspaceSlug, issue }: Props) {
  const router = useAppRouter();
  const { isMobile } = usePlatformOS();
  const { canRegister } = useVisitPermissions(workspaceSlug);
  const [aberto, setAberto] = useState(false);

  if (!canRegister) return null;

  return (
    <>
      <Tooltip tooltipContent="Criar visita técnica" isMobile={isMobile}>
        <IconButton
          variant="secondary"
          size="lg"
          icon={MapPin}
          onClick={() => setAberto(true)}
          aria-label="Criar visita técnica"
        />
      </Tooltip>
      {aberto && (
        <CreateVisitModal
          workspaceSlug={workspaceSlug}
          sourceIssue={issue}
          onClose={() => setAberto(false)}
          onCreated={(visit) => router.push(`/${workspaceSlug}/visits/${visit.id}`)}
        />
      )}
    </>
  );
}
