/**
 * Decisões de tela sobre o chamado que juntam mais de uma ação da matriz.
 * Puro: recebe o `can` de `useMyWorkspaceActions`. Rodar com `bun test core/lib/permissoes`.
 */
import { describe, expect, it } from "bun:test";
import { isIntakeOnlyOperator, isIssueDeleteAllowed, isIssueEditAllowed } from "./regras-de-chamado";

const can = (permitidas: string[]) => (acao: string) => permitidas.includes(acao);

describe("isIssueEditAllowed", () => {
  it("edita quem edita qualquer chamado ou os próprios", () => {
    expect(isIssueEditAllowed(can(["issue.edit.all"]))).toBe(true);
    expect(isIssueEditAllowed(can(["issue.edit.own"]))).toBe(true);
  });

  it("nega a quem só abre pedidos", () => {
    expect(isIssueEditAllowed(can(["intake.create", "comment.create"]))).toBe(false);
  });
});

describe("isIssueDeleteAllowed", () => {
  it("exclui qualquer chamado com issue.delete.all", () => {
    expect(isIssueDeleteAllowed(can(["issue.delete.all"]), false)).toBe(true);
  });

  it("exclui o próprio só com issue.delete.own", () => {
    expect(isIssueDeleteAllowed(can(["issue.delete.own"]), true)).toBe(true);
    expect(isIssueDeleteAllowed(can(["issue.delete.own"]), false)).toBe(false);
    expect(isIssueDeleteAllowed(can([]), true)).toBe(false);
  });
});

describe("isIntakeOnlyOperator", () => {
  it("é quem abre pedido e não cria chamado", () => {
    expect(isIntakeOnlyOperator(can(["intake.create"]))).toBe(true);
    expect(isIntakeOnlyOperator(can(["intake.create", "issue.create"]))).toBe(false);
    expect(isIntakeOnlyOperator(can([]))).toBe(false);
  });
});
