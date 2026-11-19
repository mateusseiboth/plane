/**
 * "Comentar e movimentar": a Qualidade não sabia como mandar o chamado para o
 * desenvolvimento (só arrastando aparecia "comente antes de mover"). O botão ao
 * lado de Comentário grava o comentário e, só se ele entrou, muda a etapa.
 * Rodar com `bun test core/components/comments/movimentacao`.
 */
import { describe, expect, it, mock } from "bun:test";
import { sendComentarioEMovimentacao } from "@/components/comments/movimentacao/comentar-e-movimentar";

const mover = async () => {
  throw new Error("Sua função não permite esta transição de etapa.");
};

describe("sendComentarioEMovimentacao", () => {
  it("comenta primeiro e depois move para a etapa escolhida", async () => {
    const ordem: string[] = [];
    const comentar = mock(async () => {
      ordem.push("comentar");
      return true;
    });
    const moverParaEtapa = mock(async (etapa: string) => {
      ordem.push(`mover:${etapa}`);
    });
    expect(await sendComentarioEMovimentacao({ comentar, mover: moverParaEtapa }, "dev")).toBe(true);
    expect(ordem).toEqual(["comentar", "mover:dev"]);
  });

  it("comentário que não entrou (painel da IA, erro) não move o chamado", async () => {
    const naoMover = mock(async () => undefined);
    expect(await sendComentarioEMovimentacao({ comentar: async () => false, mover: naoMover }, "dev")).toBe(false);
    expect(naoMover).not.toHaveBeenCalled();
  });

  it("recusa da mudança de etapa devolve falso, com o comentário já gravado", async () => {
    const comentar = mock(async () => true);
    expect(await sendComentarioEMovimentacao({ comentar, mover }, "dev")).toBe(false);
    expect(comentar).toHaveBeenCalledTimes(1);
  });
});
