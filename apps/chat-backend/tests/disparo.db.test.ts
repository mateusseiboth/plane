/**
 * Disparo em massa no próprio processo (`module.handle`), contra o banco:
 * permissão pela matriz (`chat.disparo`), cadastro com arquivo, prévia pelos
 * filtros, fila por telefone no ritmo configurado, retomada depois de queda,
 * cancelamento, Status, fila da Z-API e auditoria.
 *
 * A Z-API é um servidor falso local: nenhuma mensagem sai de verdade.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { disparoModule } from "@/disparo/routes";
import { processWorkspace, recoverItensInterrompidos } from "@/disparo/worker";
import {
  cleanWorkspace,
  configureWorkspace,
  ensureAtendenteNoEspaco,
  limparWorkspacePlane,
  resolveTestAttendant,
  signPlaneToken,
  uniqueWorkspace,
} from "@tests/helpers/harness";

const slug = uniqueWorkspace("wsdisparo");

type Chamada = { method: string; action: string; body: any };
const zapi = { chamadas: [] as Chamada[], falhar: false };
let server: ReturnType<typeof Bun.serve>;

let token: string;
let withoutAcao: string;
let withoutAcaoId: string;
let workspaceUuid: string;
let prefeitura: string;
let camara: string;
let projeto: string;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function call(method: string, path: string, body?: unknown, auth: string | null = token) {
  const multipart = body instanceof FormData;
  const res = await disparoModule.handle(
    new Request(`http://chat.local/workspaces/${slug}/disparo${path}`, {
      method,
      headers: {
        ...(multipart ? {} : { "Content-Type": "application/json" }),
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      },
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
    })
  );
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

const formDaMensagem = (campos: Record<string, string>, arquivo?: File) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) form.append(k, v);
  if (arquivo) form.append("arquivo", arquivo);
  return form;
};

async function createEntidade(nome: string, tipo: number): Promise<string> {
  const id = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO entities (id, created_at, updated_at, workspace_id, name, entity_type, is_active)
     VALUES ($1::uuid, now(), now(), $2::uuid, $3, $4, true)`,
    id,
    workspaceUuid,
    nome,
    tipo
  );
  return id;
}

async function createContato(
  entityId: string,
  phone: string | null,
  extra: { ativo?: boolean; recebe?: boolean; projeto?: string } = {}
): Promise<string> {
  const id = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO entity_contacts (id, created_at, updated_at, workspace_id, entity_id, name, phone, is_active, receive_messages)
     VALUES ($1::uuid, now(), now(), $2::uuid, $3::uuid, $4, $5, $6, $7)`,
    id,
    workspaceUuid,
    entityId,
    `Responsável ${phone ?? "sem telefone"}`,
    phone,
    extra.ativo ?? true,
    extra.recebe ?? true
  );
  if (extra.projeto) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO entity_contact_projects (id, created_at, contact_id, project_id, workspace_id)
       VALUES (gen_random_uuid(), now(), $1::uuid, $2::uuid, $3::uuid)`,
      id,
      extra.projeto,
      workspaceUuid
    );
  }
  return id;
}

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const action = url.pathname.split("/token/")[1]?.split("/").slice(1).join("/") ?? "";
      zapi.chamadas.push({ method: req.method, action, body: await req.json().catch(() => null) });
      if (zapi.falhar) return new Response("número inválido", { status: 400 });
      if (action === "queue")
        return Response.json([{ Created: 0, Phone: "5567999990000", Message: "Oi", ZaapId: "z1" }]);
      return Response.json({ zaapId: "z", messageId: `m-${zapi.chamadas.length}` });
    },
  });
  await configureWorkspace(slug, `http://localhost:${server.port}`);

  const user = await resolveTestAttendant();
  await ensureAtendenteNoEspaco(slug, user.id);
  token = await signPlaneToken(user.id, user.email);

  const [ws] = (await prisma.$queryRaw`SELECT id::text AS id FROM workspaces WHERE slug = ${slug}`) as Array<{
    id: string;
  }>;
  workspaceUuid = ws!.id;

  // Quem dispara recebe a ação por pessoa (a função de teste só atende).
  await prisma.$executeRaw`
    UPDATE workspace_members SET granted_actions = '["chat.disparo"]'::jsonb
     WHERE workspace_id = ${workspaceUuid}::uuid AND member_id = ${user.id}::uuid`;

  const email = `sem-disparo-${slug}@teste.local`;
  const [outro] = (await prisma.$queryRaw`
    INSERT INTO users (id, created_at, updated_at, email, username, display_name, first_name, last_name, password,
                       is_active, is_email_verified, is_password_autoset, is_instance_admin, is_superuser, is_staff)
    VALUES (gen_random_uuid(), now(), now(), ${email}, ${email}, 'Sem Disparo', 'Sem', 'Disparo', 'x',
            true, true, false, false, false, false)
    RETURNING id::text AS id`) as Array<{ id: string }>;
  withoutAcaoId = outro!.id;
  await ensureAtendenteNoEspaco(slug, withoutAcaoId);
  withoutAcao = await signPlaneToken(withoutAcaoId, email);

  prefeitura = await createEntidade("Prefeitura de Teste", 0);
  camara = await createEntidade("Câmara de Teste", 1);
  projeto = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO projects (id, updated_at, workspace_id, name, identifier) VALUES ($1::uuid, now(), $2::uuid, 'SIART', 'SIA')`,
    projeto,
    workspaceUuid
  );

  await createContato(prefeitura, "(67) 9999-0001", { projeto });
  await createContato(prefeitura, "5567999990001"); // mesmo número com nono dígito
  await createContato(prefeitura, "(67) 3321-0000");
  await createContato(prefeitura, null);
  await createContato(prefeitura, "67999990009", { ativo: false });
  await createContato(prefeitura, "67999990008", { recebe: false });
  await createContato(camara, "67999990002", { projeto });
});

afterAll(async () => {
  server?.stop(true);
  await prisma.chatDisparoMensagem.deleteMany({ where: { workspaceId: slug } });
  await prisma.chatDisparoConfig.deleteMany({ where: { workspaceId: slug } });
  await cleanWorkspace(slug);
  await limparWorkspacePlane(slug);
  await prisma.$executeRaw`DELETE FROM users WHERE id::text = ${withoutAcaoId}`;
});

describe("permissão", () => {
  it("sem login 401; sem chat.disparo 403", async () => {
    expect((await call("GET", "/mensagens/", undefined, null)).status).toBe(401);
    expect((await call("GET", "/mensagens/", undefined, withoutAcao)).status).toBe(403);
    expect((await call("POST", "/previa/", {}, withoutAcao)).status).toBe(403);
    expect((await call("GET", "/fila-zapi/", undefined, withoutAcao)).status).toBe(403);
  });

  it("com a ação concedida por pessoa, entra", async () => {
    expect((await call("GET", "/mensagens/")).status).toBe(200);
  });
});

describe("cadastro de mensagem", () => {
  it("recusa sem título, no campo", async () => {
    const r = await call("POST", "/mensagens/", formDaMensagem({ titulo: "", texto: "Oi" }));
    expect(r.status).toBe(400);
    expect(r.body.errors).toEqual([{ path: "titulo", message: "Informe o título." }]);
  });

  it("recusa arquivo que não é imagem nem PDF", async () => {
    const zip = new File([new Uint8Array([1, 2])], "a.zip", { type: "application/zip" });
    const r = await call("POST", "/mensagens/", formDaMensagem({ titulo: "X", texto: "Oi" }, zip));
    expect(r.status).toBe(400);
    expect(r.body.errors[0].path).toBe("arquivo");
  });

  it("cria, lista, altera e exclui", async () => {
    const criada = await call("POST", "/mensagens/", formDaMensagem({ titulo: "Aviso", texto: "Olá" }));
    expect(criada.status).toBe(201);
    expect(criada.body).toMatchObject({ titulo: "Aviso", texto: "Olá", media_key: null });

    const alterada = await call(
      "PATCH",
      `/mensagens/${criada.body.id}/`,
      formDaMensagem({ titulo: "Aviso 2", texto: "Olá!" })
    );
    expect(alterada.body).toMatchObject({ titulo: "Aviso 2", texto: "Olá!" });

    const lista = await call("GET", "/mensagens/");
    expect(lista.body.map((m: any) => m.id)).toContain(criada.body.id);

    expect((await call("DELETE", `/mensagens/${criada.body.id}/`)).status).toBe(204);
    expect((await call("GET", "/mensagens/")).body.map((m: any) => m.id)).not.toContain(criada.body.id);
  });
});

describe("prévia", () => {
  it("conta um por telefone, só quem está ativo e aceita mensagem", async () => {
    const r = await call("POST", "/previa/", {});
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ total: 3, without_telefone: 1, repetidos: 1 });
  });

  it("filtra por tipo de entidade, entidade e sistema", async () => {
    expect((await call("POST", "/previa/", { entity_type: 1 })).body.total).toBe(1);
    expect((await call("POST", "/previa/", { entity_id: prefeitura })).body.total).toBe(2);
    expect((await call("POST", "/previa/", { project_id: projeto })).body.total).toBe(2);
  });

  it("filtro inválido volta no campo", async () => {
    const r = await call("POST", "/previa/", { entity_id: "x" });
    expect(r.status).toBe(400);
    expect(r.body.errors[0].path).toBe("entity_id");
  });
});

describe("envio, fila e histórico", () => {
  let mensagemId: string;
  let execucaoId: string;

  beforeAll(async () => {
    const png = new File([PNG], "banner.png", { type: "image/png" });
    const r = await call("POST", "/mensagens/", formDaMensagem({ titulo: "Campanha", texto: "Legenda" }, png));
    mensagemId = r.body.id;
  });

  it("enviar sem destinatário é recusado", async () => {
    const vazio = await createEntidade("Consórcio Vazio", 7);
    const r = await call("POST", `/mensagens/${mensagemId}/enviar/`, { entity_id: vazio });
    expect(r.status).toBe(422);
  });

  it("enviar cria a execução, um item por telefone, e grava a auditoria", async () => {
    const r = await call("POST", `/mensagens/${mensagemId}/enviar/`, {});
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ total: 3, without_telefone: 1, repetidos: 1, status: "em_andamento" });
    execucaoId = r.body.id;

    const itens = await prisma.chatDisparoItem.findMany({ where: { execucaoId } });
    expect(itens.map((i) => i.telefone).toSorted()).toEqual(["556733210000", "5567999990001", "5567999990002"]);
    expect(itens.every((i) => i.status === "pendente")).toBe(true);

    const [audit] = (await prisma.$queryRaw`
      SELECT action, metadata FROM audit_logs WHERE entity = 'chat_disparo' AND entity_id = ${execucaoId}`) as Array<{
      action: string;
      metadata: any;
    }>;
    expect(audit).toMatchObject({ action: "send", metadata: { total: 3, titulo: "Campanha" } });
  });

  it("a mesma mensagem não sai duas vezes ao mesmo tempo", async () => {
    expect((await call("POST", `/mensagens/${mensagemId}/enviar/`, {})).status).toBe(409);
  });

  it("o worker envia um por vez, no ritmo do espaço, com a legenda", async () => {
    zapi.chamadas.length = 0;
    const t0 = new Date("2030-01-01T12:00:00Z");
    await processWorkspace(slug, t0);
    await processWorkspace(slug, new Date(t0.getTime() + 1000)); // 20/min: ainda não
    expect(zapi.chamadas).toHaveLength(1);
    expect(zapi.chamadas[0]).toMatchObject({ action: "send-image", body: { caption: "Legenda" } });
    expect(String(zapi.chamadas[0]!.body.image)).toStartWith("data:image/png;base64,");

    await processWorkspace(slug, new Date(t0.getTime() + 3000));
    expect(zapi.chamadas).toHaveLength(2);
  });

  it("falha do provedor fica no item, com o motivo, e a execução termina", async () => {
    zapi.falhar = true;
    await processWorkspace(slug, new Date("2030-01-01T12:01:00Z"));
    zapi.falhar = false;

    const detalhe = await call("GET", `/execucoes/${execucaoId}/`);
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.status).toBe("concluida");
    expect(detalhe.body.resumo).toMatchObject({ enviado: 2, falhou: 1, pendente: 0 });
    const falhou = detalhe.body.itens.find((i: any) => i.status === "falhou");
    expect(falhou.erro).toContain("400");

    const historico = await call("GET", `/execucoes/?mensagem_id=${mensagemId}`);
    expect(historico.body[0]).toMatchObject({ id: execucaoId, resumo: { enviado: 2, falhou: 1 } });
  });

  it("depois de concluída, a mesma mensagem pode sair de novo; cancelar para o que falta", async () => {
    const r = await call("POST", `/mensagens/${mensagemId}/enviar/`, { entity_type: 0 });
    expect(r.status).toBe(201);
    const cancelada = await call("POST", `/execucoes/${r.body.id}/cancelar/`);
    expect(cancelada.body).toMatchObject({ status: "cancelada", resumo: { cancelado: 2, pendente: 0 } });

    zapi.chamadas.length = 0;
    await processWorkspace(slug, new Date("2030-01-01T13:00:00Z"));
    expect(zapi.chamadas).toHaveLength(0);
  });

  it("item que estava sendo enviado na queda vira falha, sem reenviar", async () => {
    const r = await call("POST", `/mensagens/${mensagemId}/enviar/`, { entity_type: 1 });
    await prisma.chatDisparoItem.updateMany({ where: { execucaoId: r.body.id }, data: { status: "processando" } });

    await recoverItensInterrompidos();

    const [item] = await prisma.chatDisparoItem.findMany({ where: { execucaoId: r.body.id } });
    expect(item!.status).toBe("falhou");
    expect(item!.erro).toBe("Envio interrompido por reinício do serviço. Não reenviado para evitar duplicidade.");
    zapi.chamadas.length = 0;
    await processWorkspace(slug, new Date("2030-01-01T14:00:00Z"));
    expect(zapi.chamadas).toHaveLength(0);
    expect((await call("GET", `/execucoes/${r.body.id}/`)).body.status).toBe("concluida");
  });

  it("publica a imagem no Status", async () => {
    zapi.chamadas.length = 0;
    const r = await call("POST", `/mensagens/${mensagemId}/status/`);
    expect(r.status).toBe(200);
    expect(zapi.chamadas[0]).toMatchObject({ action: "send-image-status" });
  });

  it("Status sem imagem é recusado", async () => {
    const texto = await call("POST", "/mensagens/", formDaMensagem({ titulo: "Só texto", texto: "Oi" }));
    expect((await call("POST", `/mensagens/${texto.body.id}/status/`)).status).toBe(422);
  });
});

describe("fila da Z-API e configuração", () => {
  it("lê a fila de saída", async () => {
    const r = await call("GET", "/fila-zapi/");
    expect(r.status).toBe(200);
    expect(r.body).toEqual([
      { id: "z1", telefone: "5567999990000", mensagem: "Oi", criadaEm: "1970-01-01T00:00:00.000Z" },
    ]);
  });

  it("ritmo: padrão 20, grava de 1 a 60 e recusa fora disso no campo", async () => {
    expect((await call("GET", "/config/")).body).toEqual({ mensagens_por_minuto: 20 });
    expect((await call("PUT", "/config/", { mensagens_por_minuto: 30 })).body).toEqual({ mensagens_por_minuto: 30 });
    const r = await call("PUT", "/config/", { mensagens_por_minuto: 0 });
    expect(r.status).toBe(400);
    expect(r.body.errors[0].path).toBe("mensagens_por_minuto");
  });
});
