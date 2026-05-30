import { Elysia } from "elysia";
import prisma from "@/db";

const instanceConfig = () => ({
  enable_signup: true,
  is_workspace_creation_disabled: false,
  is_google_enabled: false,
  is_github_enabled: false,
  is_gitlab_enabled: false,
  is_gitea_enabled: false,
  is_magic_login_enabled: false,
  is_email_password_enabled: true,
  github_app_name: "",
  slack_client_id: null,
  posthog_api_key: null,
  posthog_host: null,
  has_unsplash_configured: false,
  has_llm_configured: false,
  file_size_limit: 5242880,
  is_smtp_configured: false,
  admin_base_url: process.env.APP_BASE_URL ?? "http://localhost:8080/god-mode",
  space_base_url: process.env.APP_BASE_URL ?? "http://localhost:8080/spaces",
  app_base_url: process.env.APP_BASE_URL ?? "http://localhost:8080",
  instance_changelog_url: "",
  is_self_managed: true,
});

export const instanceModule = new Elysia({ prefix: "/instances" })
  .get("/", async ({ set }) => {
    const instance = await prisma.instance.findFirst();

    if (!instance) {
      return {
        is_activated: false,
        is_setup_done: false,
      };
    }

    const workspaceCount = await prisma.workspace.count();

    return {
      config: instanceConfig(),
      instance: {
        id: instance.id,
        instance_name: instance.instanceName,
        instance_id: instance.instanceId,
        current_version: instance.currentVersion,
        latest_version: instance.latestVersion,
        edition: instance.edition,
        domain: instance.domain,
        is_telemetry_enabled: instance.isTelemetryEnabled,
        is_support_required: instance.isSupportRequired,
        is_setup_done: instance.isSetupDone,
        is_signup_screen_visited: instance.isSignupScreenVisited,
        is_activated: true,
        workspaces_exist: workspaceCount >= 1,
      },
    };
  })
  .patch("/", async ({ body, set }) => {
    const instance = await prisma.instance.findFirst();
    if (!instance) {
      set.status = 400;
      return { error: "Instance not found" };
    }
    const data = body as Record<string, any>;
    const updated = await prisma.instance.update({
      where: { id: instance.id },
      data: {
        ...(data.instance_name !== undefined && { instanceName: data.instance_name }),
        ...(data.is_telemetry_enabled !== undefined && { isTelemetryEnabled: data.is_telemetry_enabled }),
        ...(data.is_support_required !== undefined && { isSupportRequired: data.is_support_required }),
        ...(data.is_setup_done !== undefined && { isSetupDone: data.is_setup_done }),
        ...(data.domain !== undefined && { domain: data.domain }),
      },
    });
    return updated;
  })
  .post("/signup-screen-visited/", async ({ set }) => {
    const instance = await prisma.instance.findFirst();
    if (!instance) {
      set.status = 400;
      return { error: "Instance is not configured" };
    }
    await prisma.instance.update({
      where: { id: instance.id },
      data: { isSignupScreenVisited: true },
    });
    set.status = 204;
    return null;
  });
