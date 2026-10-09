/**
 * Quais botões e abas do atendimento aparecem, pelo conjunto de ações que a
 * pessoa tem na matriz (as mesmas que o chat-backend confere em cada rota).
 * Regra pura: a tela só esconde; quem barra é o servidor.
 */
import { describe, expect, it } from "bun:test";
import {
  ACAO_DO_CHAT,
  buildAbasDaConfiguracao,
  buildPermissoesDoAtendimento,
} from "@/components/chat/permissoes-do-atendimento";

const withAcoes =
  (...acoes: string[]) =>
  (acao: string) =>
    acoes.includes(acao);

describe("buildPermissoesDoAtendimento", () => {
  it("sem nenhuma ação, nenhum botão de gestão nem do ciclo da conversa", () => {
    expect(buildPermissoesDoAtendimento(withAcoes())).toEqual({
      canTransferir: false,
      canPausar: false,
      canEncerrar: false,
      canAbrirChamado: false,
      canVerTodas: false,
      canVerFila: false,
      canVerRelatorios: false,
      canVerAvaliacao: false,
      hasConfiguracao: false,
    });
  });

  it("cada botão segue a sua ação", () => {
    const casos: Array<[string, keyof ReturnType<typeof buildPermissoesDoAtendimento>]> = [
      [ACAO_DO_CHAT.TRANSFERIR, "canTransferir"],
      [ACAO_DO_CHAT.PAUSAR, "canPausar"],
      [ACAO_DO_CHAT.ENCERRAR, "canEncerrar"],
      [ACAO_DO_CHAT.ABRIR_CHAMADO, "canAbrirChamado"],
      [ACAO_DO_CHAT.VER_TODAS, "canVerTodas"],
      [ACAO_DO_CHAT.VER_FILA, "canVerFila"],
      [ACAO_DO_CHAT.RELATORIOS, "canVerRelatorios"],
      [ACAO_DO_CHAT.CONFIGURAR, "canVerAvaliacao"],
    ];
    for (const [acao, botao] of casos) {
      const permissoes = buildPermissoesDoAtendimento(withAcoes(acao));
      expect(permissoes[botao]).toBe(true);
      const ligados = Object.entries(permissoes)
        .filter(([, ligado]) => ligado)
        .map(([nome]) => nome);
      expect(ligados.filter((nome) => nome !== "hasConfiguracao")).toEqual([botao]);
    }
  });

  it("a engrenagem aparece para quem configura ou para quem edita as frases do espaço", () => {
    expect(buildPermissoesDoAtendimento(withAcoes(ACAO_DO_CHAT.CONFIGURAR)).hasConfiguracao).toBe(true);
    expect(buildPermissoesDoAtendimento(withAcoes(ACAO_DO_CHAT.FRASES_DO_ESPACO)).hasConfiguracao).toBe(true);
    expect(buildPermissoesDoAtendimento(withAcoes(ACAO_DO_CHAT.ATENDER)).hasConfiguracao).toBe(false);
  });
});

describe("buildAbasDaConfiguracao", () => {
  const chaves = (can: (acao: string) => boolean) => buildAbasDaConfiguracao(can).map((a) => a.key);

  it("quem configura vê todas as abas, menos as frases se não as edita", () => {
    expect(chaves(withAcoes(ACAO_DO_CHAT.CONFIGURAR))).toEqual([
      "messages",
      "menu",
      "queues",
      "flows",
      "schedules",
      "encerramento",
      "attendants",
      "provider",
      "telefonia",
    ]);
  });

  it("quem só edita as frases do espaço vê só a aba de frases", () => {
    expect(chaves(withAcoes(ACAO_DO_CHAT.FRASES_DO_ESPACO))).toEqual(["frases"]);
  });

  it("com as duas, as frases entram depois de encerramento, como antes", () => {
    expect(chaves(withAcoes(ACAO_DO_CHAT.CONFIGURAR, ACAO_DO_CHAT.FRASES_DO_ESPACO))).toEqual([
      "messages",
      "menu",
      "queues",
      "flows",
      "schedules",
      "encerramento",
      "frases",
      "attendants",
      "provider",
      "telefonia",
    ]);
  });
});
