/**
 * Chamado aberto a partir de uma conversa do chat.
 *
 * Antes o botão só criava a solicitação com um link para a conversa: o chamado
 * não sabia de onde veio, a conversa não sabia que virou chamado, e quem pegava
 * o chamado tinha de abrir o chat para ler o que o cliente disse. Agora a
 * transcrição e os arquivos vão junto, a prioridade urgente ("cliente parado")
 * e o módulo entram na abertura, e o chamado aponta para a conversa
 * (`external_source = "chat"`, `external_id = <sessão>`).
 *
 * Os arquivos da conversa vêm da rota /media do chat-backend: o servidor da API
 * sob teste precisa de CHAT_INTERNAL_URL=http://localhost:8299 (servido aqui).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createEntity,
  createMemberWithToken,
  createModule,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PORTA_DO_CHAT_FALSO = 8299;

let chatFalso: ReturnType<typeof Bun.serve>;
let admin: ReturnType<typeof apiClient>;
let wsSlug: string;
let wsId: string;
let projetoId: string;
let moduloId: string;
let entidadeId: string;

async function createConversa(slug: string, dados: Record<string, unknown> = {}) {
  const id = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO chat_sessions (id, protocol, channel, workspace_id, client_name, client_phone, status, entity_id, created_at)
     VALUES ($1::uuid, $2, 'whatsapp', $3, 'Maria da Prefeitura', '5567999990000', 'active', $4::uuid, now())`,
    id,
    `P-${id.slice(0, 8)}`,
    slug,
    (dados.entityId as string | undefined) ?? null
  );
  const mensagens: Array<[string, string | null, string | null, string | null, string | null]> = [
    ["client", "O sistema não emite a guia.", null, null, null],
    ["attendant", "Vou abrir um chamado.", null, null, null],
    ["client", null, `${id}/print`, "image/png", "print.png"],
  ];
  await Promise.all(
    mensagens.map(([sender, text, key, mime, nome], i) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO chat_messages (id, session_id, sender, sender_name, type, text, media_key, media_mime, media_name, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4, $5, $6, $7, $8, now() + ($9 || ' seconds')::interval)`,
        id,
        sender,
        sender === "attendant" ? "Ana" : null,
        key ? "image" : "text",
        text,
        key,
        mime,
        nome,
        String(i)
      )
    )
  );
  return id;
}

const url = (projeto = projetoId) => `/workspaces/${wsSlug}/projects/${projeto}/inbox-issues/from-chat/`;

beforeAll(async () => {
  chatFalso = Bun.serve({
    port: PORTA_DO_CHAT_FALSO,
    fetch: () => new Response(PNG, { headers: { "Content-Type": "image/png" } }),
  });
  await cleanDb();
  await prisma.$executeRawUnsafe(`DELETE FROM chat_messages`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM chat_sessions`).catch(() => {});
  const dono = await createUser();
  admin = apiClient((await createApiToken(dono.id)).token);
  const ws = await createWorkspace(dono.id);
  wsSlug = ws.slug;
  wsId = ws.id;
  projetoId = (await createProject(ws.id, dono.id)).id;
  moduloId = (await createModule(projetoId, ws.id, { name: "Tributos" })).id;
  entidadeId = (await createEntity(ws.id, { name: "Prefeitura de Teste" })).id;
});

afterAll(() => chatFalso?.stop(true));

describe("POST .../inbox-issues/from-chat/", () => {
  let sessaoId: string;
  let chamadoId: string;

  it("abre a solicitação com transcrição, arquivos, prioridade urgente, módulo e entidade", async () => {
    sessaoId = await createConversa(wsSlug, { entityId: entidadeId });
    const res = await admin.post(url(), {
      session_id: sessaoId,
      name: "Guia não emite",
      priority: "urgent",
      module_id: moduloId,
      chat_url: "https://plane.local/q/chat-view/P",
    });
    expect(res.status).toBe(201);
    const corpo = (await res.json()) as any;
    chamadoId = corpo.issue.id;
    expect(corpo.issue.label).toMatch(/-\d+$/);
    expect(corpo.anexos).toBe(1);

    const chamado = await prisma.issue.findUniqueOrThrow({ where: { id: chamadoId } });
    expect(chamado).toMatchObject({
      name: "Guia não emite",
      priority: "urgent",
      externalSource: "chat",
      externalId: sessaoId,
      entityId: entidadeId,
    });
    expect(chamado.descriptionHtml).toContain("O sistema não emite a guia.");
    expect(chamado.descriptionHtml).toContain("Vou abrir um chamado.");
    expect(chamado.descriptionHtml).toContain("https://plane.local/q/chat-view/P");

    expect(await prisma.intakeIssue.count({ where: { issueId: chamadoId } })).toBe(1);
    expect(await prisma.moduleIssue.count({ where: { issueId: chamadoId, moduleId: moduloId } })).toBe(1);
    const anexos = await prisma.issueAttachment.findMany({ where: { issueId: chamadoId } });
    expect(anexos).toHaveLength(1);
    expect((anexos[0]!.attributes as any).name).toBe("print.png");
  });

  it("a mesma conversa não vira dois chamados: 409 com o chamado existente", async () => {
    const res = await admin.post(url(), { session_id: sessaoId });
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).issue_id).toBe(chamadoId);
  });

  it("conversa de outro espaço: 404", async () => {
    const outra = await createConversa("outro-espaco");
    expect((await admin.post(url(), { session_id: outra })).status).toBe(404);
  });

  it("módulo de outro sistema e prioridade inválida: 422", async () => {
    const conversa = await createConversa(wsSlug);
    const outroProjeto = await createProject(wsId, (await createUser()).id);
    const moduloAlheio = await createModule(outroProjeto.id, wsId);
    expect((await admin.post(url(), { session_id: conversa, module_id: moduloAlheio.id })).status).toBe(422);
    expect((await admin.post(url(), { session_id: conversa, priority: "altissima" })).status).toBe(422);
  });

  it("quem não abre pedido de chamado no sistema: 403", async () => {
    const conversa = await createConversa(wsSlug);
    const visitante = await createMemberWithToken(wsId, 5, projetoId, 5);
    const res = await apiClient(visitante.token).post(url(), { session_id: conversa });
    expect(res.status).toBe(403);
  });
});
