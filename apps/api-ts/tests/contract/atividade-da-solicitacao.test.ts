/**
 * A atividade da solicitação é a do chamado: a solicitação É o chamado (mesmo
 * issue_id). A abertura pela triagem e a decisão da triagem (aceitar, recusar)
 * tinham de deixar rastro igual ao que o chamado deixa no quadro: quem abriu e
 * cada mudança de etapa. Antes, aceitar movia o chamado de Triagem para Em
 * Análise sem registrar nada, e a solicitação aberta nascia sem "criou".
 */
import { beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createProject,
  createState,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

let admin: ReturnType<typeof apiClient>;
let base: string;
let issueId: string;

type Atividade = { field: string | null; verb: string; old_value: string | null; new_value: string | null };

const readEtapa = async (id: string) =>
  (await prisma.issue.findUniqueOrThrow({ where: { id }, include: { state: true } })).state?.name ?? null;

const readAtividades = async (rota: "issues" | "intake-work-items") =>
  ((await (await admin.get(`${base}/${rota}/${issueId}/history/`)).json()) as Atividade[]).map((a) => ({
    field: a.field,
    verb: a.verb,
    old_value: a.old_value,
    new_value: a.new_value,
  }));

beforeAll(async () => {
  await cleanDb();
  const dono = await createUser();
  admin = apiClient((await createApiToken(dono.id)).token);
  const ws = await createWorkspace(dono.id);
  const projeto = await createProject(ws.id, dono.id);
  base = `/workspaces/${ws.slug}/projects/${projeto.id}`;
  // Recusar leva à etapa "Cancelado" (a dos sistemas de verdade).
  await createState(projeto.id, ws.id, { name: "Cancelado", group: "cancelled" });
  const res = await admin.post(`${base}/inbox-issues/`, { name: "Guia não emite" });
  issueId = ((await res.json()) as any).id;
});

describe("atividade da solicitação", () => {
  it("abrir a solicitação registra a criação, como no chamado", async () => {
    expect(await readAtividades("issues")).toEqual([
      { field: "issue", verb: "created", old_value: null, new_value: null },
    ]);
  });

  it("aceitar na triagem registra a mudança de etapa", async () => {
    expect((await admin.patch(`${base}/inbox-issues/${issueId}/`, { status: 1 })).status).toBe(200);
    const aceita = await readEtapa(issueId);
    expect(aceita).not.toBe("Triagem");
    const atividades = await readAtividades("issues");
    expect(atividades).toContainEqual({ field: "state", verb: "updated", old_value: "Triagem", new_value: aceita });
  });

  it("a trilha lida pela triagem é a mesma do chamado, com etapas e comentários", async () => {
    const aceita = await readEtapa(issueId);
    const concluido = await prisma.state.findFirstOrThrow({
      where: { projectId: base.split("/").at(-1), group: "completed" },
    });
    await admin.post(`${base}/issues/${issueId}/comments/`, { comment_html: "<p>Corrigido.</p>" });
    await admin.patch(`${base}/issues/${issueId}/`, { state: concluido.id });

    const doChamado = await readAtividades("issues");
    expect(await readAtividades("intake-work-items")).toEqual(doChamado);
    expect(doChamado).toContainEqual({
      field: "state",
      verb: "updated",
      old_value: aceita,
      new_value: concluido.name,
    });

    const comentarios = async (rota: string) =>
      (
        (await (await admin.get(`${base}/${rota}/${issueId}/history/?activity_type=issue-comment`)).json()) as any[]
      ).map((c) => c.comment_html);
    expect(await comentarios("intake-work-items")).toEqual(await comentarios("issues"));
    expect(await comentarios("issues")).toEqual(["<p>Corrigido.</p>"]);
  });

  it("recusar na triagem também registra a mudança de etapa", async () => {
    const res = await admin.post(`${base}/inbox-issues/`, { name: "Pedido recusado" });
    const recusada = ((await res.json()) as any).id;
    await admin.patch(`${base}/inbox-issues/${recusada}/`, { status: -1, motivo: "Pedido fora do escopo do sistema." });
    const cancelada = await readEtapa(recusada);
    expect(cancelada).toBe("Cancelado");
    const atividades = (await (await admin.get(`${base}/issues/${recusada}/history/`)).json()) as Atividade[];
    expect(atividades.some((a) => a.field === "state" && a.old_value === "Triagem" && a.new_value === cancelada)).toBe(
      true
    );
  });
});
