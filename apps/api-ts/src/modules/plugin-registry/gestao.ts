/**
 * Configurações do espaço de trabalho > Plugins.
 *
 * Listar o que está instalado, enviar um bundle novo, ligar/desligar, remover e
 * a grade função × permissão do manifesto. Tudo atrás de `plugin.manage`.
 *
 * O plugin em si é da INSTÂNCIA (uma tabela só, sem coluna de espaço); o que é
 * por espaço são as permissões concedidas e a configuração. Por isso as rotas
 * vivem sob o espaço: é lá que a permissão de gerenciar é conferida, e é lá que
 * a grade é gravada.
 */
import { Elysia } from "elysia";
import prisma from "@db";
import { authPlugin } from "@middleware/auth";
import { EProjectAction, requireWorkspaceAction } from "@utils/permission-checks";
import { getWorkspaceOrFail } from "@utils/workspace";
import { checkRateLimit } from "@utils/rate-limiter";
import { PluginVersionRejectedError } from "@utils/plugin-upload";
import { auditLog, savePluginBundle } from "@modules/plugin-registry/upload";
import { readDefinedPermissions, serializePluginDaGestao } from "@modules/plugin-registry/serializar";
import {
  buildGradeDasLinhas,
  buildLinhasDaGrade,
  diffLinhasDeGrant,
  parseGradeDeGrants,
  type TErroDeCampo,
  type TFuncaoDoEspaco,
  type TPermissaoDeclarada,
} from "@modules/plugin-registry/grants";

type Set_ = { status?: number | string };

const invalido = (set: Set_, status: number, errors: TErroDeCampo[], detail: string) => {
  set.status = status;
  return { detail, errors };
};

async function requireGestao(slug: string, userId: string): Promise<string> {
  const ws = await getWorkspaceOrFail(slug);
  await requireWorkspaceAction(ws.id, userId, EProjectAction.PLUGIN_MANAGE);
  return ws.id;
}

async function findPluginOuNulo(id: string) {
  return prisma.plugin.findFirst({ where: { id, deletedAt: null } });
}

async function findFuncoesDoEspaco(workspaceId: string): Promise<TFuncaoDoEspaco[]> {
  const roles = await prisma.workflowRole.findMany({
    where: { workspaceId, deletedAt: null },
    select: { id: true, key: true, name: true, level: true },
    orderBy: { level: "asc" },
  });
  return roles;
}

async function readGrants(
  pluginId: string,
  workspaceId: string,
  funcoes: readonly TFuncaoDoEspaco[],
  permissoes: readonly TPermissaoDeclarada[]
) {
  const linhas = await prisma.pluginPermissionGrant.findMany({
    where: { pluginId, workspaceId, subjectType: "role" },
    select: { subjectId: true, permission: true },
  });
  return buildGradeDasLinhas(linhas, funcoes, permissoes);
}

export const pluginGestaoModule = new Elysia({ prefix: "/workspaces/:slug/plugins" })
  .use(authPlugin)

  // ── Lista dos plugins instalados ────────────────────────────────────────────
  .get("/", async ({ params: { slug }, user }) => {
    await requireGestao(slug, user.id);
    const plugins = await prisma.plugin.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
    return { results: plugins.map(serializePluginDaGestao) };
  })

  // ── Envio de um bundle (.zip) ───────────────────────────────────────────────
  .post("/", async ({ params: { slug }, body, user, set }) => {
    await requireGestao(slug, user.id);

    if (!checkRateLimit(`plugin-upload:${user.id}`, 5, 60_000)) {
      set.status = 429;
      return { detail: "Muitas tentativas de envio. Aguarde um minuto e tente de novo." };
    }

    const file: Blob | null = (body as { file?: Blob } | null)?.file ?? null;
    if (!file)
      return invalido(
        set,
        400,
        [{ path: "file", message: "Escolha o arquivo .zip do plugin." }],
        "Revise o formulário."
      );

    try {
      const { plugin, status } = await savePluginBundle(Buffer.from(await file.arrayBuffer()), user.id);
      set.status = status;
      return serializePluginDaGestao(plugin);
    } catch (erro) {
      // Versão recusada e manifesto inválido são erro DO ARQUIVO enviado: a
      // mensagem tem de voltar para o campo, senão a tela só mostra um toque.
      const status = (erro as { status?: number }).status;
      if (erro instanceof PluginVersionRejectedError || status === 400) {
        return invalido(
          set,
          erro instanceof PluginVersionRejectedError ? 409 : 400,
          [{ path: "file", message: (erro as Error).message }],
          "Revise o arquivo enviado."
        );
      }
      throw erro;
    }
  })

  // ── Ligar / desligar ────────────────────────────────────────────────────────
  .post("/:id/toggle/", async ({ params: { slug, id }, body, user, set }) => {
    await requireGestao(slug, user.id);
    const plugin = await findPluginOuNulo(id);
    if (!plugin) {
      set.status = 404;
      return { detail: "Plugin não encontrado." };
    }
    const ativo = Boolean((body as { is_active?: unknown } | null)?.is_active);
    auditLog(ativo ? "plugin.activate" : "plugin.deactivate", user.id, id);
    const atualizado = await prisma.plugin.update({ where: { id }, data: { status: ativo ? "ACTIVE" : "INACTIVE" } });
    return serializePluginDaGestao(atualizado);
  })

  // ── Remover ─────────────────────────────────────────────────────────────────
  .delete("/:id/", async ({ params: { slug, id }, user, set }) => {
    await requireGestao(slug, user.id);
    const plugin = await findPluginOuNulo(id);
    if (!plugin) {
      set.status = 404;
      return { detail: "Plugin não encontrado." };
    }
    auditLog("plugin.delete", user.id, id);
    await prisma.plugin.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED" } });
    set.status = 204;
    return null;
  })

  // ── Grade função × permissão ────────────────────────────────────────────────
  .get("/:id/grants/", async ({ params: { slug, id }, user, set }) => {
    const workspaceId = await requireGestao(slug, user.id);
    const plugin = await findPluginOuNulo(id);
    if (!plugin) {
      set.status = 404;
      return { detail: "Plugin não encontrado." };
    }
    const funcoes = await findFuncoesDoEspaco(workspaceId);
    const permissions = readDefinedPermissions(plugin);
    return {
      permissions,
      roles: funcoes,
      grants: await readGrants(id, workspaceId, funcoes, permissions),
    };
  })

  .put("/:id/grants/", async ({ params: { slug, id }, body, user, set }) => {
    const workspaceId = await requireGestao(slug, user.id);
    const plugin = await findPluginOuNulo(id);
    if (!plugin) {
      set.status = 404;
      return { detail: "Plugin não encontrado." };
    }

    const funcoes = await findFuncoesDoEspaco(workspaceId);
    const permissions = readDefinedPermissions(plugin);
    const { grade, errors } = parseGradeDeGrants((body as { grants?: unknown } | null)?.grants, funcoes, permissions);
    if (errors.length) return invalido(set, 400, errors, "Revise as permissões marcadas.");

    const atuais = await prisma.pluginPermissionGrant.findMany({
      where: { pluginId: id, workspaceId, subjectType: "role" },
      select: { subjectId: true, permission: true },
    });
    const { toAdd, toRemove } = diffLinhasDeGrant(atuais, buildLinhasDaGrade(grade, funcoes));

    await prisma.$transaction(async (tx) => {
      if (toRemove.length) {
        await tx.pluginPermissionGrant.deleteMany({
          where: {
            pluginId: id,
            workspaceId,
            subjectType: "role",
            OR: toRemove.map(({ subjectId, permission }) => ({ subjectId, permission })),
          },
        });
      }
      if (toAdd.length) {
        await tx.pluginPermissionGrant.createMany({
          data: toAdd.map((linha) => ({ pluginId: id, workspaceId, subjectType: "role", ...linha })),
          skipDuplicates: true,
        });
      }
    });

    auditLog("plugin.grants", user.id, id, { added: toAdd.length, removed: toRemove.length });
    return { permissions, roles: funcoes, grants: await readGrants(id, workspaceId, funcoes, permissions) };
  });
