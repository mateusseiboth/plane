/**
 * Histórico do conteúdo das páginas (sistema e wiki).
 *
 * O conteúdo chega quase sempre pelo servidor `live`, que grava
 * `/description/` a cada pausa de digitação. Antes, a versão só nascia no
 * PATCH da página (título), então o histórico de uma página editada a várias
 * mãos ficava vazio. Agora, antes de o HTML novo entrar, o ANTERIOR vira uma
 * linha em `page_versions` com quem alterou.
 *
 * Mesma regra de sessão do corpo do chamado (`@utils/versoes-da-descricao`):
 * gravações seguidas do mesmo autor dentro da janela são UMA edição; autor
 * diferente sempre abre versão nova. O histórico é podado para as mais recentes.
 */
import prisma from "@db";
import { isMesmaSessao } from "@utils/versoes-da-descricao";

/** Quantas versões cada página guarda; as mais antigas são podadas. */
export const VERSOES_DA_PAGINA_MANTIDAS = 20;

/** Conteúdo vazio do editor: não vale uma versão. */
const CONTEUDO_VAZIO = new Set(["", "<p></p>"]);

export type PaginaAntesDaGravacao = {
  id: string;
  workspaceId: string;
  descriptionHtml: string | null;
  descriptionStripped: string | null;
  descriptionJson: unknown;
};

/** `true` quando vale guardar o conteúdo anterior antes de gravar `htmlNovo`. */
export function isConteudoAlterado(antes: PaginaAntesDaGravacao, htmlNovo: string | undefined): boolean {
  if (htmlNovo === undefined) return false;
  const anterior = antes.descriptionHtml ?? "";
  if (CONTEUDO_VAZIO.has(anterior.trim())) return false;
  return anterior !== htmlNovo;
}

async function prunePageVersions(pageId: string): Promise<void> {
  const excedentes = await prisma.pageVersion.findMany({
    where: { pageId },
    orderBy: { lastSavedAt: "desc" },
    skip: VERSOES_DA_PAGINA_MANTIDAS,
    select: { id: true },
  });
  if (!excedentes.length) return;
  await prisma.pageVersion.deleteMany({ where: { id: { in: excedentes.map((v) => v.id) } } });
}

/**
 * Guarda o conteúdo anterior da página, se for alteração de fato e não for a
 * mesma sessão do mesmo autor. O histórico é acessório: uma falha aqui não
 * derruba a gravação do usuário.
 */
export async function savePageVersion(params: {
  antes: PaginaAntesDaGravacao;
  htmlNovo: string | undefined;
  autorId: string;
}): Promise<void> {
  const { antes, htmlNovo, autorId } = params;
  if (!isConteudoAlterado(antes, htmlNovo)) return;

  const ultima = await prisma.pageVersion.findFirst({
    where: { pageId: antes.id },
    orderBy: { lastSavedAt: "desc" },
    select: { ownedById: true, lastSavedAt: true },
  });
  if (isMesmaSessao(ultima, autorId)) return;

  await prisma.pageVersion
    .create({
      data: {
        pageId: antes.id,
        workspaceId: antes.workspaceId,
        ownedById: autorId,
        lastSavedAt: new Date(),
        descriptionHtml: antes.descriptionHtml,
        descriptionStripped: antes.descriptionStripped,
        descriptionJson: (antes.descriptionJson ?? undefined) as any,
      },
    })
    .then(() => prunePageVersions(antes.id))
    .catch(() => undefined);
}
