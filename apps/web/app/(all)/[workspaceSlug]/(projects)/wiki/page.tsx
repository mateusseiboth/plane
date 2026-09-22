/** Início da wiki: sem página aberta, convida a escolher ou criar uma. */
import { observer } from "mobx-react";
import { BookOpen } from "lucide-react";
import { Button } from "@plane/propel/button";
import { PageHead } from "@/components/core/page-title";
import { useWikiAcoes } from "@/components/wiki/use-wiki";
import { useWikiOperations } from "@/components/wiki/use-wiki-operations";
import type { Route } from "./+types/page";

function WikiHomePage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { canEdit } = useWikiAcoes(workspaceSlug);
  const { createPagina } = useWikiOperations(workspaceSlug);

  return (
    <>
      <PageHead title="Wiki" />
      <div className="grid size-full place-items-center px-4">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <BookOpen className="size-10 text-tertiary" />
          <h3 className="text-16 font-medium text-primary">Wiki do espaço</h3>
          <p className="text-13 text-secondary">Escolha uma página na barra ao lado ou crie uma nova.</p>
          {canEdit && (
            <Button variant="primary" onClick={() => void createPagina(null)}>
              Nova página
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

export default observer(WikiHomePage);
