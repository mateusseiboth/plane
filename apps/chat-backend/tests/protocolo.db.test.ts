/**
 * Protocolo do atendimento: `chat_sessions.protocol` é único no banco inteiro
 * (a transcrição é aberta por `/sessions/by-protocol/:protocol/`, sem espaço),
 * então a sequência do dia também tem de ser uma só. Com um contador por
 * espaço, dois espaços no mesmo dia geravam o mesmo número e o segundo
 * atendimento quebrava na criação. Roda contra o banco (DATABASE_URL).
 */
import { afterAll, describe, expect, test } from "bun:test";
import prisma from "@db";
import { nextProtocol } from "@/protocol";
import { cleanWorkspace, uniqueWorkspace } from "@tests/helpers/harness";

const espacoA = uniqueWorkspace("wsprotoa");
const espacoB = uniqueWorkspace("wsprotob");
const hoje = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");
const sequencia = (protocolo: string) => Number(protocolo.split("-")[1]);

afterAll(async () => {
  await cleanWorkspace(espacoA);
  await cleanWorkspace(espacoB);
});

describe("nextProtocol", () => {
  test("dois espaços no mesmo dia nunca recebem o mesmo protocolo", async () => {
    const a = await nextProtocol();
    const b = await nextProtocol();
    await prisma.chatSession.create({ data: { workspaceId: espacoA, channel: "native", protocol: a } });
    await prisma.chatSession.create({ data: { workspaceId: espacoB, channel: "native", protocol: b } });
    expect(a).not.toBe(b);
    expect(a.startsWith(`${hoje()}-`)).toBe(true);
  });

  test("aberturas simultâneas recebem números distintos", async () => {
    const protocolos = await Promise.all(Array.from({ length: 20 }, () => nextProtocol()));
    expect(new Set(protocolos).size).toBe(20);
  });

  // O salto é pequeno de propósito: o contador é global e outros testes do
  // mesmo banco esperam protocolo de 4 dígitos.
  test("continua depois do maior protocolo já gravado no dia", async () => {
    const adiante = sequencia(await nextProtocol()) + 5;
    const existente = `${hoje()}-${String(adiante).padStart(4, "0")}`;
    await prisma.chatSession.create({ data: { workspaceId: espacoA, channel: "native", protocol: existente } });
    expect(sequencia(await nextProtocol())).toBeGreaterThan(adiante);
  });
});
