/**
 * Quando a tela mostra Atendido / Não atendido: solicitação aceita com o
 * chamado concluído, para quem abriu, quem abre solicitações (intake.create)
 * ou quem tria. Mesma regra do servidor (atendimento-da-solicitacao.rules.ts).
 * Rodar com `bun test core/components/inbox/content`.
 */
import { describe, expect, it } from "bun:test";
import { isConfirmacaoDoAtendimento } from "@/components/inbox/content/confirmacao-do-atendimento";

const ACEITA = 1;
const nada = () => false;
const atendimento = (acao: string) => acao === "intake.create";

describe("isConfirmacaoDoAtendimento", () => {
  it("aceita e concluída, para o Atendimento: mostra", () => {
    expect(
      isConfirmacaoDoAtendimento({ status: ACEITA, grupo: "completed", isQuemAbriu: false, can: atendimento })
    ).toBe(true);
  });

  it("quem abriu vê mesmo sem a ação", () => {
    expect(isConfirmacaoDoAtendimento({ status: ACEITA, grupo: "completed", isQuemAbriu: true, can: nada })).toBe(true);
  });

  it("chamado ainda em andamento: não há o que confirmar", () => {
    expect(isConfirmacaoDoAtendimento({ status: ACEITA, grupo: "started", isQuemAbriu: true, can: atendimento })).toBe(
      false
    );
  });

  it("já atendida ou recusada: não mostra", () => {
    expect(isConfirmacaoDoAtendimento({ status: 3, grupo: "completed", isQuemAbriu: true, can: atendimento })).toBe(
      false
    );
    expect(isConfirmacaoDoAtendimento({ status: -1, grupo: "completed", isQuemAbriu: true, can: atendimento })).toBe(
      false
    );
  });

  it("sem a ação e sem ter aberto: não mostra", () => {
    expect(isConfirmacaoDoAtendimento({ status: ACEITA, grupo: "completed", isQuemAbriu: false, can: nada })).toBe(
      false
    );
  });
});
