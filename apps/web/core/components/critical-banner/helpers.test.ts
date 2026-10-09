/**
 * Faixa de chamados urgentes: qual evento do barramento SSE obriga a faixa a
 * buscar a lista de novo. Rodar com `bun test core/components/critical-banner`.
 */
import { describe, expect, it } from "bun:test";
import { isEventoDaFaixaDeUrgentes } from "@/components/critical-banner/helpers";

const naFaixa = ["urgente-1"];

describe("isEventoDaFaixaDeUrgentes", () => {
  it("chamado da faixa que deixou de ser urgente some na hora", () => {
    expect(
      isEventoDaFaixaDeUrgentes({ entity: "issue", action: "update", id: "urgente-1", priority: "low" }, naFaixa)
    ).toBe(true);
  });

  it("chamado que virou urgente aparece na hora", () => {
    expect(
      isEventoDaFaixaDeUrgentes({ entity: "issue", action: "update", id: "outro", priority: "urgent" }, naFaixa)
    ).toBe(true);
  });

  it("chamado criado urgente aparece na hora", () => {
    expect(
      isEventoDaFaixaDeUrgentes({ entity: "issue", action: "create", id: "novo", priority: "urgent" }, naFaixa)
    ).toBe(true);
  });

  it("chamado da faixa concluído ou apagado sai da faixa", () => {
    expect(
      isEventoDaFaixaDeUrgentes({ entity: "issue", action: "update", id: "urgente-1", priority: "urgent" }, naFaixa)
    ).toBe(true);
    expect(isEventoDaFaixaDeUrgentes({ entity: "issue", action: "delete", id: "urgente-1" }, naFaixa)).toBe(true);
  });

  it("chamado fora da faixa e sem urgência não muda nada", () => {
    expect(
      isEventoDaFaixaDeUrgentes({ entity: "issue", action: "update", id: "outro", priority: "high" }, naFaixa)
    ).toBe(false);
    expect(
      isEventoDaFaixaDeUrgentes({ entity: "issue", action: "create", id: "novo", priority: "none" }, naFaixa)
    ).toBe(false);
    expect(
      isEventoDaFaixaDeUrgentes({ entity: "issue", action: "delete", id: "outro", priority: "low" }, naFaixa)
    ).toBe(false);
  });

  it("evento de chamado sem prioridade revalida, porque não dá para saber", () => {
    expect(isEventoDaFaixaDeUrgentes({ entity: "issue", action: "update", id: "outro" }, naFaixa)).toBe(true);
    expect(isEventoDaFaixaDeUrgentes({ entity: "issue", action: "update", id: "outro", priority: null }, naFaixa)).toBe(
      true
    );
  });

  it("evento que não é de chamado não mexe na faixa", () => {
    expect(
      isEventoDaFaixaDeUrgentes({ entity: "comment", action: "create", id: "c1", issue_id: "urgente-1" }, naFaixa)
    ).toBe(false);
    expect(isEventoDaFaixaDeUrgentes({ entity: "mural", action: "update" }, naFaixa)).toBe(false);
  });
});
