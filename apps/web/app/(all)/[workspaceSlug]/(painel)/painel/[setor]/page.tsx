"use client";

import { useParams, useRouter } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import { PainelTv } from "@/components/reports/painel-tv/painel-tv";

/** Painel de TV do TI ou da Qualidade, fora do layout com menu lateral. */
function PainelTvPage() {
  const { workspaceSlug, setor } = useParams() as { workspaceSlug: string; setor: string };
  const router = useRouter();

  return (
    <>
      <PageHead title="Painel" />
      <PainelTv
        workspaceSlug={workspaceSlug}
        setor={setor}
        onSair={() => router.push(`/${workspaceSlug}/reports`)}
        onTrocarSetor={(novo) => router.push(`/${workspaceSlug}/painel/${novo}`)}
      />
    </>
  );
}

export default PainelTvPage;
