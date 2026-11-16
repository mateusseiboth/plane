/**
 * O motivo da recusa da solicitação: a tela pede o mesmo que o servidor
 * (`modules/solicitacao/recusa-da-solicitacao.rules.ts`) e mostra no campo o
 * erro que ele devolver. Rodar com `bun test core/components/inbox/modals`.
 */
import { describe, expect, it } from "bun:test";
import { findPendenciaDoMotivo, readErroDoMotivo } from "@/components/inbox/modals/motivo-da-recusa";

describe("findPendenciaDoMotivo", () => {
  it("vazio ou curto pede o motivo com o mínimo de caracteres", () => {
    expect(findPendenciaDoMotivo("")).toBe("Escreva o motivo da recusa com pelo menos 10 caracteres.");
    expect(findPendenciaDoMotivo("   não    ")).toBe("Escreva o motivo da recusa com pelo menos 10 caracteres.");
  });

  it("com o mínimo, nada falta", () => {
    expect(findPendenciaDoMotivo("Já existe no menu Relatórios.")).toBeUndefined();
  });
});

describe("readErroDoMotivo", () => {
  it("lê a mensagem do campo motivo; sem ela, o detalhe; sem nada, um aviso geral", () => {
    expect(readErroDoMotivo({ detail: "x", errors: [{ path: "motivo", message: "Curto." }] })).toBe("Curto.");
    expect(readErroDoMotivo({ detail: "Sua função não permite." })).toBe("Sua função não permite.");
    expect(readErroDoMotivo(undefined)).toBe("Não foi possível recusar. Tente de novo.");
  });
});
