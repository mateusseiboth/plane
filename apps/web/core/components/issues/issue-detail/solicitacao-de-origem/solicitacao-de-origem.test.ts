import { describe, expect, it } from "bun:test";
import {
  ROTULO_DA_ORIGEM,
  getAvisoDoTextoOriginal,
  getRotuloDaPrioridade,
  hasSolicitacaoDeOrigem,
} from "@/components/issues/issue-detail/solicitacao-de-origem/solicitacao-de-origem.rules";

describe("solicitação de origem", () => {
  it("só há linha de solicitação quando o chamado nasceu de uma", () => {
    expect(hasSolicitacaoDeOrigem({ solicitacao: null })).toBe(false);
    expect(hasSolicitacaoDeOrigem({})).toBe(false);
    expect(hasSolicitacaoDeOrigem({ solicitacao: { is_texto_atual: true } as never })).toBe(true);
  });

  it("avisa quando o texto mostrado é o atual, sem versão anterior", () => {
    expect(getAvisoDoTextoOriginal({ is_texto_atual: true })).toBe("Sem edições anteriores. Este é o texto atual.");
    expect(getAvisoDoTextoOriginal({ is_texto_atual: false })).toBeNull();
  });

  it("cada origem tem rótulo, sem travessão", () => {
    expect(ROTULO_DA_ORIGEM).toEqual({ chat: "Chat", portal: "Portal do cliente", app: "Aplicativo" });
    for (const rotulo of Object.values(ROTULO_DA_ORIGEM)) expect(rotulo).not.toContain("—");
  });

  it("traduz a prioridade pedida", () => {
    expect(getRotuloDaPrioridade("urgent")).toBe("Urgente");
    expect(getRotuloDaPrioridade("none")).toBe("Sem prioridade");
  });
});
