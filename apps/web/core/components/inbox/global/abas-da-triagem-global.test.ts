/**
 * Abas das Solicitações globais. "Concluído" é a solicitação cujo chamado já
 * terminou, e é a aba que abre com a tela (pedido do dono do produto).
 */
import { describe, expect, it } from "bun:test";
import {
  ABAS_DA_TRIAGEM_GLOBAL,
  ABA_PADRAO_DA_TRIAGEM_GLOBAL,
  readAbaDaSolicitacao,
  readAbaDaTriagemDoSistema,
} from "@/components/inbox/global/abas-da-triagem-global";

describe("abas da triagem global", () => {
  it("a tela abre em Concluído", () => {
    expect(ABA_PADRAO_DA_TRIAGEM_GLOBAL).toBe("concluido");
  });

  it("tem as cinco abas de antes e mais Concluído", () => {
    expect(ABAS_DA_TRIAGEM_GLOBAL.map((aba) => aba.rotulo)).toEqual([
      "Pendente",
      "Recusado",
      "Adiado",
      "Aceito",
      "Concluído",
      "Duplicado",
    ]);
  });

  it("a aba padrão existe na lista", () => {
    expect(ABAS_DA_TRIAGEM_GLOBAL.some((aba) => aba.chave === ABA_PADRAO_DA_TRIAGEM_GLOBAL)).toBe(true);
  });
});

describe("readAbaDaSolicitacao", () => {
  it("usa a situação que a API devolve", () => {
    expect(readAbaDaSolicitacao({ situacao: "concluido", status: 1 })?.rotulo).toBe("Concluído");
    expect(readAbaDaSolicitacao({ situacao: "1", status: 1 })?.rotulo).toBe("Aceito");
  });

  it("sem situação, cai no status", () => {
    expect(readAbaDaSolicitacao({ status: -2 })?.rotulo).toBe("Pendente");
  });

  it("situação desconhecida não tem aba", () => {
    expect(readAbaDaSolicitacao({ status: 9 })).toBeUndefined();
  });
});

describe("readAbaDaTriagemDoSistema", () => {
  it("atendida, recusada e duplicada abrem na aba Fechadas da triagem do sistema", () => {
    for (const status of [3, -1, 2]) expect(readAbaDaTriagemDoSistema(status)).toBe("closed");
  });

  it("pendente, adiada e aceita abrem na aba Abertas", () => {
    for (const status of [-2, 0, 1]) expect(readAbaDaTriagemDoSistema(status)).toBe("open");
  });
});
