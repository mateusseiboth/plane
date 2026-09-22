/**
 * O aviso que alcança o atendente FORA da tela do chat.
 *
 * `message.new` só chega a quem está com a conversa aberta. Desde que o sistema
 * mantém a presença do atendente aberta o tempo todo, a fila entrega conversa a
 * quem está em outra tela, e essa pessoa não recebia nada: ficava online, com
 * cliente escrevendo, e sem nenhum sinal. Este aviso é endereçado ao atendente
 * da conversa, e é o que a outra tela escuta.
 */
import { describe, expect, it } from "bun:test";
import { avisoDeMensagemDoCliente, nomeDoCliente, resumoDaMensagem } from "@/aviso-do-atendente";

const sessao = {
  id: "s1",
  assignedAttendantId: "u1",
  clientName: "Joana",
  clientPhone: "5567999990000",
  protocol: "20260922-0001",
};

describe("nomeDoCliente", () => {
  it("usa o nome quando existe", () => {
    expect(nomeDoCliente(sessao)).toBe("Joana");
  });

  it("cai no telefone de quem entrou pelo WhatsApp sem nome", () => {
    expect(nomeDoCliente({ ...sessao, clientName: null })).toBe("5567999990000");
  });

  it("sem nome e sem telefone, chama de Visitante", () => {
    expect(nomeDoCliente({ ...sessao, clientName: null, clientPhone: null })).toBe("Visitante");
  });
});

describe("resumoDaMensagem", () => {
  it("texto aparece como foi escrito", () => {
    expect(resumoDaMensagem({ type: "text", text: "Bom dia" })).toBe("Bom dia");
  });

  it("anexo vira um rótulo do tipo", () => {
    expect(resumoDaMensagem({ type: "image", text: null })).toBe("📷 Imagem");
    expect(resumoDaMensagem({ type: "audio", text: null })).toBe("🎤 Áudio");
    expect(resumoDaMensagem({ type: "video", text: null })).toBe("🎬 Vídeo");
    expect(resumoDaMensagem({ type: "file", text: null })).toBe("📎 Arquivo");
  });

  it("tipo desconhecido e texto vazio ainda dizem alguma coisa", () => {
    expect(resumoDaMensagem({ type: "outro", text: null })).toBe("Nova mensagem");
    expect(resumoDaMensagem({ type: "text", text: "" })).toBe("Nova mensagem");
  });
});

describe("avisoDeMensagemDoCliente", () => {
  it("endereça o aviso ao atendente da conversa", () => {
    const aviso = avisoDeMensagemDoCliente(sessao, { sender: "client", type: "text", text: "Bom dia" });
    expect(aviso).toEqual({
      userId: "u1",
      payload: {
        type: "session.client_message",
        session_id: "s1",
        client_name: "Joana",
        preview: "Bom dia",
      },
    });
  });

  it("conversa ainda sem atendente não avisa ninguém", () => {
    expect(
      avisoDeMensagemDoCliente({ ...sessao, assignedAttendantId: null }, { sender: "client", type: "text", text: "Oi" })
    ).toBeNull();
  });

  it("só a mensagem do cliente vira aviso", () => {
    for (const sender of ["attendant", "bot", "system"]) {
      expect(avisoDeMensagemDoCliente(sessao, { sender, type: "text", text: "Oi" })).toBeNull();
    }
  });

  it("nenhum texto do aviso leva travessão", () => {
    const aviso = avisoDeMensagemDoCliente(sessao, { sender: "client", type: "file", text: null });
    expect(aviso?.payload.preview).not.toContain("—");
  });
});
