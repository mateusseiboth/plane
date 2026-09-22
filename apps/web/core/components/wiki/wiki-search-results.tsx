/** Resultado da busca dentro da wiki: título e um trecho do texto. */
import Link from "next/link";
import { PageIcon } from "@plane/propel/icons";
import type { TWikiSearchResult } from "@plane/types";
import { cn, getPageName } from "@plane/utils";

type Props = {
  workspaceSlug: string;
  results: TWikiSearchResult[];
  isLoading: boolean;
  activePageId: string | undefined;
};

export function WikiSearchResults(props: Props) {
  const { workspaceSlug, results, isLoading, activePageId } = props;

  if (isLoading) return <p className="px-2 py-3 text-13 text-tertiary">Buscando...</p>;
  if (!results.length) return <p className="px-2 py-3 text-13 text-tertiary">Nenhuma página encontrada.</p>;

  return (
    <ul className="space-y-0.5">
      {results.map((resultado) => (
        <li key={resultado.id}>
          <Link
            href={`/${workspaceSlug}/wiki/${resultado.id}`}
            className={cn(
              "block rounded-md px-2 py-1.5 text-13",
              resultado.id === activePageId
                ? "bg-layer-transparent-active text-primary"
                : "text-secondary hover:bg-layer-transparent-hover"
            )}
          >
            <span className="flex items-center gap-1.5">
              <PageIcon className="size-3.5 flex-shrink-0 text-tertiary" />
              <span className="truncate font-medium">{getPageName(resultado.name)}</span>
            </span>
            {resultado.excerpt && (
              <span className="mt-0.5 line-clamp-2 text-11 text-tertiary">{resultado.excerpt}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
