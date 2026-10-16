/**
 * W44: `issue.export` e `extension.upload` nascem com quem já fazia isso pelo nível.
 *
 * A tela exportava para o nível 15 (Membro) e o servidor aceitava extensões do
 * nível 12 (TI). As duas decisões viraram ação do catálogo; as funções de
 * sistema recebem pelo padrão no boot, e a migração
 * `20261016120000_acoes_que_a_tela_decidia_por_nivel` dá a ação às funções
 * criadas na tela com o mesmo nível. Ninguém ganha nem perde no deploy.
 */
import { beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import path from "path";
import prisma from "@db";
import { BASELINE_KNOWN_ACTIONS } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import { createUser, createWorkspace } from "@tests/helpers/factory";

const MIGRACAO = path.resolve(
  import.meta.dir,
  "../../prisma/migrations/20261016120000_acoes_que_a_tela_decidia_por_nivel/migration.sql"
);

/** Os comandos do arquivo, um por vez (o driver não aceita vários de uma vez). */
const runMigracao = async () => {
  const comandos = readFileSync(MIGRACAO, "utf8")
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean);
  for (const comando of comandos) await prisma.$executeRawUnsafe(comando);
};

describe("migração das ações que a tela decidia por nível", () => {
  let wsId: string;
  const funcao: Record<string, string> = {};

  const createFuncao = async (key: string, level: number, isSystem = false) => {
    const r = await prisma.workflowRole.create({
      data: {
        workspaceId: wsId,
        key,
        name: key,
        level,
        isSystem,
        permissions: ["issue.view"],
        knownActions: [...BASELINE_KNOWN_ACTIONS],
      },
    });
    funcao[key] = r.id;
  };

  const readPermissoes = async (key: string) =>
    (await prisma.workflowRole.findUniqueOrThrow({ where: { id: funcao[key] } })).permissions as string[];

  beforeAll(async () => {
    await cleanDb();
    const owner = await createUser();
    wsId = (await createWorkspace(owner.id)).id;
    await createFuncao("coordenacao", 15);
    await createFuncao("suporte-ti", 12);
    await createFuncao("revisao", 8);
    await createFuncao("sistema-15", 15, true);
    await runMigracao();
    await runMigracao();
  });

  it("função criada na tela com o nível do Membro passa a exportar", async () => {
    expect(await readPermissoes("coordenacao")).toEqual(["issue.view", "issue.export"]);
  });

  it("função criada na tela com o nível da TI passa a enviar extensões", async () => {
    expect(await readPermissoes("suporte-ti")).toEqual(["issue.view", "extension.upload"]);
  });

  it("os demais níveis e as funções de sistema não mudam (o boot cuida destas)", async () => {
    expect(await readPermissoes("revisao")).toEqual(["issue.view"]);
    expect(await readPermissoes("sistema-15")).toEqual(["issue.view"]);
  });
});
