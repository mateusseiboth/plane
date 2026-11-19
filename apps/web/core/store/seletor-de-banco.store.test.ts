/**
 * Seletor do "/banco": um por editor, e o contador global diz ao peek que há um
 * seletor na tela (o clique nele não pode fechar o chamado).
 * Rodar com `bun test core/store/seletor-de-banco.store.test.ts`.
 */
import { describe, expect, it, mock } from "bun:test";
import { SeletorDeBanco, seletoresDeBancoAbertos } from "@/store/seletor-de-banco.store";

const BANCO = { envio: "1", nome: "a.zip", entidade: null, sistema: null, recebidoEm: null };

describe("SeletorDeBanco", () => {
  it("abrir conta um seletor na tela; escolher entrega o banco e fecha", () => {
    const seletor = new SeletorDeBanco();
    const aoEscolher = mock(() => undefined);
    seletor.open(aoEscolher);
    expect(seletoresDeBancoAbertos.hasAlgum).toBe(true);
    seletor.choose(BANCO);
    expect(aoEscolher).toHaveBeenCalledWith(BANCO);
    expect(seletor.isOpen).toBe(false);
    expect(seletoresDeBancoAbertos.hasAlgum).toBe(false);
  });

  it("abrir duas vezes o mesmo seletor não conta dobrado", () => {
    const seletor = new SeletorDeBanco();
    seletor.open(() => undefined);
    seletor.open(() => undefined);
    seletor.close();
    expect(seletoresDeBancoAbertos.hasAlgum).toBe(false);
  });

  it("fechar o que não abriu não deixa contagem negativa", () => {
    const seletor = new SeletorDeBanco();
    seletor.close();
    new SeletorDeBanco().open(() => undefined);
    expect(seletoresDeBancoAbertos.hasAlgum).toBe(true);
  });
});
