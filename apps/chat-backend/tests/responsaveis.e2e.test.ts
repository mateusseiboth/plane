/**
 * Responsáveis no atendimento, ponta a ponta.
 *
 * Duas promessas do produto, e nenhuma delas dá para verificar sem o banco:
 *
 *   1. quem já tem cadastro é chamado pelo nome — o bot pergunta "Você é
 *      {nome do Responsável}?" em vez do apelido que o WhatsApp mandou;
 *   2. quem não tem cadastro passa a ter, gravado em `entity_contacts` no
 *      encerramento — e não num registro paralelo que ninguém mais lê.
 *
 * Pré-requisitos: os mesmos dos demais testes e2e (chat-backend em execução
 * apontando para o MESMO banco), com a migração de Responsáveis do api-ts já
 * aplicada — é dela a tabela `entity_contacts`.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  buscarResponsavel,
  cleanWorkspace,
  configureWorkspace,
  connectAttendant,
  criarEntidade,
  criarResponsavel,
  criarWorkspacePlane,
  limparWorkspacePlane,
  prisma,
  resolveTestAttendant,
  sendWhatsAppText,
  signPlaneToken,
  startFakeZapi,
  uniqueWorkspace,
  waitUntil,
  type AttendantSocket,
  type FakeZapi,
} from "@tests/helpers/harness";

const workspace = uniqueWorkspace("wsresp");
/** Cadastrado exatamente como o WhatsApp entrega (55 + DDD + 9 dígitos). */
const telefoneCadastrado = "5567988810001";
/** Cadastrado SEM o nono dígito; o WhatsApp vai chegar com ele. */
const telefoneSemNono = "556733320002";
const telefoneComNono = "5567933320002";
/** Ninguém conhece este número: é o que vira cadastro no encerramento. */
const telefoneDesconhecido = "5567988810003";

let zapi: FakeZapi;
let atendente: AttendantSocket;
let workspaceId: string;
let entidadeId: string;
let responsavelId: string;

/** Deixa a conversa em atendimento (atendente atribuído), pronta para encerrar. */
async function abrirAtendimento(telefone: string): Promise<string> {
  await sendWhatsAppText(workspace, telefone, "oi");
  const sessao = await waitUntil(() =>
    prisma.chatSession.findFirst({ where: { workspaceId: workspace, clientPhone: telefone } })
  );
  await prisma.chatSession.update({ where: { id: sessao!.id }, data: { botState: "done" } });
  atendente.send({ type: "agent.open", session_id: sessao!.id });
  atendente.send({ type: "agent.assign", session_id: sessao!.id });
  await waitUntil(async () => {
    const s = await prisma.chatSession.findUnique({ where: { id: sessao!.id } });
    return s?.status === "active" ? s : null;
  });
  return sessao!.id;
}

beforeAll(async () => {
  zapi = startFakeZapi();
  await configureWorkspace(workspace, zapi.baseUrl);

  workspaceId = await criarWorkspacePlane(workspace);
  entidadeId = await criarEntidade(workspaceId, "Prefeitura de Teste");
  responsavelId = await criarResponsavel(workspaceId, {
    nome: "Maria Responsável",
    telefone: telefoneCadastrado,
    entityId: entidadeId,
  });
  await criarResponsavel(workspaceId, {
    nome: "João Sem Nono",
    telefone: telefoneSemNono,
    entityId: entidadeId,
  });

  const usuario = await resolveTestAttendant();
  atendente = await connectAttendant(workspace, await signPlaneToken(usuario.id, usuario.email));
}, 30000);

afterAll(async () => {
  atendente?.close();
  zapi?.stop();
  await cleanWorkspace(workspace);
  await limparWorkspacePlane(workspace);
});

describe("identificação pelo telefone", () => {
  test("número cadastrado: o bot confirma pelo nome do Responsável e vincula a sessão", async () => {
    await sendWhatsAppText(workspace, telefoneCadastrado, "bom dia", "Zé do Celular");

    // O nome do cadastro vence o nome de perfil que o WhatsApp mandou.
    await zapi.waitFor((c) => c.action === "send-text" && String(c.body.message).includes("Você é Maria Responsável"));

    const sessao = await waitUntil(async () => {
      const s = await prisma.chatSession.findFirst({ where: { workspaceId: workspace, clientPhone: telefoneCadastrado } });
      return s?.entityContactId ? s : null;
    });
    expect(sessao!.entityContactId).toBe(responsavelId);
    expect(sessao!.clientName).toBe("Maria Responsável");
    expect(sessao!.botState).toBe("confirm_contact");
  }, 20000);

  test("cadastro sem o nono dígito é encontrado por quem chega com ele", async () => {
    await sendWhatsAppText(workspace, telefoneComNono, "oi", "Desconhecido");
    await zapi.waitFor((c) => c.action === "send-text" && String(c.body.message).includes("Você é João Sem Nono"));
  }, 20000);

  test("número desconhecido continua caindo na pergunta do nome", async () => {
    zapi.reset();
    await sendWhatsAppText(workspace, telefoneDesconhecido, "oi", "");
    await zapi.waitFor((c) => c.action === "send-text" && String(c.body.message).includes("qual é o seu nome"));

    const sessao = await waitUntil(() =>
      prisma.chatSession.findFirst({ where: { workspaceId: workspace, clientPhone: telefoneDesconhecido } })
    );
    expect(sessao!.entityContactId).toBeNull();
  }, 20000);
});

describe("cadastro no encerramento", () => {
  test("cliente sem cadastro vira Responsável em entity_contacts", async () => {
    const sessionId = await abrirAtendimento(telefoneDesconhecido);
    atendente.send({
      type: "agent.close",
      session_id: sessionId,
      contact: { name: "Carlos Novo", email: "carlos@prefeitura.test", entity_id: entidadeId },
    });

    const sessao = await waitUntil(async () => {
      const s = await prisma.chatSession.findUnique({ where: { id: sessionId } });
      return s?.entityContactId ? s : null;
    });
    expect(sessao).not.toBeNull();

    const responsavel = await buscarResponsavel(sessao!.entityContactId!);
    expect(responsavel.name).toBe("Carlos Novo");
    expect(responsavel.email).toBe("carlos@prefeitura.test");
    expect(responsavel.entityId).toBe(entidadeId);
    // O telefone do atendimento entra sozinho: é a chave da próxima conversa.
    expect(responsavel.phoneDigits).toBe(telefoneDesconhecido);
    expect(responsavel.externalSource).toBe("chat");

    // O contato do chat (histórico) segue existindo e acompanha o cadastro.
    const contato = await prisma.contact.findFirst({ where: { workspaceId: workspace, phone: telefoneDesconhecido } });
    expect(contato!.name).toBe("Carlos Novo");
    expect(contato!.entityId).toBe(entidadeId);
  }, 30000);

  test("cliente já cadastrado é atualizado, não duplicado", async () => {
    const antes = await prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT count(*) AS total FROM entity_contacts
       WHERE workspace_id = ${workspaceId}::uuid AND phone_digits = ${telefoneCadastrado}`;

    const sessionId = await abrirAtendimento(telefoneCadastrado);
    atendente.send({
      type: "agent.close",
      session_id: sessionId,
      contact: { name: "Maria Responsável", email: "maria@prefeitura.test" },
    });

    const atualizado = await waitUntil(async () => {
      const r = await buscarResponsavel(responsavelId);
      return r?.email === "maria@prefeitura.test" ? r : null;
    });
    expect(atualizado).not.toBeNull();

    const depois = await prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT count(*) AS total FROM entity_contacts
       WHERE workspace_id = ${workspaceId}::uuid AND phone_digits = ${telefoneCadastrado}`;
    expect(Number(depois[0]!.total)).toBe(Number(antes[0]!.total));

    const sessao = await prisma.chatSession.findUnique({ where: { id: sessionId } });
    expect(sessao!.entityContactId).toBe(responsavelId);
  }, 30000);

  test("encerramento sem cadastro informado apenas fecha o atendimento", async () => {
    const sessionId = await abrirAtendimento(telefoneComNono);
    atendente.send({ type: "agent.close", session_id: sessionId });

    const fechada = await waitUntil(async () => {
      const s = await prisma.chatSession.findUnique({ where: { id: sessionId } });
      return s?.status === "closed" ? s : null;
    });
    expect(fechada).not.toBeNull();
  }, 30000);
});
