/**
 * "Mover para": escolhe a nova mãe da página dentro da wiki. A própria página
 * e as descendentes não aparecem (a API recusaria o ciclo de qualquer jeito).
 */
import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { PageIcon } from "@plane/propel/icons";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { cn, getPageName, getWikiMoveTargets, getWikiPageAncestors } from "@plane/utils";
import type { TWorkspacePage } from "@/store/pages/workspace-page";

type Props = {
  page: TWorkspacePage | undefined;
  pages: TWorkspacePage[];
  onClose: () => void;
  onMove: (pageId: string, parentId: string | null) => Promise<void>;
};

/** Caminho legível da página ("Processos / Implantação") para distinguir homônimas. */
const getCaminho = (pages: TWorkspacePage[], page: TWorkspacePage) =>
  [...getWikiPageAncestors(pages, page.id ?? ""), page].map((p) => getPageName(p.name)).join(" / ");

export const WikiMoveModal = observer(function WikiMoveModal(props: Props) {
  const { page, pages, onClose, onMove } = props;
  const [busca, setBusca] = useState("");
  const [movendo, setMovendo] = useState(false);

  const destinos = useMemo(() => {
    if (!page?.id) return [];
    const termo = busca.trim().toLowerCase();
    return getWikiMoveTargets(pages, page.id)
      .map((destino) => ({ id: destino.id as string, caminho: getCaminho(pages, destino) }))
      .filter((destino) => destino.caminho.toLowerCase().includes(termo))
      .sort((a, b) => a.caminho.localeCompare(b.caminho, "pt-BR"));
  }, [busca, page, pages]);

  const handleClose = () => {
    setBusca("");
    onClose();
  };

  const handleMove = async (parentId: string | null) => {
    if (!page?.id) return;
    setMovendo(true);
    await onMove(page.id, parentId);
    setMovendo(false);
    handleClose();
  };

  const maeAtual = page?.parent_id ?? null;

  return (
    <ModalCore isOpen={!!page} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="space-y-3 p-5">
        <h3 className="text-16 font-medium text-primary">Mover &ldquo;{getPageName(page?.name)}&rdquo;</h3>
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar página de destino"
          className="w-full"
        />
        <ul className="vertical-scrollbar scrollbar-sm max-h-80 space-y-0.5 overflow-y-auto">
          <li>
            <button
              type="button"
              disabled={movendo || maeAtual === null}
              onClick={() => handleMove(null)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-13 text-secondary hover:bg-layer-transparent-hover disabled:opacity-50"
            >
              Início da wiki
            </button>
          </li>
          {destinos.map((destino) => (
            <li key={destino.id}>
              <button
                type="button"
                disabled={movendo || destino.id === maeAtual}
                onClick={() => handleMove(destino.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-13 text-secondary",
                  "hover:bg-layer-transparent-hover disabled:opacity-50"
                )}
              >
                <PageIcon className="size-3.5 flex-shrink-0 text-tertiary" />
                <span className="truncate">{destino.caminho}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={handleClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
