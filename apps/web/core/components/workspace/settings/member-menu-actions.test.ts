import { describe, expect, it } from "bun:test";
import { buildMemberMenuActions } from "./member-menu-actions";

describe("buildMemberMenuActions", () => {
  it("quem tem workspace.members redefine senha, congela e remove outro membro ativo", () => {
    expect(buildMemberMenuActions({ canManageMembers: true, isCurrentUser: false, isSuspended: false })).toEqual([
      "reset-password",
      "freeze",
      "remove",
    ]);
  });

  it("membro suspenso só pode ser removido", () => {
    expect(buildMemberMenuActions({ canManageMembers: true, isCurrentUser: false, isSuspended: true })).toEqual([
      "remove",
    ]);
  });

  it("na própria linha só sai do espaço, mesmo com workspace.members", () => {
    expect(buildMemberMenuActions({ canManageMembers: true, isCurrentUser: true, isSuspended: false })).toEqual([
      "remove",
    ]);
  });

  it("sem workspace.members, a pessoa só sai do espaço pela própria linha", () => {
    expect(buildMemberMenuActions({ canManageMembers: false, isCurrentUser: true, isSuspended: false })).toEqual([
      "remove",
    ]);
  });

  it("sem workspace.members, a linha de outro membro não tem ação", () => {
    expect(buildMemberMenuActions({ canManageMembers: false, isCurrentUser: false, isSuspended: false })).toEqual([]);
  });
});
