/**
 * Funções puras da trilha de auditoria (LGPD).
 * Elas decidem o que vai parar no registro — errar aqui significa gravar dado
 * pessoal demais (violação) ou de menos (trilha inútil).
 */

import { describe, expect, test } from "bun:test";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, auditDiff, clientIp, serializeAuditLog } from "@utils/audit";

describe("clientIp", () => {
  test("usa o primeiro endereço de x-forwarded-for (atrás do proxy)", () => {
    expect(clientIp({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" })).toBe("203.0.113.7");
  });

  test("cai para x-real-ip quando não há forwarded-for", () => {
    expect(clientIp({ "x-real-ip": "198.51.100.4" })).toBe("198.51.100.4");
  });

  test("devolve null quando não há cabeçalho de origem", () => {
    expect(clientIp({})).toBeNull();
    expect(clientIp(undefined)).toBeNull();
  });

  test("aceita um objeto Headers do padrão web", () => {
    const headers = new Headers({ "x-forwarded-for": "192.0.2.10" });
    expect(clientIp(headers)).toBe("192.0.2.10");
  });

  test("ignora forwarded-for vazio em vez de devolver string vazia", () => {
    expect(clientIp({ "x-forwarded-for": "  " })).toBeNull();
  });
});

describe("auditDiff", () => {
  test("registra apenas os campos que mudaram, com de/para", () => {
    const diff = auditDiff(
      { state: "Triagem", name: "Erro no relatório", priority: "low" },
      { state: "Em Desenvolvimento", name: "Erro no relatório", priority: "high" },
      ["state", "name", "priority"]
    );
    expect(Object.keys(diff).sort()).toEqual(["priority", "state"]);
    expect(diff.state).toEqual({ de: "Triagem", para: "Em Desenvolvimento" });
    expect(diff.name).toBeUndefined();
  });

  test("datas iguais não contam como mudança", () => {
    const at = new Date("2026-01-10T12:00:00Z");
    const diff = auditDiff({ targetDate: at }, { targetDate: new Date(at.getTime()) }, ["targetDate"]);
    expect(diff).toEqual({});
  });

  test("trunca valores longos para não copiar conteúdo inteiro para a trilha", () => {
    const longo = "x".repeat(900);
    const diff = auditDiff({ name: "curto" }, { name: longo }, ["name"]) as any;
    expect(String(diff.name.para).length).toBeLessThanOrEqual(501);
    expect(String(diff.name.para).endsWith("…")).toBe(true);
  });

  test("campo que não existe em nenhum dos lados é ignorado", () => {
    expect(auditDiff({}, {}, ["inexistente"])).toEqual({});
  });
});

describe("serializeAuditLog", () => {
  test("expõe o registro em snake_case, como o resto da API", () => {
    const out = serializeAuditLog({
      id: "log-1",
      workspaceId: "ws-1",
      actorId: "user-1",
      actorEmail: "fulano@empresa.com",
      actorIp: "203.0.113.7",
      entity: AUDIT_ENTITIES.ISSUE,
      entityId: "issue-1",
      action: AUDIT_ACTIONS.VIEW,
      changes: { a: 1 },
      metadata: { origem: "web" },
      createdAt: new Date("2026-02-01T10:00:00Z"),
    });
    expect(out.workspace_id).toBe("ws-1");
    expect(out.actor_email).toBe("fulano@empresa.com");
    expect(out.actor_ip).toBe("203.0.113.7");
    expect(out.entity_id).toBe("issue-1");
    expect(out.action).toBe("view");
    expect(out.metadata).toEqual({ origem: "web" });
  });

  test("campos ausentes viram null/objeto vazio em vez de undefined", () => {
    const out = serializeAuditLog({ id: "x", workspaceId: "w", entity: "issue", entityId: "i", action: "view" });
    expect(out.actor_id).toBeNull();
    expect(out.actor_ip).toBeNull();
    expect(out.changes).toEqual({});
    expect(out.metadata).toEqual({});
  });
});

describe("vocabulário", () => {
  test("as ações exigidas pela LGPD estão previstas", () => {
    for (const acao of ["view", "create", "update", "delete", "print", "export", "close", "login", "logout"]) {
      expect(Object.values(AUDIT_ACTIONS)).toContain(acao);
    }
  });

  test("as entidades que carregam dado pessoal estão previstas", () => {
    for (const entidade of ["issue", "intake", "comment", "member", "user", "chat_session"]) {
      expect(Object.values(AUDIT_ENTITIES)).toContain(entidade);
    }
  });
});
