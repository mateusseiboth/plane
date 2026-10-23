/**
 * Número do menu Solicitação/Triagem: solicitações que a pessoa abriu, já
 * resolvidas e ainda não marcadas como atendidas (`GET .../global-intake-issues/resumo/`).
 * Rodar com `bun test core/components/inbox/global`.
 */
import { describe, expect, it } from "bun:test";
import { isEventoDoResumoDaTriagem, readResolvidasParaAtender } from "./resumo-da-triagem";

describe("readResolvidasParaAtender", () => {
  it("lê o número que a API devolve", () => {
    expect(readResolvidasParaAtender({ resolvidas_para_atender: 3 })).toBe(3);
  });

  it("sem resposta ainda, é zero (o menu não mostra o número)", () => {
    expect(readResolvidasParaAtender(undefined)).toBe(0);
  });
});

describe("isEventoDoResumoDaTriagem", () => {
  it("mudança de solicitação ou de chamado recalcula (concluir o chamado resolve o pedido)", () => {
    expect(isEventoDoResumoDaTriagem({ entity: "intake", action: "update" })).toBe(true);
    expect(isEventoDoResumoDaTriagem({ entity: "issue", action: "update" })).toBe(true);
  });

  it("comentário, mural e afins não mexem no número", () => {
    expect(isEventoDoResumoDaTriagem({ entity: "comment", action: "create" })).toBe(false);
    expect(isEventoDoResumoDaTriagem({ entity: "mural", action: "create" })).toBe(false);
  });
});
