"use client";

/**
 * Painel de TV em tela cheia: `/:workspaceSlug/painel/:painel`.
 *
 * Fica FORA do layout do espaço de propósito: a TV abre esta URL sem login do
 * Plane, com a chave do painel em `?key=`. Quem já está logado no espaço abre
 * sem chave nenhuma, seja qual for o papel.
 */
import { useParams } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import { ErroDoPainel } from "@/components/painel-tv/moldura";
import { PainelDaTvPage } from "@/components/painel-tv/painel-da-tv";
import { isPainelDaTv, readTituloDoPainel } from "@/components/painel-tv/painel-helpers";

function PainelDeTvPage() {
  const { workspaceSlug, painel } = useParams() as { workspaceSlug: string; painel: string };
  const busca = typeof window === "undefined" ? "" : window.location.search;

  if (!isPainelDaTv(painel)) {
    return (
      <ErroDoPainel mensagem="Painel desconhecido" detalhe="Confira o endereço do painel na tela de Relatórios." />
    );
  }

  return (
    <>
      <PageHead title={readTituloDoPainel(painel)} />
      <PainelDaTvPage workspaceSlug={workspaceSlug} painel={painel} busca={busca} />
    </>
  );
}

export default PainelDeTvPage;
