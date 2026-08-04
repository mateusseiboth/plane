/**
 * Defaults canônicos de projeto (workflow pt-BR). ensureProjectDefaults roda no
 * boot e na migração; precisa ser idempotente e nunca deixar "Concluído" como
 * estado padrão.
 */
import {beforeAll, afterAll, describe, expect, it} from "bun:test";
import prisma from "@db";
import {cleanDb} from "@tests/helpers/setup";
import {createProject, createUser, createWorkspace} from "@tests/helpers/factory";
import {
  DEFAULT_LABELS,
  DEFAULT_STATES,
  STATE_RENAME,
  ensureProjectDefaults,
  slugify,
} from "@utils/project-defaults";

describe("slugify", () => {
  it("remove acentos e normaliza separadores", () => {
    expect(slugify("Em Análise")).toBe("em-analise");
    expect(slugify("Pendências")).toBe("pendencias");
    expect(slugify("Concluído")).toBe("concluido");
  });

  it("não deixa hífens nas pontas", () => {
    expect(slugify("  A Fazer  ")).toBe("a-fazer");
    expect(slugify("!!!Triagem!!!")).toBe("triagem");
  });
});

describe("ensureProjectDefaults", () => {
  let workspaceId: string;
  let projectId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const ws = await createWorkspace(user.id);
    workspaceId = ws.id;
    // createProject cria os estados em inglês (Backlog/Done/...), justamente o
    // cenário que o rename precisa converter.
    const project = await createProject(ws.id, user.id);
    projectId = project.id;
  });

  afterAll(() => cleanDb());

  it("renomeia os estados legados e cria os que faltam", async () => {
    const result = await ensureProjectDefaults(prisma, workspaceId);
    expect(result.projects).toBe(1);
    expect(result.statesRenamed).toBeGreaterThan(0);

    const states = await prisma.state.findMany({where: {projectId, deletedAt: null}});
    const names = states.map((s) => s.name).sort();
    for (const st of DEFAULT_STATES) expect(names).toContain(st.name);
    expect(names).not.toContain("Backlog");
    expect(names).not.toContain("Done");
  });

  it("marca Pendências como estado padrão (nunca Concluído)", async () => {
    const defaults = await prisma.state.findMany({where: {projectId, default: true, deletedAt: null}});
    expect(defaults).toHaveLength(1);
    expect(defaults[0].name).toBe("Pendências");
  });

  it("habilita o intake e cria a caixa de entrada", async () => {
    const project = await prisma.project.findUniqueOrThrow({where: {id: projectId}});
    expect(project.intakeView).toBe(true);
    expect(await prisma.intake.count({where: {projectId}})).toBe(1);
  });

  it("cria os labels padrão com SLA", async () => {
    const labels = await prisma.label.findMany({where: {projectId, deletedAt: null}});
    for (const dl of DEFAULT_LABELS) {
      const found = labels.find((l) => l.name === dl.name);
      expect(found).toBeDefined();
      expect(found!.slaHours).toBe(dl.slaHours as any);
    }
  });

  it("é idempotente — a segunda execução não cria nada", async () => {
    const before = await prisma.state.count({where: {projectId, deletedAt: null}});
    const result = await ensureProjectDefaults(prisma, workspaceId);
    expect(result.statesCreated).toBe(0);
    expect(result.statesRenamed).toBe(0);
    expect(result.intakesCreated).toBe(0);
    expect(result.labelsCreated).toBe(0);
    expect(await prisma.state.count({where: {projectId, deletedAt: null}})).toBe(before);
  });

  it("mantém o id do estado ao renomear (issues não perdem o vínculo)", async () => {
    expect(Object.keys(STATE_RENAME)).toContain("Backlog");
    const pend = await prisma.state.findFirstOrThrow({where: {projectId, name: "Pendências"}});
    expect(pend.slug).toBe("pendencias");
  });

  it("não faz nada quando o workspace não tem projetos", async () => {
    const user = await createUser();
    const empty = await createWorkspace(user.id);
    const result = await ensureProjectDefaults(prisma, empty.id);
    expect(result).toEqual({projects: 0, statesRenamed: 0, statesCreated: 0, intakesCreated: 0, labelsCreated: 0});
  });
});
