/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { PageIcon } from "@plane/propel/icons";
// components
import {
  isHoraDeBuscarNaWiki,
  readFontesDaSugestao,
  readMensagemDaSugestao,
  type TSugestaoDaWiki,
} from "@/components/solicitacao/sugestoes-da-wiki";
// hooks
import { useSugestaoDeSolucao, useSugestoesDaWiki } from "@/hooks/use-sugestoes-da-wiki";

const AVISO = "text-12 text-tertiary";

type Props = {
  workspaceSlug: string;
  /** Título e complemento, em texto puro. */
  texto: string;
  projectId?: string;
};

/** Página da wiki da Quality: abre em nova aba, fora do Plane. */
function PaginaDaWiki({ pagina }: { pagina: TSugestaoDaWiki }) {
  return (
    <li>
      <a
        href={pagina.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-md px-2 py-1.5 text-13 text-secondary hover:bg-layer-transparent-hover"
      >
        <span className="flex items-center gap-1.5">
          <PageIcon className="size-3.5 shrink-0 text-tertiary" />
          <span className="truncate font-medium">{pagina.name}</span>
          {pagina.sistema && (
            <span className="shrink-0 rounded-sm bg-layer-1 px-1 text-10 text-tertiary uppercase">
              {pagina.sistema}
            </span>
          )}
        </span>
        {pagina.trecho && <span className="mt-0.5 line-clamp-2 text-11 text-tertiary">{pagina.trecho}</span>}
      </a>
    </li>
  );
}

function SugestaoDeSolucao(props: { workspaceSlug: string; texto: string; paginaIds: string[] }) {
  const { workspaceSlug, texto, paginaIds } = props;
  const { solucao, error, isMutating, ask } = useSugestaoDeSolucao(workspaceSlug);
  const isRespondida = !isMutating && !!(solucao || error);

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
      {isRespondida && <p className="text-13 whitespace-pre-line text-primary">{readMensagemDaSugestao(solucao)}</p>}
      {isRespondida && (
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
          {readFontesDaSugestao(solucao).map((fonte) => (
            <li key={fonte.url}>
              <a
                href={fonte.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-11 text-accent-primary hover:underline"
              >
                {fonte.name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ListaDaWiki({ paginas }: { paginas: TSugestaoDaWiki[] | undefined }) {
  if (!paginas) return <p className={AVISO}>Procurando na wiki…</p>;
  if (!paginas.length) return <p className={AVISO}>Nada parecido na wiki.</p>;
  return (
    <ul className="space-y-0.5">
      {paginas.map((pagina) => (
        <PaginaDaWiki key={pagina.id} pagina={pagina} />
      ))}
    </ul>
  );
}

/**
 * Páginas da wiki da Quality parecidas com o problema que está sendo descrito
 * e o botão que pede à IA da Quality o que fazer. Só ajuda: nada aqui bloqueia
 * o envio da solicitação.
 */
export function BlocoDaWiki({ workspaceSlug, texto, projectId }: Props) {
  const { sugestoes, textoBuscado, error } = useSugestoesDaWiki(workspaceSlug, texto, projectId);
  // Sem permissão para a busca, o modal segue como era, sem aviso.
  if (error || !isHoraDeBuscarNaWiki(texto)) return null;

  return (
    <section className="rounded-md border border-subtle bg-surface-2 p-3">
      <p className="mb-1 text-12 font-medium text-secondary">Na wiki</p>
      <ListaDaWiki paginas={sugestoes} />
      {/* Outro relato é outro pedido: a sugestão anterior some junto. */}
      <SugestaoDeSolucao
        key={textoBuscado}
        workspaceSlug={workspaceSlug}
        texto={textoBuscado}
        paginaIds={(sugestoes ?? []).map((pagina) => pagina.id)}
      />
    </section>
  );
}
