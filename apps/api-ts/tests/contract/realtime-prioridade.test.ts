/**
 * O evento SSE de chamado leva a prioridade: a faixa de urgentes do web decide
 * por ela se busca a lista de novo na hora (sem esperar o polling).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createProject,
  createUser,
  createWorkspace,
  TEST_API_BASE_URL,
} from "@tests/helpers/factory";

type EventoSse = { entity: string; action: string; id?: string; priority?: string | null };

const decoder = new TextDecoder();

/** Abre o stream SSE do espaço de trabalho e junta os eventos que chegarem. */
async function openStream(slug: string, token: string) {
  const ctrl = new AbortController();
  const res = await fetch(`${TEST_API_BASE_URL}/api/v1/workspaces/${slug}/realtime/stream/`, {
    headers: { "X-Api-Key": token },
    signal: ctrl.signal,
  });
  expect(res.status).toBe(200);
  const reader = res.body!.getReader();
  const eventos: EventoSse[] = [];
  let buffer = "";
  const readFrames = () => {
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    frames.filter((f) => f.startsWith("data: ")).forEach((f) => eventos.push(JSON.parse(f.slice(6))));
  };
  const readChunk = async (): Promise<void> => {
    const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
    if (done) return;
    buffer += decoder.decode(value);
    readFrames();
    return readChunk();
  };
  void readChunk();
  // O primeiro comentário confirma que o servidor já inscreveu o ouvinte.
  await Bun.sleep(150);
  return { eventos, close: () => ctrl.abort() };
}

async function waitEvento(eventos: EventoSse[], match: (e: EventoSse) => boolean, ms = 3000) {
  const achado = eventos.find(match);
  if (achado || ms <= 0) return achado;
  await Bun.sleep(50);
  return waitEvento(eventos, match, ms - 50);
}

describe("evento SSE de chamado leva a prioridade", () => {
  let client: ReturnType<typeof apiClient>;
  let token: string;
  let wsSlug: string;
  let projectId: string;
  let stream: Awaited<ReturnType<typeof openStream>> | null = null;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    token = (await createApiToken(user.id)).token;
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    projectId = (await createProject(ws.id, user.id)).id;
    client = apiClient(token);
  });

  afterEach(() => {
    stream?.close();
    stream = null;
  });

  afterAll(() => cleanDb());

  const issuesUrl = () => `/workspaces/${wsSlug}/projects/${projectId}/issues/`;

  it("criar chamado urgente publica priority urgent", async () => {
    stream = await openStream(wsSlug, token);
    const res = await client.post(issuesUrl(), { name: "Servidor fora do ar", priority: "urgent" });
    const { id } = (await res.json()) as { id: string };
    const evento = await waitEvento(
      stream.eventos,
      (e) => e.entity === "issue" && e.action === "create" && e.id === id
    );
    expect(evento?.priority).toBe("urgent");
  });

  it("baixar a prioridade publica a prioridade nova", async () => {
    const criado = (await (await client.post(issuesUrl(), { name: "Erro na guia", priority: "urgent" })).json()) as {
      id: string;
    };
    stream = await openStream(wsSlug, token);
    await client.patch(`${issuesUrl()}${criado.id}/`, { priority: "low" });
    const evento = await waitEvento(
      stream.eventos,
      (e) => e.entity === "issue" && e.action === "update" && e.id === criado.id
    );
    expect(evento?.priority).toBe("low");
  });

  it("editar outro campo publica a prioridade que o chamado já tinha", async () => {
    const criado = (await (await client.post(issuesUrl(), { name: "Lentidão", priority: "urgent" })).json()) as {
      id: string;
    };
    stream = await openStream(wsSlug, token);
    await client.patch(`${issuesUrl()}${criado.id}/`, { name: "Lentidão no fechamento" });
    const evento = await waitEvento(
      stream.eventos,
      (e) => e.entity === "issue" && e.action === "update" && e.id === criado.id
    );
    expect(evento?.priority).toBe("urgent");
  });

  it("apagar chamado publica a prioridade que ele tinha", async () => {
    const criado = (await (await client.post(issuesUrl(), { name: "Duplicado", priority: "urgent" })).json()) as {
      id: string;
    };
    stream = await openStream(wsSlug, token);
    await fetch(`${TEST_API_BASE_URL}/api/v1${issuesUrl()}${criado.id}/`, {
      method: "DELETE",
      headers: { "X-Api-Key": token },
    });
    const evento = await waitEvento(
      stream.eventos,
      (e) => e.entity === "issue" && e.action === "delete" && e.id === criado.id
    );
    expect(evento?.priority).toBe("urgent");
  });
});
