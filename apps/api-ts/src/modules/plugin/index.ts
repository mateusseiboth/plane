import Elysia from "elysia";
import prisma from "@db";
import { authPlugin } from "@middleware/auth";
import { getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";

// Plugins are stored as a JSON array in workspace settings (key: "installed_plugins")

async function getInstalledPlugins(workspaceId: string): Promise<string[]> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { workspaceId, key: "installed_plugins" },
  });
  if (!setting) return [];
  try {
    return JSON.parse(setting.value as string) ?? [];
  } catch {
    return [];
  }
}

async function setInstalledPlugins(workspaceId: string, plugins: string[]) {
  await prisma.workspaceSetting.upsert({
    where: { workspaceId_key: { workspaceId, key: "installed_plugins" } },
    create: { workspaceId, key: "installed_plugins", value: JSON.stringify(plugins) },
    update: { value: JSON.stringify(plugins) },
  });
}

export const pluginModule = new Elysia({ prefix: "/workspaces/:slug/plugins" })
  .use(authPlugin)

  // List installed plugins for the workspace
  .get("/", async ({ params: { slug }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const installed = await getInstalledPlugins(ws.id);
    return { installed };
  })

  // Install a plugin
  .post("/:pluginId/install/", async ({ params: { slug, pluginId }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const member = await requireWorkspaceMember(ws.id, user.id);
    if (member.role < 20) {
      set.status = 403;
      return { detail: "Only workspace admins can install plugins." };
    }
    const installed = await getInstalledPlugins(ws.id);
    if (!installed.includes(pluginId)) {
      installed.push(pluginId);
      await setInstalledPlugins(ws.id, installed);
    }
    set.status = 201;
    return { installed };
  })

  // Uninstall a plugin
  .delete("/:pluginId/uninstall/", async ({ params: { slug, pluginId }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const member = await requireWorkspaceMember(ws.id, user.id);
    if (member.role < 20) {
      set.status = 403;
      return { detail: "Only workspace admins can uninstall plugins." };
    }
    const installed = await getInstalledPlugins(ws.id);
    const updated = installed.filter((id) => id !== pluginId);
    await setInstalledPlugins(ws.id, updated);
    set.status = 204;
    return null;
  });
