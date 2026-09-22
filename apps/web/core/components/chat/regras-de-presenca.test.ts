/**
 * Regras da presença do atendente, sem navegador.
 *
 * A conexão em si depende de WebSocket, ticket e temporizador. O que decide
 * QUANDO conectar, QUANTO esperar para tentar de novo e SE o aviso aparece é
 * decisão pura, e é isso que este arquivo tranca.
 */
import { describe, expect, it } from "bun:test";
import {
  RECONEXAO,
  avisoDoEvento,
  delayDaReconexao,
  isTelaDoChat,
  shouldConnectPresenca,
} from "@/components/chat/regras-de-presenca";

describe("shouldConnectPresenca", () => {
  const base = { slug: "quality", chatHabilitado: true, podeAtender: true };

  it("conecta quem pode atender num espaço com o chat ligado", () => {
    expect(shouldConnectPresenca(base)).toBe(true);
  });

  it("não conecta antes de saber em qual espaço a pessoa está", () => {
    expect(shouldConnectPresenca({ ...base, slug: undefined })).toBe(false);
    expect(shouldConnectPresenca({ ...base, slug: "" })).toBe(false);
  });

  it("não conecta quando o chat está desligado no espaço", () => {
    expect(shouldConnectPresenca({ ...base, chatHabilitado: false })).toBe(false);
  });

  it("não conecta quem não atende: ficaria online sem poder responder", () => {
    expect(shouldConnectPresenca({ ...base, podeAtender: false })).toBe(false);
  });
});

describe("delayDaReconexao", () => {
  it("a primeira tentativa espera o mínimo", () => {
    expect(delayDaReconexao(1)).toBe(RECONEXAO.inicialMs);
  });

  it("dobra a cada tentativa", () => {
    expect(delayDaReconexao(2)).toBe(RECONEXAO.inicialMs * 2);
    expect(delayDaReconexao(3)).toBe(RECONEXAO.inicialMs * 4);
    expect(delayDaReconexao(4)).toBe(RECONEXAO.inicialMs * 8);
  });

  it("para de crescer no teto: o servidor voltando, ninguém espera minutos", () => {
    expect(delayDaReconexao(20)).toBe(RECONEXAO.tetoMs);
    expect(delayDaReconexao(200)).toBe(RECONEXAO.tetoMs);
  });

  it("trata tentativa zero ou negativa como a primeira", () => {
    expect(delayDaReconexao(0)).toBe(RECONEXAO.inicialMs);
    expect(delayDaReconexao(-3)).toBe(RECONEXAO.inicialMs);
  });
});

describe("isTelaDoChat", () => {
  it("reconhece a tela do atendente do espaço", () => {
    expect(isTelaDoChat("/quality/chat/", "quality")).toBe(true);
    expect(isTelaDoChat("/quality/chat", "quality")).toBe(true);
  });

  it("a transcrição somente leitura não é a tela do atendente", () => {
    expect(isTelaDoChat("/quality/chat-view/20260922-0001", "quality")).toBe(false);
  });

  it("o chat de outro espaço não conta", () => {
    expect(isTelaDoChat("/outra/chat/", "quality")).toBe(false);
  });

  it("qualquer outra tela não é o chat", () => {
    expect(isTelaDoChat("/quality/projects/", "quality")).toBe(false);
    expect(isTelaDoChat(null, "quality")).toBe(false);
  });
});

describe("avisoDoEvento", () => {
  const fora = { naTelaDoChat: false };

  it("avisa quando um atendimento é atribuído à pessoa", () => {
    const aviso = avisoDoEvento({ type: "session.assigned", session_id: "s1", client_name: "Joana" }, fora);
    expect(aviso?.titulo).toBe("Novo atendimento de Joana.");
    expect(aviso?.corpo).toBe("Abra o chat para responder.");
  });

  it("avisa quando um atendimento é transferido para a pessoa", () => {
    const aviso = avisoDoEvento({ type: "session.transferred", session_id: "s1", client_name: "Joana" }, fora);
    expect(aviso?.titulo).toBe("Atendimento de Joana transferido para você.");
  });

  it("avisa a mensagem nova do cliente e mostra o começo dela", () => {
    const aviso = avisoDoEvento(
      { type: "session.client_message", session_id: "s1", client_name: "Joana", preview: "Bom dia" },
      fora
    );
    expect(aviso?.titulo).toBe("Nova mensagem de Joana.");
    expect(aviso?.corpo).toBe("Bom dia");
  });

  it("sem nome, chama de Visitante", () => {
    const aviso = avisoDoEvento({ type: "session.assigned", session_id: "s1" }, fora);
    expect(aviso?.titulo).toBe("Novo atendimento de Visitante.");
  });

  it("não avisa quem já está na tela do chat: a tela mesma cuida disso", () => {
    expect(avisoDoEvento({ type: "session.assigned", session_id: "s1" }, { naTelaDoChat: true })).toBeNull();
  });

  it("evento sem aviso próprio não vira toast", () => {
    for (const type of ["ping", "presence", "session.activity", "message.new", "ready"]) {
      expect(avisoDoEvento({ type, session_id: "s1" }, fora)).toBeNull();
    }
  });

  it("a chave separa um aviso do outro, para não empilhar o mesmo três vezes", () => {
    const um = avisoDoEvento({ type: "session.assigned", session_id: "s1" }, fora);
    const outro = avisoDoEvento({ type: "session.assigned", session_id: "s2" }, fora);
    expect(um?.chave).not.toBe(outro?.chave);
    expect(um?.chave).toBe("session.assigned:s1");
  });

  it("nenhum texto de aviso leva travessão", () => {
    const eventos = ["session.assigned", "session.transferred", "session.client_message"];
    for (const type of eventos) {
      const aviso = avisoDoEvento({ type, session_id: "s1", client_name: "Joana", preview: "Oi" }, fora);
      expect(`${aviso?.titulo} ${aviso?.corpo}`).not.toContain("—");
    }
  });
});
