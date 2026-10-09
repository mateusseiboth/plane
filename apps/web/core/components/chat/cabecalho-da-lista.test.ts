/**
 * Cabeçalho da lista "Atendimentos": as ações de gestor ficam num menu para o
 * cabeçalho caber na barra lateral. Rodar com `bun test core/components/chat/cabecalho-da-lista`.
 */
import { describe, expect, it } from "bun:test";
import { findAcoesDoMenu } from "@/components/chat/cabecalho-da-lista";

describe("findAcoesDoMenu", () => {
  it("gestor vê gerenciador, dashboard e configurações, nessa ordem", () => {
    expect(findAcoesDoMenu(true)).toEqual(["gerenciador", "dashboard", "configuracoes"]);
  });

  it("atendente sem papel de gestor não tem menu", () => {
    expect(findAcoesDoMenu(false)).toEqual([]);
  });
});
