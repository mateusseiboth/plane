/**
 * Quem edita o conteúdo de uma solicitação da triagem: quem tria
 * (`intake.review`) edita qualquer uma; quem abriu a solicitação edita a sua,
 * desde que ainda abra pedidos (`intake.create`), o mesmo corte do PATCH da
 * solicitação no api-ts.
 */
import { describe, expect, it } from "bun:test";
import { isIntakeEditAllowed } from "./edicao-de-solicitacao";

const can = (permitidas: string[]) => (acao: string) => permitidas.includes(acao);

describe("isIntakeEditAllowed", () => {
  it("permite a quem tria, mesmo sem ter aberto a solicitação", () => {
    expect(isIntakeEditAllowed({ can: can(["intake.review"]), isOwner: false })).toBe(true);
  });

  it("permite a quem abriu e abre pedidos", () => {
    expect(isIntakeEditAllowed({ can: can(["intake.create"]), isOwner: true })).toBe(true);
  });

  it("nega a quem abre pedidos mas não abriu esta", () => {
    expect(isIntakeEditAllowed({ can: can(["intake.create"]), isOwner: false })).toBe(false);
  });

  it("nega a quem abriu mas perdeu as ações de triagem", () => {
    expect(isIntakeEditAllowed({ can: can(["issue.view"]), isOwner: true })).toBe(false);
  });
});
