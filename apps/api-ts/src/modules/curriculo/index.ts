/**
 * Rotas dos currículos (tela interna). Tudo exige `curriculo.read`. O
 * recebimento é pelo robô, na rota interna de `@modules/interno-chat`.
 *
 * LGPD: download e exclusão entram na trilha de auditoria; exclusão apaga o
 * arquivo e o registro, sem lixeira. O prazo de guarda é do espaço
 * (`/config/`) e o expurgo roda todo dia (`scheduleExpurgoDeCurriculos`).
 */
import { randomUUID } from "crypto";
import { Elysia } from "elysia";
import { authPlugin } from "@middleware/auth";
import { curriculoDao } from "@modules/curriculo/curriculo.dao";
import { createCurriculoService } from "@modules/curriculo/curriculo.service";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, auditDiff, recordAudit } from "@utils/audit";
import { EProjectAction, requireWorkspaceAction } from "@utils/permission-checks";
import { deleteAsset, saveAsset, serveAsset } from "@utils/storage";
import { getWorkspaceOrFail } from "@utils/workspace";

export const curriculoService = createCurriculoService({
  dao: curriculoDao,
  storage: { save: saveAsset, remove: deleteAsset },
  now: () => new Date(),
  newId: randomUUID,
});

async function readerWorkspace(slug: string, userId: string) {
  const ws = await getWorkspaceOrFail(slug);
  await requireWorkspaceAction(ws.id, userId, EProjectAction.CURRICULO_READ);
  return ws;
}

/** Nome do arquivo seguro para o cabeçalho (sem aspas nem quebra de linha). */
const nomeParaDownload = (nome: string) => nome.replace(/["\r\n]/g, "").trim() || "curriculo.pdf";

export const curriculoModule = new Elysia({ prefix: "/workspaces/:slug/curriculos" })
  .use(authPlugin)

  .get("/", async ({ params: { slug }, user, query }) => {
    const ws = await readerWorkspace(slug, user.id);
    return curriculoService.list(ws.id, query as Record<string, unknown>);
  })

  .get("/positions/", async ({ params: { slug }, user }) => {
    const ws = await readerWorkspace(slug, user.id);
    return curriculoService.positions(ws.id);
  })

  .get("/config/", async ({ params: { slug }, user }) => {
    const ws = await readerWorkspace(slug, user.id);
    return curriculoService.readConfig(ws.id);
  })

  .patch("/config/", async ({ params: { slug }, user, body, headers }) => {
    const ws = await readerWorkspace(slug, user.id);
    const antes = await curriculoService.readConfig(ws.id);
    const depois = await curriculoService.saveConfig(ws.id, (body ?? {}) as Record<string, unknown>);
    void recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.CURRICULO,
      entityId: "config",
      action: AUDIT_ACTIONS.UPDATE,
      actor: user,
      changes: auditDiff(antes, depois, ["retention_days"]),
      headers,
    });
    return depois;
  })

  .patch("/:curriculo_id/", async ({ params: { slug, curriculo_id }, user, body, headers }) => {
    const ws = await readerWorkspace(slug, user.id);
    const { antes, depois } = await curriculoService.mark(
      ws.id,
      user.id,
      curriculo_id,
      (body ?? {}) as Record<string, unknown>
    );
    void recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.CURRICULO,
      entityId: curriculo_id,
      action: AUDIT_ACTIONS.UPDATE,
      actor: user,
      changes: auditDiff(antes, depois, ["is_read", "is_interviewed"]),
      headers,
    });
    return depois;
  })

  .get("/:curriculo_id/download/", async ({ params: { slug, curriculo_id }, user, headers, set }) => {
    const ws = await readerWorkspace(slug, user.id);
    const curriculo = await curriculoService.findOrFail(ws.id, curriculo_id);
    const arquivo = await serveAsset(curriculo.fileKey, "application/pdf");
    if (!arquivo) {
      set.status = 404;
      return { detail: "Arquivo do currículo não encontrado." };
    }
    void recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.CURRICULO,
      entityId: curriculo.id,
      action: AUDIT_ACTIONS.DOWNLOAD,
      actor: user,
      headers,
    });
    // Dado pessoal: nada de cache compartilhado (o storage devolve cache público longo).
    return new Response(arquivo.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nomeParaDownload(curriculo.fileName)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  })

  .delete("/:curriculo_id/", async ({ params: { slug, curriculo_id }, user, headers, set }) => {
    const ws = await readerWorkspace(slug, user.id);
    await curriculoService.remove(ws.id, curriculo_id);
    void recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.CURRICULO,
      entityId: curriculo_id,
      action: AUDIT_ACTIONS.DELETE,
      actor: user,
      metadata: { exclusao: "definitiva" },
      headers,
    });
    set.status = 204;
    return null;
  });

/** Expurgo diário da LGPD: roda no boot e a cada 24 h. */
export function scheduleExpurgoDeCurriculos(intervaloMs = 24 * 60 * 60 * 1000) {
  const purge = () =>
    curriculoService
      .purgeExpired()
      .then((apagados) =>
        Promise.all(
          apagados.map((c) =>
            recordAudit({
              workspaceId: c.workspaceId,
              entity: AUDIT_ENTITIES.CURRICULO,
              entityId: c.id,
              action: AUDIT_ACTIONS.DELETE,
              metadata: { exclusao: "prazo_de_guarda" },
            })
          )
        )
      )
      .catch((e) => console.error("[curriculos] falha no expurgo:", e));
  void purge();
  return setInterval(purge, intervaloMs);
}
