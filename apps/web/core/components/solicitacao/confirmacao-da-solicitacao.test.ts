/**
 * Depois de abrir: o número que o atendimento copia e passa ao cliente.
 * Rodar com `bun test core/components/solicitacao`.
 */
import { describe, expect, it } from "bun:test";
import { buildConfirmacaoDaSolicitacao } from "@/components/solicitacao/confirmacao-da-solicitacao";

describe("buildConfirmacaoDaSolicitacao", () => {
  it("o número para o cliente é o anual; o do sistema vem junto", () => {
    expect(buildConfirmacaoDaSolicitacao({ ticket_number: "12-2026", label: "RECURS-7590" }, false)).toEqual({
      numeroParaOCliente: "12-2026",
      numeroNoSistema: "RECURS-7590",
      aviso: "Ela está na triagem do sistema.",
    });
  });

  it("sem número anual, o do sistema é o que se passa ao cliente", () => {
    expect(buildConfirmacaoDaSolicitacao({ ticket_number: null, label: "RECURS-7590" }, false)).toMatchObject({
      numeroParaOCliente: "RECURS-7590",
      numeroNoSistema: null,
    });
  });

  it("cliente parado avisa que a Qualidade foi chamada", () => {
    expect(buildConfirmacaoDaSolicitacao({ ticket_number: "12-2026", label: "RECURS-7590" }, true).aviso).toBe(
      "Cliente parado: a Qualidade foi avisada com prioridade urgente."
    );
  });
});
