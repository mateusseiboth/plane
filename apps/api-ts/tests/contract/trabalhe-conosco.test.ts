/**
 * Inscrição pública de currículo (`/trabalhe-conosco`) pela API de verdade:
 * a página, o interruptor do espaço, a gravação com origem "site", a recusa
 * de arquivo que não é PDF, o campo isca contra robô e o limite por IP.
 *
 * Precisa de uma API rodando contra o banco de teste (API_BASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import {
  TEST_API_BASE_URL,
  apiClient,
  createApiToken,
  createMemberWithToken,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

type Client = ReturnType<typeof apiClient>;

const pdf = (conteudo = "%PDF-1.7\ncurriculo") => new Blob([conteudo], { type: "application/pdf" });

const inscrever = (slug: string, campos: Record<string, string>, arquivo: Blob | null = pdf(), ip = "203.0.113.10") => {
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) form.append(k, v);
  if (arquivo) form.append("file", arquivo, "curriculo da ana.pdf");
  return fetch(`${TEST_API_BASE_URL}/trabalhe-conosco/api/inscricao?workspace=${slug}`, {
    method: "POST",
    body: form,
    headers: { "X-Forwarded-For": ip },
  });
};

const dadosDaAna = {
  name: "Ana Souza",
  email: "ana@exemplo.com",
  phone: "(67) 99999-1234",
  position: "Programadora",
  city: "Campo Grande",
  message: "Tenho experiência com suporte.",
  aceite_lgpd: "true",
};

describe("currículo pelo site", () => {
  let slug: string;
  let wsId: string;
  let gestor: Client;
  let membro: Client;

  beforeAll(async () => {
    await cleanDb();
    const owner = await createUser();
    const ws = await createWorkspace(owner.id);
    slug = ws.slug;
    wsId = ws.id;
    await seedWorkflowRoles(prisma, ws.id);
    gestor = apiClient((await createApiToken(owner.id)).token);
    membro = apiClient((await createMemberWithToken(ws.id, 15)).token);
  });

  afterAll(() => cleanDb());

  const ligar = (aberto: boolean) => gestor.patch(`/workspaces/${slug}/curriculos/config/`, { site_enabled: aberto });

  it("a página pública abre sem login", async () => {
    const res = await fetch(`${TEST_API_BASE_URL}/trabalhe-conosco?workspace=${slug}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("Trabalhe conosco");
  });

  it("desligado por padrão: a página diz que está fechada e a inscrição é recusada", async () => {
    const config = await (await fetch(`${TEST_API_BASE_URL}/trabalhe-conosco/api/config?workspace=${slug}`)).json();
    expect(config).toMatchObject({ aberto: false });

    const res = await inscrever(slug, dadosDaAna);
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).detail).toBe("As inscrições estão fechadas no momento.");
    expect(await prisma.curriculo.count({ where: { workspaceId: wsId } })).toBe(0);
  });

  it("quem não tem a ação não liga o interruptor", async () => {
    expect((await membro.patch(`/workspaces/${slug}/curriculos/config/`, { site_enabled: true })).status).toBe(403);
  });

  it("ligado, a inscrição grava o currículo com origem site e o aceite da LGPD", async () => {
    expect(await (await ligar(true)).json()).toMatchObject({ site_enabled: true, retention_days: 365 });

    const res = await inscrever(slug, dadosDaAna);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ detail: "Currículo recebido. Obrigado pelo interesse." });

    const salvo = await prisma.curriculo.findFirstOrThrow({ where: { workspaceId: wsId } });
    expect(salvo).toMatchObject({
      name: "Ana Souza",
      email: "ana@exemplo.com",
      city: "Campo Grande",
      position: "Programadora",
      source: "site",
      fileName: "curriculo da ana.pdf",
    });
    expect(salvo.consentAt).not.toBeNull();
  });

  it("a tela interna mostra a origem do currículo", async () => {
    const lista = (await (await gestor.get(`/workspaces/${slug}/curriculos/`)).json()) as any;
    expect(lista.results[0]).toMatchObject({ name: "Ana Souza", source: "site", email: "ana@exemplo.com" });
  });

  it("campo obrigatório volta no próprio campo", async () => {
    const res = await inscrever(slug, { ...dadosDaAna, email: "" }, pdf(), "203.0.113.11");
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors).toEqual([{ path: "email", message: "Informe um e-mail válido." }]);
  });

  it("arquivo que não é PDF é recusado", async () => {
    const res = await inscrever(slug, dadosDaAna, pdf("MZ isto é um executável"), "203.0.113.12");
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors).toEqual([
      { path: "file", message: "O arquivo enviado não é um PDF. Envie o currículo em PDF." },
    ]);
  });

  it("robô que preenche o campo isca recebe a mesma resposta, e nada é gravado", async () => {
    const antes = await prisma.curriculo.count({ where: { workspaceId: wsId } });
    const res = await inscrever(slug, { ...dadosDaAna, sobrenome: "spam" }, pdf(), "203.0.113.13");
    expect(res.status).toBe(201);
    expect(await prisma.curriculo.count({ where: { workspaceId: wsId } })).toBe(antes);
  });

  it("o mesmo IP não manda em rajada", async () => {
    const ip = "203.0.113.99";
    const respostas: number[] = [];
    for (const _ of Array.from({ length: 7 })) {
      // Em rajada de propósito: o limitador é por IP, e a ordem importa.
      // oxlint-disable-next-line no-await-in-loop
      respostas.push((await inscrever(slug, dadosDaAna, pdf(), ip)).status);
    }
    expect(respostas).toContain(429);
  });
});
