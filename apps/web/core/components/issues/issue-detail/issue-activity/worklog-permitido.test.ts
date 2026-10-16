/**
 * O botão de registrar horas na atividade do chamado segue a matriz de ações:
 * quem edita qualquer chamado registra em todos; quem edita os próprios
 * registra nos chamados em que está atribuído. Solicitação da triagem não tem
 * registro de horas.
 */
import { describe, expect, it } from "bun:test";
import { isWorklogAllowed } from "./worklog-permitido";

const can = (permitidas: string[]) => (acao: string) => permitidas.includes(acao);

describe("isWorklogAllowed", () => {
  it("permite com issue.edit.all mesmo sem estar atribuído", () => {
    expect(isWorklogAllowed({ can: can(["issue.edit.all"]), isAssigned: false, isIntakeIssue: false })).toBe(true);
  });

  it("permite ao atribuído que edita os próprios chamados", () => {
    expect(isWorklogAllowed({ can: can(["issue.edit.own"]), isAssigned: true, isIntakeIssue: false })).toBe(true);
  });

  it("nega a quem edita os próprios mas não está atribuído", () => {
    expect(isWorklogAllowed({ can: can(["issue.edit.own"]), isAssigned: false, isIntakeIssue: false })).toBe(false);
  });

  it("nega ao atribuído sem nenhuma ação de edição", () => {
    expect(isWorklogAllowed({ can: can(["issue.view"]), isAssigned: true, isIntakeIssue: false })).toBe(false);
  });

  it("nega em solicitação da triagem", () => {
    expect(isWorklogAllowed({ can: can(["issue.edit.all"]), isAssigned: true, isIntakeIssue: true })).toBe(false);
  });
});
