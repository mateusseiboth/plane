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
import { assetModule } from "@modules/asset";
import { inviteModule } from "@modules/invite";
import { analyticsModule } from "@modules/analytics";
import { webhookModule } from "@modules/webhook";
import { notificationModule } from "@modules/notification";
import { gitIntegrationModule } from "@modules/integration/git";
import { slackIntegrationModule } from "@modules/integration/slack";
import { aiModule } from "@modules/ai";
import { premiumModule } from "@modules/premium";
import { instanceModule } from "@modules/instance";

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
    const TIMEZONES = [
      "America/Sao_Paulo", "America/Manaus", "America/Belem", "America/Fortaleza",
      "America/Recife", "America/Maceio", "America/Bahia", "America/Cuiaba",
      "America/Porto_Velho", "America/Boa_Vista", "America/Rio_Branco",
      "America/Noronha", "UTC",
      "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
      "America/Toronto", "America/Mexico_City", "America/Buenos_Aires",
      "America/Lima", "America/Bogota", "America/Santiago",
      "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
      "Europe/Rome", "Europe/Moscow", "Europe/Istanbul",
      "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Asia/Dubai",
      "Asia/Singapore", "Asia/Seoul", "Asia/Bangkok",
      "Africa/Cairo", "Africa/Johannesburg",
      "Australia/Sydney", "Pacific/Auckland",
    ];
    return TIMEZONES.map(tz => ({ timezone: tz, label: tz.replace(/_/g, " ") }));
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
  .use(premiumModule);

// ── Compose into root app ────────────────────────────────────────────────────
const app = new Elysia()
  .use(authApp)
  .use(apiApp)
  .listen(PORT);

console.log(`🚀 Plane API running on http://localhost:${PORT}/api/v1`);
console.log(`🔐 Auth endpoints: http://localhost:${PORT}/auth/`);
console.log(`📖 Swagger: http://localhost:${PORT}/api/v1/schema`);

export type App = typeof app;
