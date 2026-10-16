/**
 * Quem edita, trava, arquiva e exclui uma página de sistema, pela matriz de
 * ações (nada de nível de papel). O store resolve as ações e passa booleanos.
 */

/**
 * Escrever páginas no sistema. O api-ts só exige participar do sistema para
 * editar página pública; a matriz usa `page.create`, que tem o mesmo padrão
 * (Membro e Gestor) do corte antigo `>= MEMBER`.
 */
export const ACAO_DE_ESCREVER_PAGINA = "page.create";

/** Travar, arquivar, mover, trocar acesso e excluir página de outro (`canManage` do api-ts). */
export const ACAO_DE_GERIR_PAGINA_DE_OUTRO = "page.manage.all";

type TEdicao = { isOwner: boolean; isPublic: boolean; canWrite: boolean };

/** Pública: edita quem escreve páginas no sistema. Privada: só o dono. */
export const isPageEditAllowed = ({ isOwner, isPublic, canWrite }: TEdicao): boolean =>
  (isPublic && canWrite) || (!isPublic && isOwner);

/** O dono sempre pode; página de outro exige `page.manage.all`. */
export const isPageManageAllowed = ({ isOwner, canManageAll }: { isOwner: boolean; canManageAll: boolean }): boolean =>
  isOwner || canManageAll;

type TConteudo = TEdicao & { isArchived: boolean; isLocked: boolean };

/** Arquivada ou travada ninguém edita; fora isso, o dono ou quem escreve páginas (se pública). */
export const isPageContentEditable = ({ isArchived, isLocked, isOwner, isPublic, canWrite }: TConteudo): boolean =>
  !isArchived && !isLocked && (isOwner || (isPublic && canWrite));
