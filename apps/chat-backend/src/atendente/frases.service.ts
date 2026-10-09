/**
 * Frases prontas: as do espaço (cadastro de quem administra o chat) e as
 * pessoais (cada atendente cuida das próprias). Regras em `frases.ts`; aqui só a
 * orquestração com o banco.
 *
 * Toda leitura e escrita passa pelo DONO: a frase do espaço tem `ownerUserId`
 * nulo, a pessoal tem o id de quem a cadastrou. Frase de outro dono responde 404,
 * como se não existisse.
 */

import prisma from "@db";
import { FraseNaoEncontradaError, requireValid } from "@/atendente/errors";
import {
  ESCOPO_DA_FRASE,
  FRASES_PADRAO,
  buildDonoDaFrase,
  buildFiltroDasFrasesVisiveis,
  parseFrase,
  readEscopoDaFrase,
  type EscopoDaFrase,
} from "@/atendente/frases";
import { asCorpo } from "@/ligacoes/payload";

type Frase = { id: string; texto: string; ordem: number; ownerUserId: string | null };

/** Quem age e sobre quais frases: o espaço (dono nulo) ou as próprias. */
export type DonoDaFrase = { slug: string; escopo: EscopoDaFrase; userId: string };

const ORDEM = [{ ordem: "asc" as const }, { createdAt: "asc" as const }];

const serializeFrase = (f: Frase) => ({ id: f.id, texto: f.texto, ordem: f.ordem, escopo: readEscopoDaFrase(f) });

const buildFiltroDoDono = ({ slug, escopo, userId }: DonoDaFrase) => ({
  workspaceId: slug,
  ownerUserId: buildDonoDaFrase(escopo, userId),
});

const listWhere = async (where: object) => ({
  results: (await prisma.chatFrasePronta.findMany({ where, orderBy: ORDEM })).map(serializeFrase),
});

/** O compositor de quem atende: as do espaço e as próprias. */
export const listFrasesVisiveis = (slug: string, userId: string) =>
  listWhere(buildFiltroDasFrasesVisiveis(slug, userId));

/** Só as do dono (a configuração do espaço lista só as compartilhadas). */
export const listFrasesDoDono = (dono: DonoDaFrase) => listWhere(buildFiltroDoDono(dono));

export async function createFrase(dono: DonoDaFrase, body: unknown) {
  const dados = requireValid(parseFrase(body));
  return serializeFrase(await prisma.chatFrasePronta.create({ data: { ...buildFiltroDoDono(dono), ...dados } }));
}

async function requireFrase(dono: DonoDaFrase, id: string) {
  const frase = await prisma.chatFrasePronta.findFirst({ where: { id, ...buildFiltroDoDono(dono) } });
  if (!frase) throw new FraseNaoEncontradaError();
  return frase;
}

/** PATCH: o que não veio continua como estava. */
export async function updateFrase(dono: DonoDaFrase, id: string, body: unknown) {
  const atual = await requireFrase(dono, id);
  const dados = requireValid(parseFrase({ texto: atual.texto, ordem: atual.ordem, ...asCorpo(body) }));
  return serializeFrase(await prisma.chatFrasePronta.update({ where: { id }, data: dados }));
}

export async function deleteFrase(dono: DonoDaFrase, id: string) {
  await requireFrase(dono, id);
  await prisma.chatFrasePronta.delete({ where: { id } });
  return { ok: true };
}

/**
 * As frases do SAC, só quando o espaço ainda não tem nenhuma frase compartilhada
 * (clicar de novo não duplica; frase pessoal não conta).
 */
export async function seedFrasesPadrao(slug: string, userId: string) {
  const doEspaco: DonoDaFrase = { slug, escopo: ESCOPO_DA_FRASE.ESPACO, userId };
  const { workspaceId, ownerUserId } = buildFiltroDoDono(doEspaco);
  const existentes = await prisma.chatFrasePronta.count({ where: { workspaceId, ownerUserId } });
  if (!existentes)
    await prisma.chatFrasePronta.createMany({
      data: FRASES_PADRAO.map((texto, ordem) => ({ workspaceId, ownerUserId, texto, ordem })),
    });
  return listFrasesDoDono(doEspaco);
}
