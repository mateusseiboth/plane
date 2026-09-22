/**
 * Frases prontas: leitura (quem atende) e cadastro (quem administra o chat).
 * Regras em `frases.ts`; aqui só a orquestração com o banco.
 */

import prisma from "@db";
import { FraseNaoEncontradaError, requireValid } from "@/atendente/errors";
import { FRASES_PADRAO, parseFrase } from "@/atendente/frases";
import { asCorpo } from "@/ligacoes/payload";

type Frase = { id: string; texto: string; ordem: number };

const serializeFrase = (f: Frase) => ({ id: f.id, texto: f.texto, ordem: f.ordem });

export async function listFrases(slug: string) {
  const frases = await prisma.chatFrasePronta.findMany({
    where: { workspaceId: slug },
    orderBy: [{ ordem: "asc" }, { createdAt: "asc" }],
  });
  return { results: frases.map(serializeFrase) };
}

export async function createFrase(slug: string, body: unknown) {
  const dados = requireValid(parseFrase(body));
  return serializeFrase(await prisma.chatFrasePronta.create({ data: { workspaceId: slug, ...dados } }));
}

async function requireFrase(slug: string, id: string) {
  const frase = await prisma.chatFrasePronta.findFirst({ where: { id, workspaceId: slug } });
  if (!frase) throw new FraseNaoEncontradaError();
  return frase;
}

/** PATCH: o que não veio continua como estava. */
export async function updateFrase(slug: string, id: string, body: unknown) {
  const atual = await requireFrase(slug, id);
  const dados = requireValid(parseFrase({ texto: atual.texto, ordem: atual.ordem, ...asCorpo(body) }));
  return serializeFrase(await prisma.chatFrasePronta.update({ where: { id }, data: dados }));
}

export async function deleteFrase(slug: string, id: string) {
  await requireFrase(slug, id);
  await prisma.chatFrasePronta.delete({ where: { id } });
  return { ok: true };
}

/** As frases do SAC, só quando o espaço ainda não tem nenhuma (clicar de novo não duplica). */
export async function seedFrasesPadrao(slug: string) {
  const existentes = await prisma.chatFrasePronta.count({ where: { workspaceId: slug } });
  if (!existentes)
    await prisma.chatFrasePronta.createMany({
      data: FRASES_PADRAO.map((texto, ordem) => ({ workspaceId: slug, texto, ordem })),
    });
  return listFrases(slug);
}
