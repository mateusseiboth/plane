/**
 * Uma linha da árvore da wiki: abre/fecha as filhas, leva à página e oferece as
 * operações da árvore (nova subpágina, mover, subir, descer, arquivar).
 */
import { observer } from "mobx-react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronRight, FileOutput, Plus } from "lucide-react";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { ArchiveIcon, PageIcon } from "@plane/propel/icons";
import { CustomMenu } from "@plane/ui";
import type { TWikiTreeNode } from "@plane/utils";
import { cn, getPageName } from "@plane/utils";
import type { TWorkspacePage } from "@/store/pages/workspace-page";
import type { TWikiDirecao } from "./use-wiki-operations";

export type TWikiTreeItemHandlers = {
  onToggle: (pageId: string) => void;
  onCreateChild: (parentId: string) => void;
  onMove: (page: TWorkspacePage) => void;
  onReorder: (page: TWorkspacePage, direcao: TWikiDirecao) => void;
  onArchive: (page: TWorkspacePage) => void;
  canReorder: (page: TWorkspacePage, direcao: TWikiDirecao) => boolean;
};

type Props = {
  node: TWikiTreeNode<TWorkspacePage>;
  depth: number;
  workspaceSlug: string;
  activePageId: string | undefined;
  expandidas: ReadonlySet<string>;
  canEdit: boolean;
  handlers: TWikiTreeItemHandlers;
};

/** Recuo por nível, em px: o mesmo passo da barra lateral de sistemas. */
const RECUO_POR_NIVEL = 12;

export const WikiTreeItem = observer(function WikiTreeItem(props: Props) {
  const { node, depth, workspaceSlug, activePageId, expandidas, canEdit, handlers } = props;
  const { page, children } = node;
  if (!page.id) return null;

  const pageId = page.id;
  const aberta = expandidas.has(pageId);
  const temFilhas = children.length > 0;
  const ativa = pageId === activePageId;

  const menu = [
    {
      key: "child",
      titulo: "Nova subpágina",
      Icone: Plus,
      render: canEdit,
      acao: () => handlers.onCreateChild(pageId),
    },
    { key: "move", titulo: "Mover para", Icone: FileOutput, render: canEdit, acao: () => handlers.onMove(page) },
    {
      key: "up",
      titulo: "Subir",
      Icone: ArrowUp,
      render: canEdit && handlers.canReorder(page, "up"),
      acao: () => handlers.onReorder(page, "up"),
    },
    {
      key: "down",
      titulo: "Descer",
      Icone: ArrowDown,
      render: canEdit && handlers.canReorder(page, "down"),
      acao: () => handlers.onReorder(page, "down"),
    },
    {
      key: "archive",
      titulo: "Arquivar",
      Icone: ArchiveIcon,
      render: page.canCurrentUserArchivePage,
      acao: () => handlers.onArchive(page),
    },
  ].filter((item) => item.render);

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md py-1 pr-1 text-13",
          ativa ? "bg-layer-transparent-active text-primary" : "text-secondary hover:bg-layer-transparent-hover"
        )}
        style={{ paddingLeft: depth * RECUO_POR_NIVEL + 4 }}
      >
        <button
          type="button"
          aria-label={aberta ? "Recolher" : "Expandir"}
          onClick={() => handlers.onToggle(pageId)}
          className={cn("grid size-4 flex-shrink-0 place-items-center rounded-sm hover:bg-layer-1", {
            invisible: !temFilhas,
          })}
        >
          <ChevronRight className={cn("size-3 transition-transform", { "rotate-90": aberta })} />
        </button>
        <Link href={`/${workspaceSlug}/wiki/${pageId}`} className="flex min-w-0 flex-1 items-center gap-1.5">
          {page.logo_props?.in_use ? (
            <Logo logo={page.logo_props} size={14} type="lucide" />
          ) : (
            <PageIcon className="size-3.5 flex-shrink-0 text-tertiary" />
          )}
          <span className="truncate">{getPageName(page.name)}</span>
        </Link>
        {canEdit && (
          <button
            type="button"
            aria-label="Nova subpágina"
            onClick={() => handlers.onCreateChild(pageId)}
            className="hidden size-5 flex-shrink-0 place-items-center rounded-sm text-tertiary group-hover:grid hover:bg-layer-1"
          >
            <Plus className="size-3.5" />
          </button>
        )}
        {menu.length > 0 && (
          <CustomMenu placement="bottom-end" ellipsis closeOnSelect buttonClassName="opacity-0 group-hover:opacity-100">
            {menu.map(({ key, titulo, Icone, acao }) => (
              <CustomMenu.MenuItem key={key} onClick={acao} className="flex items-center gap-2">
                <Icone className="size-3" />
                {titulo}
              </CustomMenu.MenuItem>
            ))}
          </CustomMenu>
        )}
      </div>
      {aberta && temFilhas && (
        <ul>
          {children.map((filha) => (
            <WikiTreeItem key={filha.page.id} {...props} node={filha} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
});
