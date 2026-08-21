/**
 * O que o cliente lê na coluna "situação".
 *
 * Ele não conhece triagem, duplicidade nem grupo de estado — conhece "o que
 * aconteceu com o meu pedido". Recusada e duplicada não são estado do chamado:
 * são desfecho da triagem, e é por isso que vêm antes de olhar o estado.
 */
import { describe, expect, it } from "bun:test";
import { situacaoDaSolicitacao } from "@modules/portal/situacao";

const emAnalise = { name: "Em Análise", group: "started", color: "#f59e0b", isTriage: false };
const triagem = { name: "Triagem", group: "triage", color: "#94a3b8", isTriage: true };

describe("situacaoDaSolicitacao", () => {
  it("mostra o estado do chamado quando a triagem já aceitou", () => {
    const situacao = situacaoDaSolicitacao({ intakeStatus: 1, estado: emAnalise });
    expect(situacao.rotulo).toBe("Em Análise");
    expect(situacao.grupo).toBe("started");
  });

  it("diz 'Em triagem' enquanto ninguém decidiu", () => {
    expect(situacaoDaSolicitacao({ intakeStatus: -2, estado: triagem }).rotulo).toBe("Em triagem");
    expect(situacaoDaSolicitacao({ intakeStatus: 0, estado: triagem }).rotulo).toBe("Em triagem");
  });

  it("diz 'Em triagem' também quando o chamado ainda não tem estado", () => {
    expect(situacaoDaSolicitacao({ intakeStatus: -2, estado: null }).rotulo).toBe("Em triagem");
  });

  it("chama de recusada o que a triagem recusou", () => {
    const situacao = situacaoDaSolicitacao({ intakeStatus: -1, estado: emAnalise });
    expect(situacao.rotulo).toBe("Recusada");
    expect(situacao.grupo).toBe("cancelled");
  });

  it("chama de duplicada o que a triagem marcou como repetido", () => {
    expect(situacaoDaSolicitacao({ intakeStatus: 2, estado: emAnalise }).rotulo).toBe("Duplicada");
  });
});
