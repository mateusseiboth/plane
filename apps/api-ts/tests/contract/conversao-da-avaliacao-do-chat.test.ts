/**
 * `chat.ver_avaliacao` nasce com quem já via a nota do cliente.
 *
 * Desde as ações finas do chat (W38), a nota e o comentário da pesquisa de
 * satisfação saíam para quem tinha `chat.configurar`. A ação nova separa as duas
 * coisas; a migração `20261009140000_ver_avaliacao_do_chat` dá a ação nova a
 * toda função e a toda concessão por pessoa que tinha `chat.configurar`, e nega
 * a quem tinha `chat.configurar` negado. Assim ninguém ganha nem perde a nota
 * no deploy: o admin decide depois, na tela de Funções.
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
  "../../prisma/migrations/20261009140000_ver_avaliacao_do_chat/migration.sql"
);
const VER_AVALIACAO = "chat.ver_avaliacao";

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

describe("migração da ação de ver a avaliação do chat", () => {
  let slug: string;
  let wsId: string;
  let admin: ReturnType<typeof apiClient>;
  const funcao: Record<string, string> = {};
  const pessoa: Record<string, { id: string; token: string }> = {};

  const createFuncao = async (key: string, level: number, permissions: string[]) => {
    const r = await prisma.workflowRole.create({
      data: {
        workspaceId: wsId,
        key,
        name: key,
        level,
        isSystem: false,
        permissions,
        knownActions: [...BASELINE_KNOWN_ACTIONS],
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

  const readMinhasAcoes = async (apelido: string) => {
    const res = await apiClient(pessoa[apelido]!.token).get(`/workspaces/${slug}/roles/me/`);
    expect(res.status).toBe(200);
    return ((await res.json()) as any).permissions as string[];
  };

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser();
    const ws = await createWorkspace(dono.id);
    slug = ws.slug;
    wsId = ws.id;
    admin = apiClient((await createApiToken(dono.id)).token);

    await createFuncao("configura", 9, ["chat.atender", "chat.configurar"]);
    await createFuncao("so-atende", 11, ["chat.atender", "chat.relatorios"]);

    await createPessoa("concedida", funcao["so-atende"]!, ["chat.configurar"], []);
    await createPessoa("negada", funcao["configura"]!, [], ["chat.configurar"]);
    await createPessoa("comum", funcao["so-atende"]!, [], []);

    await runMigracao();
  });

  it("a função que configurava o chat passa a ver a avaliação", async () => {
    expect((await readFuncoes())["configura"]).toContain(VER_AVALIACAO);
  });

  it("a função que só atende e vê relatórios continua sem a avaliação", async () => {
    expect((await readFuncoes())["so-atende"]).not.toContain(VER_AVALIACAO);
  });

  it("exceções por pessoa acompanham as de chat.configurar", async () => {
    expect((await readOverrides("concedida")).grantedActions as string[]).toContain(VER_AVALIACAO);
    expect((await readOverrides("negada")).revokedActions as string[]).toContain(VER_AVALIACAO);
    const comum = await readOverrides("comum");
    expect(comum.grantedActions as string[]).not.toContain(VER_AVALIACAO);
    expect(comum.revokedActions as string[]).not.toContain(VER_AVALIACAO);
  });

  it("a ação efetiva é a mesma de quem via a nota antes", async () => {
    expect(await readMinhasAcoes("concedida")).toContain(VER_AVALIACAO);
    expect(await readMinhasAcoes("negada")).not.toContain(VER_AVALIACAO);
    expect(await readMinhasAcoes("comum")).not.toContain(VER_AVALIACAO);
  });

  it("rodar de novo não muda nada", async () => {
    const antes = await readFuncoes();
    const overridesAntes = await readOverrides("concedida");
    await runMigracao();
    expect(await readFuncoes()).toEqual(antes);
    expect(await readOverrides("concedida")).toEqual(overridesAntes);
  });
});
