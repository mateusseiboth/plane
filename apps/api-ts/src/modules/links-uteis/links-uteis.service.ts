/**
 * Descobre a configuração que decide quais links a pessoa vê e entrega o
 * contexto pronto para `buildLinksUteis`. O catálogo em si é puro.
 */
import { curriculoService } from "@modules/curriculo";
import { findSistemasDoEspaco } from "@modules/links-uteis/links-uteis.dao";
import { buildLinksUteis, type TGrupoDeLinks } from "@modules/links-uteis/links-uteis";
import { readChatConfig } from "@utils/chat-config";
import { EProjectAction, hasWorkspaceAction } from "@utils/permission-checks";

type Solicitante = { id: string; isInstanceAdmin: boolean; isSuperuser: boolean };

export async function readLinksUteis(
  workspace: { id: string; slug: string },
  user: Solicitante
): Promise<TGrupoDeLinks[]> {
  const [curriculo, chat, sistemas, podeAdministrarChat] = await Promise.all([
    curriculoService.readConfig(workspace.id),
    readChatConfig(),
    findSistemasDoEspaco(workspace.id),
    hasWorkspaceAction(workspace.id, user.id, EProjectAction.CHAT_ADMINISTRAR),
  ]);

  return buildLinksUteis({
    slug: workspace.slug,
    isInscricaoAberta: curriculo.site_enabled === true,
    isChatLigado: chat.enabled,
    podeAdministrarChat,
    // permissao-estrutural: o god mode é da instância, fora do espaço.
    isAdminDaInstancia: user.isInstanceAdmin || user.isSuperuser,
    sistemas,
  });
}
