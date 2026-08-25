/**
 * Serializadores compartilhados — convertem o camelCase do Prisma no snake_case
 * que o frontend consome. Campo faltando aqui vira `undefined` na UI.
 */
import {describe, expect, it} from "bun:test";
import {
  dateOnly,
  isoDate,
  serializeComment,
  serializeIssue,
  serializeLabel,
  serializeModule,
  serializeState,
  serializeTimeLog,
} from "@utils/serialize";

describe("isoDate / dateOnly", () => {
  it("converte Date para ISO e para data pura", () => {
    const d = new Date("2026-03-04T15:30:00.000Z");
    expect(isoDate(d)).toBe("2026-03-04T15:30:00.000Z");
    expect(dateOnly(d)).toBe("2026-03-04");
  });

  it("devolve null para valores vazios", () => {
    expect(isoDate(null)).toBeNull();
    expect(isoDate(undefined)).toBeNull();
    expect(isoDate("")).toBeNull();
    expect(dateOnly(null)).toBeNull();
  });

  it("repassa strings já formatadas", () => {
    expect(isoDate("2026-03-04T00:00:00Z")).toBe("2026-03-04T00:00:00Z");
    expect(dateOnly("2026-03-04T00:00:00Z")).toBe("2026-03-04");
  });
});

describe("serializeIssue", () => {
  const raw = {
    id: "i1",
    sequenceId: 42,
    name: "Corrigir login",
    sortOrder: 100,
    stateId: "s1",
    priority: "urgent",
    labels: [{labelId: "l1"}, {labelId: "l2"}],
    assignees: [{assigneeId: "u1"}],
    projectId: "p1",
    workspaceId: "w1",
    parentId: "i0",
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    updatedAt: new Date("2026-01-03T03:04:05.000Z"),
    startDate: new Date("2026-01-05T00:00:00.000Z"),
    targetDate: new Date("2026-01-09T00:00:00.000Z"),
    completedAt: null,
    archivedAt: null,
    createdById: "u9",
    updatedById: "u8",
    isDraft: false,
    descriptionHtml: "<p>oi</p>",
    descriptionStripped: "oi",
    descriptionJson: {type: "doc"},
    state: {group: "started", color: "#fff", name: "Em Análise"},
    entityId: "e1",
    entity: {id: "e1", name: "Prefeitura", entityType: "cliente"},
    legacyTicketNumber: "12345",
  };

  it("mapeia todos os campos para snake_case", () => {
    const out = serializeIssue(raw) as any;
    expect(out.sequence_id).toBe(42);
    expect(out.label_ids).toEqual(["l1", "l2"]);
    expect(out.assignee_ids).toEqual(["u1"]);
    expect(out.state__group).toBe("started");
    expect(out.state__name).toBe("Em Análise");
    expect(out.start_date).toBe("2026-01-05");
    // O vencimento sai com hora — é o que distingue "vence dia 9" de "vence
    // dia 9 às 14h". O início continua data pura.
    expect(out.target_date).toBe("2026-01-09T00:00:00.000Z");
    expect(out.created_at).toBe("2026-01-02T03:04:05.000Z");
    expect(out.entity).toEqual({id: "e1", name: "Prefeitura", entity_type: "cliente"});
    expect(out.legacy_ticket_number).toBe("12345");
  });

  it("aplica defaults quando os vínculos não vêm no include", () => {
    const out = serializeIssue({id: "i2"}) as any;
    expect(out.sequence_id).toBe(0);
    expect(out.sort_order).toBe(65535);
    expect(out.priority).toBe("none");
    expect(out.label_ids).toEqual([]);
    expect(out.assignee_ids).toEqual([]);
    expect(out.description_html).toBe("<p></p>");
    expect(out.description_stripped).toBe("");
    expect(out.state__group).toBeNull();
    expect(out.entity).toBeNull();
    expect(out.is_draft).toBe(false);
    expect(out.is_epic).toBe(false);
  });
});

describe("serializeComment", () => {
  it("monta actor_detail a partir do include do autor", () => {
    const out = serializeComment({
      id: "c1",
      workspaceId: "w1",
      projectId: "p1",
      issueId: "i1",
      actorId: "u1",
      actor: {
        id: "u1",
        displayName: "Ana",
        firstName: "Ana",
        lastName: "Silva",
        email: "ana@x.com",
        avatar: "",
        avatarUrl: null,
      },
      createdAt: new Date("2026-02-02T00:00:00.000Z"),
      commentHtml: "<p>ok</p>",
      commentStripped: "ok",
      access: "EXTERNAL",
      parentId: "c0",
    }) as any;
    expect(out.actor_detail.display_name).toBe("Ana");
    expect(out.actor_detail.email).toBe("ana@x.com");
    expect(out.access).toBe("EXTERNAL");
    expect(out.parent).toBe("c0");
    expect(out.comment_reactions).toEqual([]);
  });

  it("devolve actor_detail nulo quando o autor não foi incluído", () => {
    const out = serializeComment({id: "c2"}) as any;
    expect(out.actor_detail).toBeNull();
    expect(out.comment_html).toBe("<p></p>");
    expect(out.access).toBe("INTERNAL");
  });
});

describe("serializeState / serializeLabel", () => {
  it("expõe `order` como espelho de `sequence`", () => {
    const out = serializeState({
      id: "s1",
      name: "A Fazer",
      color: "#64748b",
      group: "unstarted",
      sequence: 15000,
      default: false,
      slug: "a-fazer",
      projectId: "p1",
      workspaceId: "w1",
    }) as any;
    expect(out.order).toBe(15000);
    expect(out.description).toBe("");
  });

  it("normaliza os opcionais do label", () => {
    const out = serializeLabel({id: "l1", name: "Correção", projectId: "p1", workspaceId: "w1"}) as any;
    expect(out.color).toBe("");
    expect(out.parent).toBeNull();
    expect(out.sla_hours).toBeNull();
    expect(out.sort_order).toBe(65535);
  });

  it("preserva sla_hours quando definido", () => {
    const out = serializeLabel({id: "l1", name: "Correção", slaHours: 16, parentId: "l0", sortOrder: 1}) as any;
    expect(out.sla_hours).toBe(16);
    expect(out.parent).toBe("l0");
    expect(out.sort_order).toBe(1);
  });
});

describe("serializeModule", () => {
  it("usa _count.moduleIssues como total_issues e mapeia membros/links", () => {
    const out = serializeModule({
      id: "m1",
      name: "Sprint 1",
      workspaceId: "w1",
      projectId: "p1",
      leadId: "u1",
      members: [{memberId: "u1"}, {memberId: "u2"}],
      links: [{id: "ml1", url: "https://x", title: "doc", createdAt: new Date("2026-01-01T00:00:00.000Z")}],
      _count: {moduleIssues: 7},
      completedIssues: 3,
    }) as any;
    expect(out.total_issues).toBe(7);
    expect(out.completed_issues).toBe(3);
    expect(out.member_ids).toEqual(["u1", "u2"]);
    expect(out.link_module[0].url).toBe("https://x");
    expect(out.status).toBe("backlog");
  });

  it("aplica zeros/defaults quando o módulo vem sem agregações", () => {
    const out = serializeModule({id: "m2", name: "Vazio"}) as any;
    expect(out.total_issues).toBe(0);
    expect(out.member_ids).toEqual([]);
    expect(out.link_module).toEqual([]);
    expect(out.sort_order).toBe(65535);
    expect(out.view_props).toEqual({filters: {}});
  });
});

describe("serializeTimeLog", () => {
  const bruto = {
    id: "tl1",
    issueId: "i1",
    projectId: "p1",
    workspaceId: "w1",
    memberId: "u1",
    member: {id: "u1", displayName: "mateus"},
    loggedDate: new Date("2026-08-25T00:00:00.000Z"),
    durationMinutes: 90,
    description: "Alguma coisa com certeza",
    isApproved: false,
    approvedById: null,
    createdAt: new Date("2026-08-25T12:00:00.000Z"),
    updatedAt: new Date("2026-08-25T12:00:00.000Z"),
    createdById: "u1",
  };

  it("expõe duração e data no snake_case que a tela lê", () => {
    const out = serializeTimeLog(bruto) as any;
    // O defeito original: a tela lia duration_minutes/logged_date e recebia
    // undefined, virando "NaNh NaNm · Invalid Date".
    expect(out.duration_minutes).toBe(90);
    expect(out.logged_date).toBe("2026-08-25");
    expect(out.description).toBe("Alguma coisa com certeza");
    expect(out.member_id).toBe("u1");
    expect(out.member_detail).toEqual({id: "u1", display_name: "mateus"});
    expect(out.issue_id).toBe("i1");
    expect(out.is_approved).toBe(false);
    expect(out.created_at).toBe("2026-08-25T12:00:00.000Z");
  });

  it("não devolve nenhuma chave em camelCase", () => {
    const out = serializeTimeLog(bruto) as any;
    expect(out.durationMinutes).toBeUndefined();
    expect(out.loggedDate).toBeUndefined();
  });

  it("aceita registro sem membro carregado e sem descrição", () => {
    const out = serializeTimeLog({id: "tl2", durationMinutes: 0, loggedDate: null}) as any;
    expect(out.member_detail).toBeNull();
    expect(out.description).toBeNull();
    expect(out.duration_minutes).toBe(0);
    expect(out.logged_date).toBeNull();
  });
});
