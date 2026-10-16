/**
 * Quem aceita ou recusa uma solicitação na triagem é quem tem a ação
 * `intake.review` na matriz de permissões, não só o administrador do sistema:
 * Qualidade tria por padrão, e o botão da tela tem de obedecer ao mesmo corte
 * que o servidor.
 */
import { describe, expect, it } from "bun:test";
import { isTriagemPermitida, STATUS_QUE_AGUARDAM_TRIAGEM } from "./triagem-permitida";

const can = (permitidas: string[]) => (acao: string) => permitidas.includes(acao);

describe("isTriagemPermitida", () => {
  it("permite com intake.review enquanto a solicitação aguarda triagem", () => {
    for (const status of STATUS_QUE_AGUARDAM_TRIAGEM) {
      expect(isTriagemPermitida({ can: can(["intake.review"]), status })).toBe(true);
    }
  });

  it("nega sem a ação, mesmo para quem abre pedidos", () => {
    expect(isTriagemPermitida({ can: can(["intake.create"]), status: -2 })).toBe(false);
  });

  it("nega quando a solicitação já foi aceita, recusada ou duplicada", () => {
    for (const status of [-1, 1, 2, 3]) {
      expect(isTriagemPermitida({ can: can(["intake.review"]), status })).toBe(false);
    }
  });

  it("nega enquanto o status não chegou", () => {
    expect(isTriagemPermitida({ can: can(["intake.review"]), status: undefined })).toBe(false);
  });
});
