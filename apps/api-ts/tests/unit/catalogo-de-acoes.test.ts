/**
 * Catálogo de ações (fonte única da matriz de permissões) e as regras puras que
 * dependem dele: permissões padrão de cada função, concessão e negação por
 * pessoa e a entrada de ações novas nas funções de sistema já gravadas. Sem banco.
 */
import { describe, expect, it } from "bun:test";
import {
  ACTION_CATALOG,
  ALL_ACTIONS,
  BASELINE_KNOWN_ACTIONS,
  DEFAULT_ROLES,
  EProjectAction,
  applyMemberOverrides,
  isKnownAction,
  mergeNewActions,
} from "@utils/permissions";

const permissoesDe = (key: string): string[] => [...DEFAULT_ROLES.find((r) => r.key === key)!.permissions].sort();
const donosDe = (acao: string) =>
  DEFAULT_ROLES.filter((r) => r.permissions.includes(acao as EProjectAction))
    .map((r) => r.key)
    .sort();

// Retrato do que cada função tinha ANTES do catálogo virar fonte única, restrito
// às 28 ações antigas. As únicas diferenças de propósito são `state.manage` e
// `project.settings` para Membro (e `project.settings` para Gestor): o backend já
// liberava etapas e configurações do sistema para papel >= 15, só que por
// número, sem passar pela matriz.
const ANTES: Record<string, string[]> = {
  guest: ["issue.view", "comment.read", "attachment.view"],
  atendimento: [
    "issue.view",
    "comment.read",
    "attachment.view",
    "comment.create",
    "comment.edit.own",
    "comment.delete.own",
    "attachment.upload",
    "attachment.delete.own",
    "intake.create",
  ],
  qualidade: [
    "issue.view",
    "comment.read",
    "attachment.view",
    "comment.create",
    "comment.edit.own",
    "comment.delete.own",
    "attachment.upload",
    "attachment.delete.own",
    "intake.create",
    "issue.create",
    "issue.edit.own",
    "issue.assign.self",
    "issue.edit.all",
    "intake.review",
    "view.create",
  ],
  member: [
    "issue.view",
    "comment.read",
    "attachment.view",
    "comment.create",
    "comment.edit.own",
    "comment.delete.own",
    "attachment.upload",
    "attachment.delete.own",
    "intake.create",
    "issue.create",
    "issue.edit.own",
    "issue.assign.self",
    "issue.edit.all",
    "issue.delete.own",
    "issue.assign.others",
    "intake.review",
    "cycle.manage",
    "module.manage",
    "label.manage",
    "view.create",
    "page.create",
    "state.manage",
    "project.settings",
  ],
  ti: [
    "issue.view",
    "comment.read",
    "attachment.view",
    "comment.create",
    "comment.edit.own",
    "comment.delete.own",
    "attachment.upload",
    "attachment.delete.own",
    "intake.create",
    "issue.create",
    "issue.edit.own",
    "issue.assign.self",
    "issue.edit.all",
    "issue.assign.others",
    "cycle.manage",
    "module.manage",
    "view.create",
  ],
  gestor_projeto: [
    "issue.view",
    "comment.read",
    "attachment.view",
    "comment.create",
    "comment.edit.own",
    "comment.delete.own",
    "attachment.upload",
    "attachment.delete.own",
    "intake.create",
    "issue.create",
    "issue.edit.own",
    "issue.assign.self",
    "issue.edit.all",
    "issue.delete.own",
    "issue.delete.all",
    "issue.assign.others",
    "state.unrestricted",
    "comment.delete.all",
    "attachment.delete.all",
    "intake.review",
    "cycle.manage",
    "module.manage",
    "label.manage",
    "view.create",
    "page.create",
    "member.manage",
    "state.manage",
    "project.settings",
  ],
};

const ACOES_ANTIGAS = [...BASELINE_KNOWN_ACTIONS, "state.manage", "project.settings"];

describe("ACTION_CATALOG", () => {
  it("toda ação tem chave única, rótulo, grupo e escopo", () => {
    const entradas = Object.values(ACTION_CATALOG);
    expect(new Set(entradas.map((a) => a.key)).size).toBe(entradas.length);
    for (const acao of entradas) {
      expect(acao.label.length).toBeGreaterThan(0);
      expect(acao.group.length).toBeGreaterThan(0);
      expect(["project", "workspace"]).toContain(acao.scope);
    }
  });

  it("nenhum rótulo leva travessão", () => {
    for (const acao of Object.values(ACTION_CATALOG)) expect(acao.label).not.toContain("—");
  });

  it("função padrão citada numa ação existe", () => {
    const chaves = DEFAULT_ROLES.map((r) => r.key);
    for (const acao of Object.values(ACTION_CATALOG)) {
      for (const papel of acao.roles) expect(chaves).toContain(papel);
    }
  });

  it("EProjectAction e ALL_ACTIONS saem do catálogo", () => {
    expect(ALL_ACTIONS).toEqual(Object.values(ACTION_CATALOG).map((a) => a.key));
    expect(EProjectAction.ISSUE_PRIORITY).toBe("issue.priority");
    expect(EProjectAction.CHAT_ATENDER).toBe("chat.atender");
  });

  it("isKnownAction reconhece só o que está no catálogo", () => {
    expect(isKnownAction("issue.view")).toBe(true);
    expect(isKnownAction("qualquer.coisa")).toBe(false);
  });
});

describe("DEFAULT_ROLES a partir do catálogo", () => {
  for (const key of Object.keys(ANTES)) {
    it(`${key} mantém as ações antigas que já tinha`, () => {
      const antigas = permissoesDe(key).filter((a) => ACOES_ANTIGAS.includes(a));
      expect(antigas).toEqual([...ANTES[key]].sort());
    });
  }

  it("admin recebe todas as ações, inclusive as que vierem depois", () => {
    expect(DEFAULT_ROLES.find((r) => r.key === "admin")!.permissions).toEqual(ALL_ACTIONS);
  });

  it("atende o chat quem atendia pelo papel (Atendimento para cima)", () => {
    expect(donosDe("chat.atender")).toEqual(["admin", "atendimento", "gestor_projeto", "member", "qualidade", "ti"]);
  });

  it("gerencia o chat de Membro para cima; administra só o admin", () => {
    expect(donosDe("chat.gerenciar")).toEqual(["admin", "gestor_projeto", "member"]);
    expect(donosDe("chat.administrar")).toEqual(["admin"]);
  });

  it("alterar prioridade é de Gestor e admin; os demais recebem por pessoa", () => {
    expect(donosDe("issue.priority")).toEqual(["admin", "gestor_projeto"]);
  });

  it("configuração do espaço, membros, auditoria, plugins e portal ficam só com o admin", () => {
    for (const acao of ["workspace.settings", "workspace.members", "audit.view", "plugin.manage", "portal.manage"]) {
      expect(donosDe(acao)).toEqual(["admin"]);
    }
  });

  it("o que era papel >= 15 no espaço vale para Membro, Gestor e admin", () => {
    for (const acao of ["report.view", "entity.manage", "integration.manage", "workspace.invite"]) {
      expect(donosDe(acao)).toEqual(["admin", "gestor_projeto", "member"]);
    }
  });

  it("funções e SLA de etiqueta, que eram papel >= 18, ficam com Gestor e admin", () => {
    expect(donosDe("role.manage")).toEqual(["admin", "gestor_projeto"]);
    expect(donosDe("label.sla")).toEqual(["admin", "gestor_projeto"]);
  });
});

describe("applyMemberOverrides", () => {
  it("soma o que foi concedido à pessoa", () => {
    expect(applyMemberOverrides(["issue.view"], { granted: ["issue.priority"], revoked: [] })).toEqual([
      "issue.view",
      "issue.priority",
    ]);
  });

  it("negação por pessoa vence a função e a concessão", () => {
    const efetivas = applyMemberOverrides(["issue.view", "chat.atender"], {
      granted: ["issue.priority"],
      revoked: ["chat.atender", "issue.priority"],
    });
    expect(efetivas).toEqual(["issue.view"]);
  });

  it("ignora chave que não existe no catálogo", () => {
    expect(applyMemberOverrides([], { granted: ["qualquer.coisa"], revoked: [] })).toEqual([]);
  });

  it("aceita o JSON cru do banco (nulo ou fora de formato)", () => {
    expect(applyMemberOverrides(["issue.view"], { granted: null, revoked: "x" })).toEqual(["issue.view"]);
  });
});

describe("mergeNewActions", () => {
  it("função ainda sem registro de ações conhecidas recebe as ações novas do seu padrão", () => {
    const r = mergeNewActions({ permissions: ["issue.view"], knownActions: null }, ["issue.view", "chat.atender"]);
    expect(r.permissions).toEqual(["issue.view", "chat.atender"]);
    expect(r.knownActions).toEqual(ALL_ACTIONS);
  });

  it("não devolve ação antiga que o admin tirou da função", () => {
    const r = mergeNewActions({ permissions: [], knownActions: null }, ["issue.view", "chat.atender"]);
    expect(r.permissions).toEqual(["chat.atender"]);
  });

  it("ação já conhecida não volta depois de retirada", () => {
    const r = mergeNewActions({ permissions: [], knownActions: ALL_ACTIONS }, ["chat.atender"]);
    expect(r.permissions).toEqual([]);
  });

  it("não duplica o que a função já tem", () => {
    const r = mergeNewActions({ permissions: ["chat.atender"], knownActions: null }, ["chat.atender"]);
    expect(r.permissions).toEqual(["chat.atender"]);
  });

  it("etapas e configurações do sistema chegam ao Membro já gravado", () => {
    const r = mergeNewActions({ permissions: ["issue.view"], knownActions: null }, permissoesDe("member"));
    expect(r.permissions).toContain("state.manage");
    expect(r.permissions).toContain("project.settings");
  });
});
