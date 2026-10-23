/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { PageIcon } from "@plane/propel/icons";
import { getPageName } from "@plane/utils";
// components
import {
  isHoraDeBuscarNaWiki,
  readMensagemDaSugestao,
  type TSugestaoDaWiki,
} from "@/components/solicitacao/sugestoes-da-wiki";
// hooks
import { useConfiguracaoDeIa } from "@/hooks/use-configuracao-de-ia";
import { useSugestaoDeSolucao, useSugestoesDaWiki } from "@/hooks/use-sugestoes-da-wiki";

const AVISO = "text-12 text-tertiary";
const FALHOU = "Não foi possível sugerir agora.";

type Props = {
  workspaceSlug: string;
  /** Título e complemento, em texto puro. */
  texto: string;
  projectId?: string;
};

function PaginaDaWiki({ pagina }: { pagina: TSugestaoDaWiki }) {
  return (
    <li>
      <a
        href={pagina.url}
        target="_blank"
        rel="noreferrer"
        className="block rounded-md px-2 py-1.5 text-13 text-secondary hover:bg-layer-transparent-hover"
      >
        <span className="flex items-center gap-1.5">
          <PageIcon className="size-3.5 shrink-0 text-tertiary" />
          <span className="truncate font-medium">{getPageName(pagina.name)}</span>
        </span>
        {pagina.trecho && <span className="mt-0.5 line-clamp-2 text-11 text-tertiary">{pagina.trecho}</span>}
      </a>
    </li>
  );
}

function SugestaoDeSolucao(props: { workspaceSlug: string; texto: string; paginaIds: string[] }) {
  const { workspaceSlug, texto, paginaIds } = props;
  const { iaDisponivel } = useConfiguracaoDeIa(workspaceSlug);
  const { solucao, error, isMutating, ask } = useSugestaoDeSolucao(workspaceSlug);

  if (iaDisponivel === false) return null;

  const mensagem = solucao ? readMensagemDaSugestao(solucao) : error && FALHOU;

  return (
    <div className="mt-2 space-y-1.5">
      <button
        type="button"
        onClick={() => void ask({ texto, paginaIds }).catch(() => undefined)}
        disabled={isMutating}
        className="rounded-md border border-subtle px-2.5 py-1 text-12 text-secondary hover:bg-layer-1 disabled:cursor-wait disabled:opacity-60"
      >
        {isMutating ? "Sugerindo…" : "Sugerir solução"}
      </button>
      {mensagem && <p className="text-13 whitespace-pre-line text-primary">{mensagem}</p>}
    </div>
  );
}

function ConteudoDaWiki(props: { workspaceSlug: string; texto: string; paginas: TSugestaoDaWiki[] | undefined }) {
  const { workspaceSlug, texto, paginas } = props;
  if (!paginas) return <p className={AVISO}>Procurando na wiki…</p>;
  if (!paginas.length) return <p className={AVISO}>Nada parecido na wiki.</p>;

  const paginaIds = paginas.map((pagina) => pagina.id);
  return (
    <>
      <ul className="space-y-0.5">
        {paginas.map((pagina) => (
          <PaginaDaWiki key={pagina.id} pagina={pagina} />
        ))}
      </ul>
      {/* Outra lista é outro pedido: a sugestão anterior some junto. */}
      <SugestaoDeSolucao key={paginaIds.join(",")} workspaceSlug={workspaceSlug} texto={texto} paginaIds={paginaIds} />
    </>
  );
}

/**
 * Páginas da wiki parecidas com o problema que está sendo descrito e, com IA
 * no servidor, o botão que sugere o que fazer. Só ajuda: nada aqui bloqueia o
 * envio da solicitação.
 */
export function BlocoDaWiki({ workspaceSlug, texto, projectId }: Props) {
  const { sugestoes, textoBuscado, error } = useSugestoesDaWiki(workspaceSlug, texto, projectId);
  // Sem a busca (fora do ar, sem permissão) o modal segue como era, sem aviso.
  if (error || !isHoraDeBuscarNaWiki(texto)) return null;

  return (
    <section className="rounded-md border border-subtle bg-surface-2 p-3">
      <p className="mb-1 text-12 font-medium text-secondary">Na wiki</p>
      <ConteudoDaWiki workspaceSlug={workspaceSlug} texto={textoBuscado} paginas={sugestoes} />
    </section>
  );
}
