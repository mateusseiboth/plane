import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";

import { projectModule } from "@modules/project";
import { stateModule } from "@modules/state";
import { labelModule } from "@modules/label";
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
  .use(workspaceModule)
  .use(userModule)
  .use(authModule)      // API token management (/users/api-tokens/)
  .use(projectModule)
  .use(stateModule)
  .use(labelModule)
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
