/**
 * Conversão das ações grossas do chat (`chat.gerenciar`, `chat.administrar`)
 * nas ações finas que o módulo do chat registra (`@utils/acoes-do-chat`).
 *
 * Grava funções e exceções por pessoa no formato de antes, roda a migração
 * `20261009120000_acoes_finas_do_chat` (a mesma que o deploy aplica; ela é
 * idempotente) e lê o resultado pela API, como a tela de Funções lê.
 */
import { beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import path from "path";
import prisma from "@db";
import { BASELINE_KNOWN_ACTIONS } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import { apiClient, createApiToken, createMemberWithToken, createUser, createWorkspace } from "@tests/helpers/factory";

const MIGRACAO = path.resolve(
  import.meta.dir,
  "../../prisma/migrations/20261009120000_acoes_finas_do_chat/migration.sql"
);

const DO_ATENDER = ["chat.pausar", "chat.encerrar", "chat.abrir_chamado"];
const DO_GERENCIAR = ["chat.transferir", "chat.relatorios", "chat.ver_todas"];
const TODAS = [
  "chat.atender",
  ...DO_ATENDER,
  ...DO_GERENCIAR,
  "chat.ver_fila",
  "chat.disparo",
  "chat.configurar",
  "chat.frases_do_espaco",
];
const LEGADAS = ["chat.gerenciar", "chat.administrar"];

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

describe("migração das ações do chat", () => {
  let slug: string;
  let wsId: string;
  let admin: ReturnType<typeof apiClient>;
  const funcao: Record<string, string> = {};
  const pessoa: Record<string, { id: string; token: string }> = {};

  const createFuncao = async (key: string, level: number, permissions: string[], knownActions: string[] | null) => {
    const r = await prisma.workflowRole.create({
      data: {
        workspaceId: wsId,
        key,
        name: key,
        level,
        isSystem: false,
        permissions,
        knownActions: knownActions ?? undefined,
      },
    });
    funcao[key] = r.id;
  };

  const createPessoa = async (apelido: string, workflowRoleId: string, granted: string[], revoked: string[]) => {
    const m = await createMemberWithToken(wsId, 7);
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: wsId, memberId: m.user.id },
      data: { workflowRoleId, grantedActions: granted, revokedActions: revoked },
    });
    pessoa[apelido] = { id: m.user.id, token: m.token };
  };

  const readFuncoes = async () => {
    const res = await admin.get(`/workspaces/${slug}/roles/`);
    expect(res.status).toBe(200);
    return Object.fromEntries(((await res.json()) as any[]).map((f) => [f.key, f.permissions as string[]]));
  };

  const readOverrides = (apelido: string) =>
    prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsId, memberId: pessoa[apelido]!.id },
      select: { grantedActions: true, revokedActions: true },
    });

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser();
    const ws = await createWorkspace(dono.id);
    slug = ws.slug;
    wsId = ws.id;
    admin = apiClient((await createApiToken(dono.id)).token);

    await createFuncao("so-atende", 7, ["issue.view", "chat.atender"], [...BASELINE_KNOWN_ACTIONS, "chat.atender"]);
    await createFuncao("gerente", 9, ["issue.view", "chat.atender", "chat.gerenciar"], null);
    await createFuncao("administra", 11, ["chat.administrar"], null);
    await createFuncao("sem-chat", 13, ["issue.view"], [...BASELINE_KNOWN_ACTIONS]);

    await createPessoa("concedida", funcao["sem-chat"]!, ["chat.gerenciar"], []);
    await createPessoa("negada", funcao["administra"]!, [], ["chat.administrar"]);
    await createPessoa("sem-atender", funcao["so-atende"]!, [], ["chat.atender"]);

    await runMigracao();
  });

  it("quem atendia passa a pausar, encerrar e abrir chamado", async () => {
    const funcoes = await readFuncoes();
    expect([...funcoes["so-atende"]!].sort()).toEqual(["issue.view", "chat.atender", ...DO_ATENDER].sort());
  });

  it("quem gerenciava recebe transferir, relatórios e ver todas; a legada sai", async () => {
    const gerente = (await readFuncoes())["gerente"]!;
    for (const acao of [...DO_ATENDER, ...DO_GERENCIAR]) expect(gerente).toContain(acao);
    expect(gerente).not.toContain("chat.gerenciar");
    expect(gerente).not.toContain("chat.ver_fila");
    expect(gerente).not.toContain("chat.configurar");
  });

  it("quem administrava recebe todas as ações do chat", async () => {
    expect([...(await readFuncoes())["administra"]!].sort()).toEqual([...TODAS].sort());
  });

  it("função sem chat continua sem chat", async () => {
    expect((await readFuncoes())["sem-chat"]).toEqual(["issue.view"]);
  });

  it("as ações novas ficam conhecidas pela função: o boot não as devolve a quem o admin tirou", async () => {
    const r = await prisma.workflowRole.findUniqueOrThrow({ where: { id: funcao["sem-chat"]! } });
    for (const acao of TODAS) expect(r.knownActions as string[]).toContain(acao);
    const semConhecidas = await prisma.workflowRole.findUniqueOrThrow({ where: { id: funcao["gerente"]! } });
    for (const acao of [...BASELINE_KNOWN_ACTIONS, ...TODAS])
      expect(semConhecidas.knownActions as string[]).toContain(acao);
  });

  it("exceções por pessoa: a concessão e a negação da legada viram as finas", async () => {
    const concedida = await readOverrides("concedida");
    expect([...(concedida.grantedActions as string[])].sort()).toEqual([...DO_GERENCIAR].sort());

    const negada = await readOverrides("negada");
    expect([...(negada.revokedActions as string[])].sort()).toEqual(
      ["chat.configurar", "chat.frases_do_espaco", "chat.ver_fila"].sort()
    );

    const semAtender = await readOverrides("sem-atender");
    expect([...(semAtender.revokedActions as string[])].sort()).toEqual(["chat.atender", ...DO_ATENDER].sort());
  });

  it("a ação efetiva da pessoa sai da função convertida com as exceções convertidas", async () => {
    const me = async (apelido: string) => {
      const res = await apiClient(pessoa[apelido]!.token).get(`/workspaces/${slug}/roles/me/`);
      expect(res.status).toBe(200);
      return ((await res.json()) as any).permissions as string[];
    };
    expect(await me("concedida")).toEqual(expect.arrayContaining(DO_GERENCIAR));
    const negada = await me("negada");
    expect(negada).toContain("chat.transferir");
    expect(negada).not.toContain("chat.configurar");
    expect(await me("sem-atender")).not.toContain("chat.encerrar");
  });

  it("rodar de novo não muda nada", async () => {
    const antes = await readFuncoes();
    await runMigracao();
    expect(await readFuncoes()).toEqual(antes);
  });

  it("nenhuma função ou pessoa guarda as chaves legadas", async () => {
    for (const permissoes of Object.values(await readFuncoes()))
      for (const legada of LEGADAS) expect(permissoes).not.toContain(legada);
    for (const apelido of Object.keys(pessoa)) {
      const o = await readOverrides(apelido);
      for (const legada of LEGADAS) {
        expect(o.grantedActions as string[]).not.toContain(legada);
        expect(o.revokedActions as string[]).not.toContain(legada);
      }
    }
  });
});
