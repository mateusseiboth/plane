/**
 * Banco anexado: o link do servidor de backups expira a cada hora, então o
 * bloco guarda só o número do backup e o link nasce a cada clique. Quem vê o
 * chamado baixa; o Plane só pede ao plugin o backup que está anexado num texto
 * do sistema (descrição ou comentário). Regras em `banco-anexo.rules.ts`.
 */
import prisma from "@db";
import {
  PERMISSOES_DO_DOWNLOAD,
  SLUG_DO_PLUGIN_DE_BACKUPS,
  buildMarcaDoEnvio,
} from "@modules/banco-anexo/banco-anexo.rules";
import { sendAoBackendDoPlugin, type RespostaDoPlugin } from "@modules/plugin-sdk-gateway/backend-do-plugin";

export async function isEnvioAnexadoNoSistema(projectId: string, envio: string): Promise<boolean> {
  const marca = buildMarcaDoEnvio(envio);
  const [chamados, comentarios] = await Promise.all([
    prisma.issue.count({ where: { projectId, deletedAt: null, descriptionHtml: { contains: marca } } }),
    prisma.issueComment.count({ where: { projectId, deletedAt: null, commentHtml: { contains: marca } } }),
  ]);
  return chamados + comentarios > 0;
}

/** Nome das entidades do espaço pelo código do SAC (é o código que o plugin conhece). */
export async function findNomesPorCodigoDoSac(workspaceId: string): Promise<Map<string, string>> {
  const entidades = await prisma.entity.findMany({
    where: { workspaceId, deletedAt: null, sacCode: { not: null } },
    select: { sacCode: true, name: true },
  });
  return new Map(entidades.map((e) => [String(e.sacCode), e.name]));
}

export const findPluginDeBackups = () =>
  prisma.plugin.findFirst({
    where: { slug: SLUG_DO_PLUGIN_DE_BACKUPS, status: "ACTIVE", deletedAt: null },
    select: { id: true, manifest: true },
  });

type Pedido = {
  plugin: { id: string; manifest: unknown };
  user: { id: string; displayName?: string | null; email?: string | null };
  workspaceId: string;
};

/** Pede ao plugin que prepare o arquivo (202, com o id da preparação para acompanhar). */
export const sendPreparacao = (pedido: Pedido, envio: string): Promise<RespostaDoPlugin> =>
  sendAoBackendDoPlugin({
    ...pedido,
    method: "POST",
    subPath: "/v1/bancos/preparar",
    body: Buffer.from(JSON.stringify({ envio: Number(envio) })),
    contentType: "application/json",
    perms: PERMISSOES_DO_DOWNLOAD,
  });

/** Um nível da busca do seletor (mês, sistema, entidade, arquivos). */
export const readBusca = (pedido: Pedido, caminho: string, query: Record<string, unknown>): Promise<RespostaDoPlugin> =>
  sendAoBackendDoPlugin({ ...pedido, method: "GET", subPath: caminho, query, perms: PERMISSOES_DO_DOWNLOAD });

/** Como está a preparação: `pronto` traz a URL do arquivo. */
export const readPreparacao = (pedido: Pedido, preparacaoId: string): Promise<RespostaDoPlugin> =>
  sendAoBackendDoPlugin({
    ...pedido,
    method: "GET",
    subPath: `/v1/bancos/preparar/${encodeURIComponent(preparacaoId)}`,
    perms: PERMISSOES_DO_DOWNLOAD,
  });
