/**
 * Cabeçalho da lista "Atendimentos": as ações de gestão ficam num menu para o
 * cabeçalho caber na barra lateral, e cada uma aparece pela sua ação do chat
 * (gerenciador: `chat.ver_todas`; dashboard: `chat.relatorios`; configurações:
 * `chat.configurar` ou `chat.frases_do_espaco`). Rodar com
 * `bun test core/components/chat/cabecalho-da-lista`.
 */
import { describe, expect, it } from "bun:test";
import { findAcoesDoMenu } from "@/components/chat/cabecalho-da-lista";

const NENHUMA = { canVerTodas: false, canVerRelatorios: false, hasConfiguracao: false };

describe("findAcoesDoMenu", () => {
  it("com as três ações: gerenciador, dashboard e configurações, nessa ordem", () => {
    expect(findAcoesDoMenu({ canVerTodas: true, canVerRelatorios: true, hasConfiguracao: true })).toEqual([
      "gerenciador",
      "dashboard",
      "configuracoes",
    ]);
  });

  it("sem nenhuma, não tem menu", () => {
    expect(findAcoesDoMenu(NENHUMA)).toEqual([]);
  });

  it("cada item segue a sua ação", () => {
    expect(findAcoesDoMenu({ ...NENHUMA, canVerTodas: true })).toEqual(["gerenciador"]);
    expect(findAcoesDoMenu({ ...NENHUMA, canVerRelatorios: true })).toEqual(["dashboard"]);
    expect(findAcoesDoMenu({ ...NENHUMA, hasConfiguracao: true })).toEqual(["configuracoes"]);
  });
});
