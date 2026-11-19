/**
 * Comentário que ainda está sendo processado (análise da IA + gravação): quem
 * fecha o chamado nesse meio tempo perdia o texto. O registro diz, por chamado,
 * se há comentário em andamento, para o peek e a página avisarem antes de sair.
 * Rodar com `bun test core/store/issue/issue-details`.
 */
import { describe, expect, it } from "bun:test";
import { ComentariosEmProcessamento } from "@/store/issue/issue-details/comentarios-em-processamento";

describe("ComentariosEmProcessamento", () => {
  it("marca o chamado enquanto o comentário é processado", () => {
    const registro = new ComentariosEmProcessamento();
    registro.start("c1");
    expect(registro.isProcessando("c1")).toBe(true);
    expect(registro.isProcessando("c2")).toBe(false);
    registro.end("c1");
    expect(registro.isProcessando("c1")).toBe(false);
  });

  it("dois envios no mesmo chamado: só libera quando os dois terminam", () => {
    const registro = new ComentariosEmProcessamento();
    registro.start("c1");
    registro.start("c1");
    registro.end("c1");
    expect(registro.isProcessando("c1")).toBe(true);
    registro.end("c1");
    expect(registro.isProcessando("c1")).toBe(false);
  });

  it("terminar o que não começou não deixa contagem negativa", () => {
    const registro = new ComentariosEmProcessamento();
    registro.end("c1");
    registro.start("c1");
    expect(registro.isProcessando("c1")).toBe(true);
  });

  it("diz se há algum comentário em processamento", () => {
    const registro = new ComentariosEmProcessamento();
    expect(registro.hasAlgumProcessando).toBe(false);
    registro.start("c1");
    expect(registro.hasAlgumProcessando).toBe(true);
  });
});
