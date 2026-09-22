"use client";

import { observer } from "mobx-react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHead } from "@/components/core/page-title";
import { VisitDetail } from "@/components/technical-visits/visit-detail";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useTechnicalVisit } from "@/hooks/use-technical-visits";

function VisitNotFound() {
  const router = useRouter();
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="rounded-lg border border-subtle bg-surface-1 p-6 text-center">
        <h1 className="text-base font-semibold">Visita não encontrada</h1>
        <p className="mt-2 text-13 text-secondary">A visita pode ter sido removida ou você não tem acesso a ela.</p>
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-4 inline-flex items-center gap-2 rounded bg-accent-primary px-3 py-2 text-13 font-medium text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </button>
      </div>
    </div>
  );
}

function TechnicalVisitDetailPage() {
  const { workspaceSlug, visitId } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { currentWorkspace } = useWorkspace();
  const { data: visit, isLoading, refetch } = useTechnicalVisit(slug, visitId?.toString());
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Visita Técnica` : "Visita Técnica";

  if (isLoading) {
    return <div className="flex h-full items-center justify-center p-6 text-secondary">Carregando visita...</div>;
  }
  if (!visit) return <VisitNotFound />;

  return (
    <>
      <PageHead title={pageTitle} />
      <VisitDetail
        key={visit.id}
        workspaceSlug={slug}
        visit={visit}
        onSaved={(salva) => void refetch(salva, { revalidate: false })}
      />
    </>
  );
}

export default observer(TechnicalVisitDetailPage);
