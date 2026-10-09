/**
 * Cabeçalho da conversa aberta: quais ações a conversa oferece (pelo estado e
 * pelas ações do chat na matriz) e quais ficam à vista ou vão para o menu "Mais"
 * conforme a largura do cabeçalho. Em 1366 px os botões passavam por cima do
 * nome do cliente. Rodar com `bun test core/components/chat/atendente/acoes-do-cabecalho`.
 */
import { describe, expect, it } from "bun:test";
import {
  LARGURA_COM_ROTULO,
  LARGURA_COMPLETA,
  findAcoesDaConversa,
  splitAcoesPorLargura,
} from "@/components/chat/atendente/acoes-do-cabecalho";

const TODAS = { canAbrirChamado: true, canPausar: true, canTransferir: true, canEncerrar: true };
const NENHUMA = { canAbrirChamado: false, canPausar: false, canTransferir: false, canEncerrar: false };

const withSessao = (status: string, extra: { channel?: string; issue_label?: string | null } = {}) => ({
  status,
  channel: extra.channel ?? "whatsapp",
  issue_label: extra.issue_label ?? null,
});

describe("findAcoesDaConversa", () => {
  it("conversa na fila: assumir, link, chamado e transferir", () => {
    expect(findAcoesDaConversa(withSessao("queued"), TODAS)).toEqual(["assumir", "link", "chamado", "transferir"]);
  });

  it("conversa ativa: tudo menos assumir, na ordem da tela", () => {
    expect(findAcoesDaConversa(withSessao("active"), TODAS)).toEqual([
      "link",
      "chamado",
      "pausar",
      "alerta",
      "transferir",
      "encerrar",
    ]);
  });

  it("conversa em pausa: retomar sem o alerta de cliente sem resposta", () => {
    expect(findAcoesDaConversa(withSessao("paused"), TODAS)).toEqual([
      "link",
      "chamado",
      "pausar",
      "transferir",
      "encerrar",
    ]);
  });

  it("sem as ações do chat só sobram o link e o alerta", () => {
    expect(findAcoesDaConversa(withSessao("active"), NENHUMA)).toEqual(["link", "alerta"]);
  });

  it("chamado já aberto aparece mesmo sem poder abrir outro", () => {
    expect(findAcoesDaConversa(withSessao("active", { issue_label: "SUP-12" }), NENHUMA)).toEqual([
      "link",
      "chamado",
      "alerta",
    ]);
  });

  it("ligação tem o próprio painel: só link e transferir no cabeçalho", () => {
    expect(findAcoesDaConversa(withSessao("active", { channel: "phone" }), TODAS)).toEqual(["link", "transferir"]);
  });

  it("conversa encerrada: link e chamado, sem transferir nem encerrar", () => {
    expect(findAcoesDaConversa(withSessao("closed"), TODAS)).toEqual(["link", "chamado"]);
  });

  it("conversa com o robô pode ser assumida e não pode ser transferida", () => {
    expect(findAcoesDaConversa(withSessao("bot"), TODAS)).toEqual(["assumir", "link", "chamado"]);
  });
});

describe("splitAcoesPorLargura", () => {
  const ATIVA = ["link", "chamado", "pausar", "alerta", "transferir", "encerrar"] as const;

  it("cabeçalho largo mostra todas as ações com rótulo e não tem menu", () => {
    expect(splitAcoesPorLargura(ATIVA, LARGURA_COMPLETA)).toEqual({
      visiveis: [...ATIVA],
      noMenu: [],
      isOnlyIcone: false,
    });
  });

  it("cabeçalho médio deixa as principais à vista e manda as outras para o menu", () => {
    expect(splitAcoesPorLargura(ATIVA, LARGURA_COMPLETA - 1)).toEqual({
      visiveis: ["chamado", "encerrar"],
      noMenu: ["link", "pausar", "alerta", "transferir"],
      isOnlyIcone: false,
    });
  });

  it("cabeçalho estreito mostra as principais só com ícone", () => {
    expect(splitAcoesPorLargura(ATIVA, LARGURA_COM_ROTULO - 1)).toEqual({
      visiveis: ["chamado", "encerrar"],
      noMenu: ["link", "pausar", "alerta", "transferir"],
      isOnlyIcone: true,
    });
  });

  it("assumir é principal: fica à vista na conversa da fila", () => {
    expect(splitAcoesPorLargura(["assumir", "link", "chamado", "transferir"], LARGURA_COM_ROTULO).visiveis).toEqual([
      "assumir",
      "chamado",
    ]);
  });

  it("antes de medir (largura 0) já cabe, só com ícones", () => {
    expect(splitAcoesPorLargura(["link"], 0)).toEqual({ visiveis: [], noMenu: ["link"], isOnlyIcone: true });
  });
});
