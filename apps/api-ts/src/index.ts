import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";


import { projectModule } from "@modules/project";
import { stateModule } from "@modules/state";
import { labelModule, issueLabelModule } from "@modules/label";
import { cycleModule } from "@modules/cycle";
import { issueModule } from "@modules/issue";
import { memberModule } from "@modules/member";
import { moduleModule } from "@modules/module";
import { pageModule } from "@modules/page";
import { workspaceModule } from "@modules/workspace";
import { userModule } from "@modules/user";
import { authModule, sessionAuthModule } from "@modules/auth";
import { entityModule } from "@modules/entity";
// assetModule imported below (combined with v2)
import { inviteModule } from "@modules/invite";
import { analyticsModule } from "@modules/analytics";
import { webhookModule } from "@modules/webhook";
import { notificationModule } from "@modules/notification";
import { gitIntegrationModule } from "@modules/integration/git";
import { slackIntegrationModule } from "@modules/integration/slack";
import { aiModule } from "@modules/ai";
import { premiumModule } from "@modules/premium";
import { instanceModule } from "@modules/instance";
import { estimateModule } from "@modules/estimate";
import { pluginModule } from "@modules/plugin";
import { workItemModule } from "@modules/work-item";
import { assetModule, assetV2Module, userAssetV2Module } from "@modules/asset";
import { intakeWorkItemModule } from "@modules/intake-work-item";
import { technicalVisitModule } from "@modules/technical-visit";
import { reportsModule } from "@modules/reports";
import { customWidgetModule } from "@modules/custom-widget";
import { customWebhookModule } from "@modules/custom-webhook";
import { widgetModule } from "@modules/widget";
import { widgetSdkGatewayModule } from "@modules/widget-sdk-gateway";

const PORT = Number(process.env.PORT ?? 8001);

const corsConfig = cors({
  origin: (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:3000").split(","),
  credentials: true,
});

function errorHandler({ code, error, set }: any) {
  if (error && typeof error === "object" && "status" in error) {
    set.status = (error as any).status;
    return { detail: (error as any).message };
  }
  if (code === "NOT_FOUND") { set.status = 404; return { detail: "Not found." }; }
  if (code === "VALIDATION") { set.status = 400; return { detail: "Invalid request data.", errors: (error as any)?.message }; }
  const msg = error?.message ?? "";
  if (msg.includes("Authentication credentials") || msg.includes("Not authenticated")) {
    set.status = 401;
    return { detail: msg };
  }
  set.status = 500;
  console.error("[error]", error);
  return { detail: "Internal server error." };
}

// ── Auth routes live at /auth/* (no /api/v1 prefix) ──────────────────────────
const authApp = new Elysia()
  .use(corsConfig)
  .onError(errorHandler)
  .use(sessionAuthModule);

// ── All other API routes live at /api/v1/* ────────────────────────────────────
const apiApp = new Elysia({ prefix: "/api/v1" })
  .use(corsConfig)
  .use(swagger({
    path: "/schema",
    documentation: {
      info: { title: "Plane API", version: "1.0.0", description: "Plane TypeScript API — full CE + Premium parity" },
      components: { securitySchemes: { ApiKeyAuth: { type: "apiKey", in: "header", name: "X-Api-Key" } } },
      security: [{ ApiKeyAuth: [] }],
    },
  }))
  .onError(errorHandler)
  .get("/health/", () => ({ status: "ok", version: "1.0.0" }))

  // ── Timezones ─────────────────────────────────────────────────────────────────
  .get("/timezones/", () => {
    // Returns { timezones: TTimezoneObject[] } as expected by the frontend
    const TZ_DATA: Array<{ value: string; label: string; utc_offset: string; gmt_offset: string }> = [
      { value: "America/Noronha",     label: "Noronha",         utc_offset: "UTC-02:00", gmt_offset: "GMT-2" },
      { value: "America/Sao_Paulo",   label: "São Paulo",       utc_offset: "UTC-03:00", gmt_offset: "GMT-3" },
      { value: "America/Bahia",       label: "Bahia",           utc_offset: "UTC-03:00", gmt_offset: "GMT-3" },
      { value: "America/Fortaleza",   label: "Fortaleza",       utc_offset: "UTC-03:00", gmt_offset: "GMT-3" },
      { value: "America/Recife",      label: "Recife",          utc_offset: "UTC-03:00", gmt_offset: "GMT-3" },
      { value: "America/Maceio",      label: "Maceió",          utc_offset: "UTC-03:00", gmt_offset: "GMT-3" },
      { value: "America/Belem",       label: "Belém",           utc_offset: "UTC-03:00", gmt_offset: "GMT-3" },
      { value: "America/Cuiaba",      label: "Cuiabá",          utc_offset: "UTC-04:00", gmt_offset: "GMT-4" },
      { value: "America/Porto_Velho", label: "Porto Velho",     utc_offset: "UTC-04:00", gmt_offset: "GMT-4" },
      { value: "America/Manaus",      label: "Manaus",          utc_offset: "UTC-04:00", gmt_offset: "GMT-4" },
      { value: "America/Boa_Vista",   label: "Boa Vista",       utc_offset: "UTC-04:00", gmt_offset: "GMT-4" },
      { value: "America/Rio_Branco",  label: "Rio Branco",      utc_offset: "UTC-05:00", gmt_offset: "GMT-5" },
      { value: "UTC",                 label: "UTC",             utc_offset: "UTC+00:00", gmt_offset: "GMT+0" },
      { value: "America/New_York",    label: "New York",        utc_offset: "UTC-05:00", gmt_offset: "GMT-5" },
      { value: "America/Chicago",     label: "Chicago",         utc_offset: "UTC-06:00", gmt_offset: "GMT-6" },
      { value: "America/Denver",      label: "Denver",          utc_offset: "UTC-07:00", gmt_offset: "GMT-7" },
      { value: "America/Los_Angeles", label: "Los Angeles",     utc_offset: "UTC-08:00", gmt_offset: "GMT-8" },
      { value: "America/Toronto",     label: "Toronto",         utc_offset: "UTC-05:00", gmt_offset: "GMT-5" },
      { value: "America/Mexico_City", label: "Mexico City",     utc_offset: "UTC-06:00", gmt_offset: "GMT-6" },
      { value: "America/Buenos_Aires",label: "Buenos Aires",    utc_offset: "UTC-03:00", gmt_offset: "GMT-3" },
      { value: "America/Lima",        label: "Lima",            utc_offset: "UTC-05:00", gmt_offset: "GMT-5" },
      { value: "America/Bogota",      label: "Bogotá",          utc_offset: "UTC-05:00", gmt_offset: "GMT-5" },
      { value: "America/Santiago",    label: "Santiago",        utc_offset: "UTC-03:00", gmt_offset: "GMT-3" },
      { value: "Europe/London",       label: "London",          utc_offset: "UTC+00:00", gmt_offset: "GMT+0" },
      { value: "Europe/Paris",        label: "Paris",           utc_offset: "UTC+01:00", gmt_offset: "GMT+1" },
      { value: "Europe/Berlin",       label: "Berlin",          utc_offset: "UTC+01:00", gmt_offset: "GMT+1" },
      { value: "Europe/Madrid",       label: "Madrid",          utc_offset: "UTC+01:00", gmt_offset: "GMT+1" },
      { value: "Europe/Rome",         label: "Rome",            utc_offset: "UTC+01:00", gmt_offset: "GMT+1" },
      { value: "Europe/Moscow",       label: "Moscow",          utc_offset: "UTC+03:00", gmt_offset: "GMT+3" },
      { value: "Europe/Istanbul",     label: "Istanbul",        utc_offset: "UTC+03:00", gmt_offset: "GMT+3" },
      { value: "Asia/Dubai",          label: "Dubai",           utc_offset: "UTC+04:00", gmt_offset: "GMT+4" },
      { value: "Asia/Kolkata",        label: "Kolkata",         utc_offset: "UTC+05:30", gmt_offset: "GMT+5:30" },
      { value: "Asia/Bangkok",        label: "Bangkok",         utc_offset: "UTC+07:00", gmt_offset: "GMT+7" },
      { value: "Asia/Singapore",      label: "Singapore",       utc_offset: "UTC+08:00", gmt_offset: "GMT+8" },
      { value: "Asia/Shanghai",       label: "Shanghai",        utc_offset: "UTC+08:00", gmt_offset: "GMT+8" },
      { value: "Asia/Seoul",          label: "Seoul",           utc_offset: "UTC+09:00", gmt_offset: "GMT+9" },
      { value: "Asia/Tokyo",          label: "Tokyo",           utc_offset: "UTC+09:00", gmt_offset: "GMT+9" },
      { value: "Africa/Cairo",        label: "Cairo",           utc_offset: "UTC+02:00", gmt_offset: "GMT+2" },
      { value: "Africa/Johannesburg", label: "Johannesburg",    utc_offset: "UTC+02:00", gmt_offset: "GMT+2" },
      { value: "Australia/Sydney",    label: "Sydney",          utc_offset: "UTC+10:00", gmt_offset: "GMT+10" },
      { value: "Pacific/Auckland",    label: "Auckland",        utc_offset: "UTC+12:00", gmt_offset: "GMT+12" },
    ];
    return { timezones: TZ_DATA };
  })

  // ── Unsplash stub (not configured) ────────────────────────────────────────────
  .get("/unsplash/", () => ({ results: [], total: 0, total_pages: 0 }))

  // ── Workspace slug availability (called at /api/workspace-slug-check/) ────────
  .get("/workspace-slug-check/", async ({ query }) => {
    const slug = (query.slug as string | undefined)?.toLowerCase();
    if (!slug) return { status: false };
    const RESTRICTED = ["admin", "api", "auth", "plane", "god-mode", "spaces", "home", "login", "signup", "settings"];
    const taken = RESTRICTED.includes(slug) || (await (await import("@db")).default.workspace.findFirst({ where: { slug } })) !== null;
    return { status: !taken };
  })
  .use(instanceModule)
  .use(workspaceModule)
  .use(userModule)
  .use(authModule)      // API token management (/users/api-tokens/)
  .use(projectModule)
  .use(stateModule)
  .use(labelModule)
  .use(issueLabelModule)
  .use(cycleModule)
  .use(moduleModule)
  .use(issueModule)
  .use(pageModule)
  .use(memberModule)
  .use(entityModule)
  .use(assetModule)
  .use(inviteModule)
  .use(analyticsModule)
  .use(webhookModule)
  .use(notificationModule)
  .use(gitIntegrationModule)
  .use(slackIntegrationModule)
  .use(aiModule)
  .use(premiumModule)
  .use(estimateModule)
  .use(pluginModule)
  .use(workItemModule)
  .use(assetV2Module)
  .use(userAssetV2Module)
  .use(intakeWorkItemModule)
  .use(technicalVisitModule)
  .use(reportsModule)
  .use(customWidgetModule)
  .use(customWebhookModule)
  .use(widgetModule)
  .use(widgetSdkGatewayModule);

// ── Compose into root app ────────────────────────────────────────────────────
const app = new Elysia()
  .use(authApp)
  .use(apiApp)
  .listen(PORT);

console.log(`🚀 Plane API running on http://localhost:${PORT}/api/v1`);
console.log(`🔐 Auth endpoints: http://localhost:${PORT}/auth/`);
console.log(`📖 Swagger: http://localhost:${PORT}/api/v1/schema`);

export type App = typeof app;
