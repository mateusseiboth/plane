/**
 * Imagens coladas no complemento sobem antes de o chamado existir, como arquivo
 * do sistema escolhido. Depois de criar, a rota em lote (a mesma que o modal de
 * chamado usa) passa os arquivos para o chamado novo.
 */
import { FileService } from "@/services/file.service";

const fileService = new FileService();

export const bindArquivosDaSolicitacao = async (
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  assetIds: string[]
): Promise<void> => {
  if (assetIds.length === 0) return;
  await fileService.updateBulkProjectAssetsUploadStatus(workspaceSlug, projectId, issueId, { asset_ids: assetIds });
};
