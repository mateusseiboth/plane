/**
 * A avaliação do cliente: quando pedir e quem pode ler.
 *
 * Dois defeitos vistos em produção:
 *
 *  - Encerrar uma conversa em que NINGUÉM atendeu abria a pesquisa de
 *    satisfação. Quem só abriu o chat e desistiu era convidado a dar nota a um
 *    atendimento que não houve.
 *  - A nota e o comentário apareciam para o próprio atendente avaliado. A
 *    pesquisa é instrumento de gestão: quem lê é o administrador.
 */
import { describe, expect, it } from "bun:test";
import { houveAtendimento, semAvaliacao, serializeSession } from "@/sessoes";

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

describe("houveAtendimento", () => {
  it("é falso enquanto ninguém assumiu a conversa", () => {
    expect(houveAtendimento(conversa({ assignedAttendantId: null }))).toBe(false);
  });

  it("é verdadeiro quando um atendente assumiu", () => {
    expect(houveAtendimento(conversa({ assignedAttendantId: "u-1" }))).toBe(true);
  });
});

describe("semAvaliacao", () => {
  it("apaga nota e comentário", () => {
    const vista = semAvaliacao(serializeSession(conversa({ assignedAttendantId: "u-1" })));
    expect(vista.rating_score).toBeNull();
    expect(vista.rating_comment).toBeNull();
  });

  it("não mexe em mais nada da conversa", () => {
    const completa = serializeSession(conversa({ assignedAttendantId: "u-1" }));
    const vista = semAvaliacao(completa);
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
