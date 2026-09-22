/**
 * Setor do SAC legado → função do modelo novo, quem da migração entra ativo, e
 * a correção de bases já migradas (associações com o nível 10, que não existe).
 * As regras puras rodam sem banco; a correção usa o banco de teste.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import { createProject, createUser, createWorkspace } from "@tests/helpers/factory";
import { DEFAULT_ROLES, seedWorkflowRoles } from "@utils/permissions";
import {
  NIVEL_INVALIDO_LEGADO,
  fixNiveisLegado,
  isContaDaCasa,
  isSetorDeCampo,
  resolveNivelDoSetor,
} from "@utils/papel-do-setor";

const NIVEIS_VALIDOS = DEFAULT_ROLES.map((r) => r.level);
const nivelDe = (key: string) => DEFAULT_ROLES.find((r) => r.key === key)!.level;

describe("resolveNivelDoSetor", () => {
  it.each([
    ["Gestão de Projetos", "gestor_projeto"],
    ["Diretoria", "gestor_projeto"],
    ["TI", "ti"],
    ["Tecnologia da Informação", "ti"],
    ["Gestão de Qualidade", "qualidade"],
    ["Atendimento", "atendimento"],
    ["Técnico", "atendimento"],
    ["Tecnico de campo", "atendimento"],
    ["Representante", "guest"],
    ["Consultor", "guest"],
    ["Financeiro", "atendimento"],
    ["Comercial", "atendimento"],
    ["", "atendimento"],
  ])("%s → %s", (setor, papel) => {
    expect(resolveNivelDoSetor(setor)).toBe(nivelDe(papel));
  });

  it("nunca devolve um nível que não existe no modelo novo", () => {
    for (const setor of ["Financeiro", "Comercial", "RH", "Outro", "Suporte Técnico", "Representante"]) {
      expect(NIVEIS_VALIDOS).toContain(resolveNivelDoSetor(setor));
    }
  });
});

describe("isSetorDeCampo", () => {
  it("representante, consultor e técnico são de campo", () => {
    expect(isSetorDeCampo("Representante Comercial")).toBe(true);
    expect(isSetorDeCampo("Consultor")).toBe(true);
    expect(isSetorDeCampo("Técnico")).toBe(true);
  });

  it("Suporte Técnico NÃO é de campo: são os contatos das prefeituras", () => {
    expect(isSetorDeCampo("Suporte Técnico")).toBe(false);
  });
});

describe("isContaDaCasa", () => {
  const DOMINIO = "@qualitysistemas.com.br";

  it("equipe interna com e-mail corporativo entra", () => {
    expect(isContaDaCasa("TI", "ana@qualitysistemas.com.br", DOMINIO)).toBe(true);
  });

  it("setor interno com e-mail de fora continua fora", () => {
    expect(isContaDaCasa("Suporte Técnico", "contato@prefeitura.gov.br", DOMINIO)).toBe(false);
    expect(isContaDaCasa("Financeiro", "x@gmail.com", DOMINIO)).toBe(false);
  });

  it("representante, consultor e técnico entram mesmo com e-mail próprio", () => {
    expect(isContaDaCasa("Representante", "rep@gmail.com", DOMINIO)).toBe(true);
    expect(isContaDaCasa("Técnico", "tec@hotmail.com", DOMINIO)).toBe(true);
  });

  it("cliente sem setor da casa fica fora", () => {
    expect(isContaDaCasa("Prefeitura", "a@b.com", DOMINIO)).toBe(false);
  });
});

describe("fixNiveisLegado", () => {
  let workspaceId: string;
  let projetoA: string;
  let projetoB: string;

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser();
    const ws = await createWorkspace(dono.id);
    workspaceId = ws.id;
    projetoA = (await createProject(ws.id, dono.id)).id;
    projetoB = (await createProject(ws.id, dono.id, { identifier: "SEGB" })).id;
    await seedWorkflowRoles(prisma, ws.id);
  });

  afterAll(() => cleanDb());

  const associar = async (wsRole: number, papeis: Record<string, number>) => {
    const u = await createUser();
    await prisma.workspaceMember.create({ data: { workspaceId, memberId: u.id, role: wsRole, isActive: true } });
    for (const [projectId, role] of Object.entries(papeis)) {
      await prisma.projectMember.create({ data: { projectId, workspaceId, memberId: u.id, role, isActive: true } });
    }
    return u.id;
  };

  it("Gestor com vínculo 10 num sistema herda o 18 que tem nos outros", async () => {
    const id = await associar(15, { [projetoA]: 18, [projetoB]: NIVEL_INVALIDO_LEGADO });
    await fixNiveisLegado(prisma, workspaceId);
    const b = await prisma.projectMember.findFirstOrThrow({ where: { projectId: projetoB, memberId: id } });
    expect(b.role).toBe(18);
    const gestor = await prisma.workflowRole.findFirstOrThrow({ where: { workspaceId, key: "gestor_projeto" } });
    expect(b.workflowRoleId).toBe(gestor.id);
  });

  it("quem só tem nível 10 vira Atendimento no espaço e nos sistemas", async () => {
    const id = await associar(NIVEL_INVALIDO_LEGADO, { [projetoA]: NIVEL_INVALIDO_LEGADO });
    const r = await fixNiveisLegado(prisma, workspaceId);
    const wm = await prisma.workspaceMember.findFirstOrThrow({ where: { workspaceId, memberId: id } });
    const pm = await prisma.projectMember.findFirstOrThrow({ where: { projectId: projetoA, memberId: id } });
    expect(wm.role).toBe(nivelDe("atendimento"));
    expect(pm.role).toBe(nivelDe("atendimento"));
    expect(r.workspaceMembers).toBeGreaterThanOrEqual(1);
  });

  it("TI com vínculo 10 fica com o nível do espaço", async () => {
    const id = await associar(12, { [projetoA]: NIVEL_INVALIDO_LEGADO });
    await fixNiveisLegado(prisma, workspaceId);
    const pm = await prisma.projectMember.findFirstOrThrow({ where: { projectId: projetoA, memberId: id } });
    expect(pm.role).toBe(12);
  });

  it("é idempotente: a segunda passada não acha mais nada", async () => {
    const r = await fixNiveisLegado(prisma, workspaceId);
    expect(r).toEqual({ workspaceMembers: 0, projectMembers: 0 });
    expect(await prisma.projectMember.count({ where: { workspaceId, role: NIVEL_INVALIDO_LEGADO } })).toBe(0);
  });
});
