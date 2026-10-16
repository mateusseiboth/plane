import { describe, expect, it } from "bun:test";
import { isProjectMemberRemovable, isProjectRoleEditable } from "./project-role-editable";

describe("isProjectRoleEditable", () => {
  it("quem tem member.manage troca a função de outro membro do sistema", () => {
    expect(isProjectRoleEditable({ canManageMembers: true, isCurrentUser: false, isRowWorkspaceAdmin: false })).toBe(
      true
    );
  });

  it("sem member.manage, nenhuma linha é editável", () => {
    expect(isProjectRoleEditable({ canManageMembers: false, isCurrentUser: false, isRowWorkspaceAdmin: false })).toBe(
      false
    );
  });

  it("ninguém troca a própria função no sistema", () => {
    expect(isProjectRoleEditable({ canManageMembers: true, isCurrentUser: true, isRowWorkspaceAdmin: false })).toBe(
      false
    );
  });

  it("admin do espaço é admin em todo sistema: a linha dele não muda", () => {
    expect(isProjectRoleEditable({ canManageMembers: true, isCurrentUser: false, isRowWorkspaceAdmin: true })).toBe(
      false
    );
  });
});

describe("isProjectMemberRemovable", () => {
  it("quem tem member.manage remove outro membro", () => {
    expect(isProjectMemberRemovable({ canManageMembers: true, isCurrentUser: false })).toBe(true);
  });

  it("qualquer membro sai do sistema pela própria linha", () => {
    expect(isProjectMemberRemovable({ canManageMembers: false, isCurrentUser: true })).toBe(true);
  });

  it("sem member.manage, a linha de outro membro não tem ação", () => {
    expect(isProjectMemberRemovable({ canManageMembers: false, isCurrentUser: false })).toBe(false);
  });
});
