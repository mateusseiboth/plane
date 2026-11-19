/**
 * Banco anexado no texto (testes da nova intranet 3, 19/11/2026): quem VÊ o
 * chamado baixa o backup, a cada clique com um link novo, sem precisar da
 * permissão do plugin de backups. Para isso não virar "baixe qualquer backup
 * passando um número", o Plane só pede o link ao plugin quando aquele backup
 * está anexado num chamado ou comentário do sistema.
 *
 * A suíte roda sem PLUGIN_BRIDGE_SECRET (outro teste confere o 503): aqui o 503
 * prova que o pedido passou pelas conferências e chegou à chamada ao plugin.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createIssue,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

let base: string;
let wsSlug: string;
let membro: ReturnType<typeof apiClient>;
let estranho: ReturnType<typeof apiClient>;

const preparar = (api: ReturnType<typeof apiClient>, envio: string) =>
  api.post(`${base}/bancos/${envio}/preparar/`, {});

beforeAll(async () => {
  await cleanDb();
  const dono = await createUser();
  membro = apiClient((await createApiToken(dono.id)).token);
  const ws = await createWorkspace(dono.id);
  wsSlug = ws.slug;
  const projeto = await createProject(ws.id, dono.id);
  base = `/workspaces/${ws.slug}/projects/${projeto.id}`;
  await prisma.plugin.create({
    data: {
      name: "Gerenciador de backups",
      slug: "backup-manager",
      version: "1.0.0",
      author: "Tester",
      entryFile: "plugin.js",
      manifest: { backend: { baseUrl: "http://127.0.0.1:9" } },
      permissions: [],
      status: "ACTIVE",
      storageKey: "backup-manager/1.0.0/plugin.js",
    },
  });
  const chamado = await createIssue(projeto.id, ws.id, { createdById: dono.id });
  await prisma.issue.update({
    where: { id: chamado.id },
    data: {
      descriptionHtml: '<p>Banco do cliente:</p><banco-anexo data-envio="123" data-nome="siart.zip"></banco-anexo>',
    },
  });
  await prisma.issueComment.create({
    data: {
      issueId: chamado.id,
      projectId: projeto.id,
      workspaceId: ws.id,
      actorId: dono.id,
      commentHtml: '<banco-anexo data-envio="456" data-nome="rh.zip"></banco-anexo>',
    },
  });
  const outro = await createUser();
  estranho = apiClient((await createApiToken(outro.id)).token);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Banco anexado no texto", () => {
  it("número de backup inválido é recusado", async () => {
    expect((await preparar(membro, "abc")).status).toBe(400);
  });

  it("backup que não está anexado a nenhum texto do sistema não é baixado", async () => {
    const res = await preparar(membro, "999");
    expect(res.status).toBe(404);
    expect(((await res.json()) as { detail: string }).detail).toBe("Este banco não está anexado neste sistema.");
  });

  it("quem não vê o sistema não baixa", async () => {
    expect([403, 404]).toContain((await preparar(estranho, "123")).status);
  });

  it("anexado na descrição: passa das conferências e pede o link ao plugin", async () => {
    expect((await preparar(membro, "123")).status).toBe(503);
  });

  it("anexado num comentário também vale", async () => {
    expect((await preparar(membro, "456")).status).toBe(503);
  });

  it("a busca de backups para anexar passa pelo Plane, para membros do espaço", async () => {
    expect((await membro.get(`/workspaces/${wsSlug}/bancos/meses/`)).status).toBe(503);
    const mesAtual = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Campo_Grande",
      year: "numeric",
      month: "2-digit",
    }).format(new Date());
    expect((await membro.get(`/workspaces/${wsSlug}/bancos/arquivos/?mes=${mesAtual}`)).status).toBe(503);
    // Mês antigo não chega ao plugin: só os bancos deste mês e do anterior.
    expect((await membro.get(`/workspaces/${wsSlug}/bancos/arquivos/?mes=2020-01`)).status).toBe(400);
    expect([403, 404]).toContain((await estranho.get(`/workspaces/${wsSlug}/bancos/meses/`)).status);
    expect((await membro.get(`/workspaces/${wsSlug}/bancos/qualquer/`)).status).toBe(404);
  });
});
