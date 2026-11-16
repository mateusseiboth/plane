/**
 * O aviso dentro da tela quando chega notificação: antes ela só ia para o
 * sistema operacional, que pede permissão e HTTPS, e a Qualidade não via o
 * cliente parado. Rodar com `bun test core/components/workspace-notifications`.
 */
import { describe, expect, it } from "bun:test";
import { buildAvisoNaTela } from "@/components/workspace-notifications/aviso-na-tela";

describe("buildAvisoNaTela", () => {
  it("cliente parado vem como alerta", () => {
    expect(
      buildAvisoNaTela({
        title: "Cliente parado: nova solicitação",
        message_html: "Folha não fecha",
        data: { urgente: true },
      })
    ).toEqual({ tipo: "alerta", titulo: "Cliente parado: nova solicitação", mensagem: "Folha não fecha" });
  });

  it("o resto vem como informação, com título padrão quando faltar", () => {
    expect(buildAvisoNaTela({ title: "", message_html: "Relatório", data: {} })).toEqual({
      tipo: "informacao",
      titulo: "Novidade no chamado",
      mensagem: "Relatório",
    });
  });
});
