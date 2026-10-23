/**
 * Chave de tradução do nome de um item da barra lateral. A maioria usa a do
 * catálogo (`labelTranslationKey`); os itens desta tabela mudam de nome pela
 * matriz de ações de quem está vendo. Vale na barra, no menu Mais e na tela de
 * personalizar a navegação.
 */
import type { IWorkspaceSidebarNavigationItem } from "@plane/constants";
import { readRotuloDaTriagem } from "@/components/inbox/global/rotulo-da-triagem";

type TCan = (action: string) => boolean;

const ROTULO_POR_ITEM: Record<string, (can: TCan) => string> = {
  "global-intake": readRotuloDaTriagem,
};

export const readRotuloDoItemDaBarra = (
  item: Pick<IWorkspaceSidebarNavigationItem, "key" | "labelTranslationKey">,
  can: TCan
): string => ROTULO_POR_ITEM[item.key]?.(can) ?? item.labelTranslationKey;
