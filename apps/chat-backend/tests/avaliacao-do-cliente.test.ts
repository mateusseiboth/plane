/**
 * A avaliação do cliente: quando pedir e quem pode ler.
 *
 * Dois defeitos vistos em produção:
 *
 *  - Encerrar uma conversa em que NINGUÉM atendeu abria a pesquisa de
 *    satisfação. Quem só abriu o chat e desistiu era convidado a dar nota a um
 *    atendimento que não houve.
 *  - A nota e o comentário apareciam para o próprio atendente avaliado. A
 *    pesquisa é instrumento de gestão: quem lê é quem tem `chat.ver_avaliacao`
 *    (por padrão, só o administrador).
 */
import { describe, expect, it } from "bun:test";
import { isRespostaDaAvaliacao } from "@/rating";
import { applyVisaoDaAvaliacao, hasAtendimento, withoutAvaliacao, serializeSession } from "@/sessoes";

type ConversaDoBanco = {
  id: string;
  protocol: string;
  channel: string;
  workspaceId: string;
  status: string;
  createdAt: Date;
  assignedAttendantId: string | null;
  ratingScore: number | null;
  ratingComment: string | null;
  ratingState: string | null;
};

const conversa = (extra: Partial<ConversaDoBanco> = {}): ConversaDoBanco => ({
  id: "s1",
  protocol: "2026000123",
  channel: "native",
  workspaceId: "quality",
  status: "closed",
  createdAt: new Date("2026-08-21T12:00:00Z"),
  assignedAttendantId: null,
  ratingScore: 5,
  ratingComment: "Atendimento excelente",
  ratingState: "done",
  ...extra,
});

describe("hasAtendimento", () => {
  it("é falso enquanto ninguém assumiu a conversa", () => {
    expect(hasAtendimento(conversa({ assignedAttendantId: null }))).toBe(false);
  });

  it("é verdadeiro quando um atendente assumiu", () => {
    expect(hasAtendimento(conversa({ assignedAttendantId: "u-1" }))).toBe(true);
  });
});

describe("withoutAvaliacao", () => {
  it("apaga nota e comentário", () => {
    const vista = withoutAvaliacao(serializeSession(conversa({ assignedAttendantId: "u-1" })));
    expect(vista.rating_score).toBeNull();
    expect(vista.rating_comment).toBeNull();
  });

  it("não mexe em mais nada da conversa", () => {
    const completa = serializeSession(conversa({ assignedAttendantId: "u-1" }));
    const vista = withoutAvaliacao(completa);
    expect(vista.protocol).toBe(completa.protocol);
    expect(vista.status).toBe(completa.status);
    expect(vista.assigned_attendant_id).toBe(completa.assigned_attendant_id);
  });
});

describe("serializeSession", () => {
  it("entrega a avaliação para quem tem direito de ver", () => {
    const completa = serializeSession(conversa({ assignedAttendantId: "u-1" }));
    expect(completa.rating_score).toBe(5);
    expect(completa.rating_comment).toBe("Atendimento excelente");
  });
});

describe("applyVisaoDaAvaliacao", () => {
  it("com chat.ver_avaliacao, a conversa sai com a nota e o comentário", () => {
    const vista = applyVisaoDaAvaliacao(serializeSession(conversa()), true);
    expect(vista).toMatchObject({ rating_score: 5, rating_comment: "Atendimento excelente" });
  });

  it("sem a ação, sai sem os dois", () => {
    const vista = applyVisaoDaAvaliacao(serializeSession(conversa()), false);
    expect(vista).toMatchObject({ rating_score: null, rating_comment: null });
  });
});

const encerrada = (ratingState: string | null) => ({ status: "closed", ratingState });

describe("isRespostaDaAvaliacao (WhatsApp)", () => {
  // A resposta à pesquisa vai para a nota, que só sai com `chat.ver_avaliacao`.
  // Gravada como mensagem do cliente, aparecia para o atendente avaliado.

  it("a nota de 1 a 5 enquanto a pesquisa espera a nota", () => {
    expect(isRespostaDaAvaliacao(encerrada("awaiting_score"), "5, adorei")).toBe(true);
  });

  it("qualquer texto enquanto a pesquisa espera o comentário", () => {
    expect(isRespostaDaAvaliacao(encerrada("awaiting_comment"), "Demorou demais")).toBe(true);
  });

  it("texto sem nota não é resposta: continua na conversa", () => {
    expect(isRespostaDaAvaliacao(encerrada("awaiting_score"), "obrigado")).toBe(false);
  });

  it("fora da pesquisa nada é resposta", () => {
    expect(isRespostaDaAvaliacao(encerrada("done"), "5")).toBe(false);
    expect(isRespostaDaAvaliacao(encerrada(null), "5")).toBe(false);
    expect(isRespostaDaAvaliacao({ status: "active", ratingState: "awaiting_score" }, "5")).toBe(false);
  });
});
