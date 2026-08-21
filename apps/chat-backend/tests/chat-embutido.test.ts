/**
 * A página do chat embutido (`/client`).
 *
 * Duas decisões que moram no HTML servido:
 *
 *  - O cliente NÃO escolhe atendente. Escolher trazia conversa parada na caixa
 *    de quem estava ocupado (ou fora do horário) enquanto o resto da equipe
 *    estava livre. Toda conversa entra na fila e a distribuição por peso decide.
 *  - A pesquisa de satisfação só aparece quando o SERVIDOR a pede
 *    (`rating.request`). A página mostrava o formulário em todo encerramento,
 *    inclusive no de quem nunca foi atendido.
 */
import { describe, expect, it } from "bun:test";
import { clientPage } from "@/client-page";

const html = clientPage();
const contem = (trecho: string) => html.includes(trecho);

describe("pré-chat", () => {
  it("não tem seletor de atendente", () => {
    expect(contem("pc-att-list")).toBe(false);
    expect(contem("Qualquer atendente disponível")).toBe(false);
  });

  it("não consulta a lista pública de atendentes", () => {
    expect(contem("public/attendants")).toBe(false);
  });

  it("não manda atendente escolhido ao abrir a conversa", () => {
    expect(contem("attendant_id:")).toBe(false); // o campo do corpo do POST
    expect(contem("pcAttendant")).toBe(false);
  });

  it("continua perguntando nome e sistema", () => {
    expect(contem('id="pc-name"')).toBe(true);
    expect(contem('id="pc-project"')).toBe(true);
  });
});

describe("encerramento", () => {
  it("abre a pesquisa quando o servidor a pede", () => {
    expect(contem("rating.request")).toBe(true);
  });

  it("não abre a pesquisa por conta própria ao encerrar", () => {
    expect(contem("showEnded()")).toBe(false);
  });
});
