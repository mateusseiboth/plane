/**
 * Encaminhar para a triagem / Encerrar no atendimento: só na solicitação que
 * está com o Atendimento (status -3), para quem abre solicitações ou tria.
 * Mesma regra do servidor (modules/solicitacao/no-atendimento.rules.ts).
 * Rodar com `bun test core/components/inbox/content`.
 */
import { describe, expect, it } from "bun:test";
import { isDecisaoNoAtendimento, STATUS_NO_ATENDIMENTO } from "@/components/inbox/content/decisao-no-atendimento";

describe("isDecisaoNoAtendimento", () => {
  it("no atendimento, para o Atendimento: mostra", () => {
    expect(isDecisaoNoAtendimento({ status: STATUS_NO_ATENDIMENTO, can: (a) => a === "intake.create" })).toBe(true);
  });

  it("quem tria também decide", () => {
    expect(isDecisaoNoAtendimento({ status: STATUS_NO_ATENDIMENTO, can: (a) => a === "intake.review" })).toBe(true);
  });

  it("já na triagem ou sem a ação: não mostra", () => {
    expect(isDecisaoNoAtendimento({ status: -2, can: () => true })).toBe(false);
    expect(isDecisaoNoAtendimento({ status: STATUS_NO_ATENDIMENTO, can: () => false })).toBe(false);
  });
});
