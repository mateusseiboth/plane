/**
 * Imagem colada (Ctrl+V) no modal de solicitação: sobe como arquivo do sistema
 * escolhido, igual ao modal de chamado; o vínculo com o chamado vem depois de
 * criado.
 *
 * O sistema é lido NA HORA do upload (`readProjectId`), nunca capturado: o
 * editor guarda as funções da primeira renderização, quando o sistema ainda
 * está vazio, e o upload falhava em silêncio mesmo com o sistema escolhido.
 */
import { EFileAssetType } from "@plane/types";
import type { IEditorAssetStore } from "@/store/editor/asset.store";

export const ESCOLHA_O_SISTEMA_ANTES = "Escolha o sistema antes de colar a imagem.";

type TDependencias = {
  workspaceSlug: string;
  readProjectId: () => string;
  upload: IEditorAssetStore["uploadEditorAsset"];
  duplicate: IEditorAssetStore["duplicateEditorAsset"];
  keepAsset: (assetId: string) => void;
  /** Mostra o aviso na tela: o editor engole o erro do upload. */
  onSemSistema: (mensagem: string) => void;
};

export const buildImagensDaSolicitacao = (deps: TDependencias) => {
  const requireSistema = (): string => {
    const projectId = deps.readProjectId();
    if (projectId) return projectId;
    deps.onSemSistema(ESCOLHA_O_SISTEMA_ANTES);
    throw new Error(ESCOLHA_O_SISTEMA_ANTES);
  };

  const uploadImagem = async (blockId: string, file: File): Promise<string> => {
    const projectId = requireSistema();
    const { asset_id } = await deps.upload({
      blockId,
      data: { entity_identifier: "", entity_type: EFileAssetType.ISSUE_DESCRIPTION },
      file,
      projectId,
      workspaceSlug: deps.workspaceSlug,
    });
    deps.keepAsset(asset_id);
    return asset_id;
  };

  const duplicateImagem = async (assetId: string): Promise<string> => {
    const projectId = requireSistema();
    const duplicado = await deps.duplicate({
      assetId,
      entityId: undefined,
      entityType: EFileAssetType.ISSUE_DESCRIPTION,
      projectId,
      workspaceSlug: deps.workspaceSlug,
    });
    deps.keepAsset(duplicado.asset_id);
    return duplicado.asset_id;
  };

  return { uploadImagem, duplicateImagem };
};
