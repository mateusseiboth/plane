/**
 * Depois de abrir: o número que o atendimento copia e passa ao cliente.
 * Rodar com `bun test core/components/solicitacao`.
 */
import { describe, expect, it } from "bun:test";
import { buildConfirmacaoDaSolicitacao } from "@/components/solicitacao/confirmacao-da-solicitacao";

describe("buildConfirmacaoDaSolicitacao", () => {
  it("o número para o cliente é o anual; o do sistema vem junto", () => {
    expect(
      buildConfirmacaoDaSolicitacao(
        { ticket_number: "12-2026", label: "RECURS-7590", project_name: "Recursos Humanos" },
        false
      )
    ).toEqual({
      numeroParaOCliente: "12-2026",
      numeroNoSistema: "Recursos Humanos · RECURS-7590",
      aviso: "Ela está na triagem do sistema.",
    });
  });

  it("sem número anual, o do sistema é o que se passa ao cliente", () => {
    expect(buildConfirmacaoDaSolicitacao({ ticket_number: null, label: "RECURS-7590" }, false)).toMatchObject({
      numeroParaOCliente: "RECURS-7590",
      numeroNoSistema: null,
    });
  });

  it("cliente parado avisa que o Setor de Qualidade foi comunicado", () => {
    expect(buildConfirmacaoDaSolicitacao({ ticket_number: "12-2026", label: "RECURS-7590" }, true).aviso).toBe(
      "Cliente parado. O Setor de Qualidade foi comunicado sobre a situação, com prioridade urgente."
    );
  });
});
