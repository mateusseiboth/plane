/**
 * Quem vê qual conversa na lista do atendente, e quem é avisado quando uma
 * conversa troca de dono. Puro: sem banco e sem servidor.
 *
 * A regra é pela matriz de ações:
 *  - sem `chat.ver_todas`, só as conversas atribuídas a si;
 *  - com `chat.ver_todas`, as dos outros também (inclusive encerradas e as que
 *    a pessoa acabou de transferir);
 *  - a fila e o robô (`bot`, `queued`) só com `chat.ver_fila`.
 *
 * O caso que motivou a regra da transferência: o dono transferiu um atendimento
 * e continuou vendo a conversa. Ele vê as dos outros; quem não vê deixa de ver
 * na hora.
 */
import { describe, expect, it } from "bun:test";
import { buildAvisosDaTransferencia } from "@/transferencia";
import { buildFiltroDaVisibilidade, isSessaoVisivel } from "@/visibilidade";

const EU = "eu";
const FILA = ["bot", "queued"];
const ADMIN = { verTodas: true, verFila: true };
const SO_AS_PROPRIAS = { verTodas: false, verFila: false };

const transferida = { assignedAttendantId: "recebeu", status: "active" };

describe("conversa transferida", () => {
  it("quem vê as dos outros continua vendo depois de transferir", () => {
    expect(isSessaoVisivel({ userId: "transferiu", ...ADMIN }, transferida)).toBe(true);
    expect(isSessaoVisivel({ userId: "transferiu", verTodas: true, verFila: false }, transferida)).toBe(true);
  });

  it("quem só vê as próprias deixa de ver", () => {
    expect(isSessaoVisivel({ userId: "transferiu", ...SO_AS_PROPRIAS }, transferida)).toBe(false);
  });

  it("quem recebeu passa a ver", () => {
    expect(isSessaoVisivel({ userId: "recebeu", ...SO_AS_PROPRIAS }, transferida)).toBe(true);
  });
});

describe("fila e robô", () => {
  it("sem chat.ver_fila nunca aparecem, mesmo atribuídas à pessoa ou com chat.ver_todas", () => {
    const acesso = { userId: "u", verTodas: true, verFila: false };
    expect(isSessaoVisivel(acesso, { assignedAttendantId: "u", status: "queued" })).toBe(false);
    expect(isSessaoVisivel(acesso, { assignedAttendantId: "u", status: "bot" })).toBe(false);
  });

  it("com chat.ver_fila aparecem, mesmo sem dono", () => {
    const acesso = { userId: "u", verTodas: false, verFila: true };
    expect(isSessaoVisivel(acesso, { assignedAttendantId: null, status: "queued" })).toBe(true);
    expect(isSessaoVisivel(acesso, { assignedAttendantId: "outro", status: "active" })).toBe(false);
  });
});

describe("filtro da consulta", () => {
  it("só as próprias: atribuídas a si, fora da fila", () => {
    expect(buildFiltroDaVisibilidade({ userId: EU, ...SO_AS_PROPRIAS }, null)).toEqual({
      OR: [{ status: { notIn: FILA }, assignedAttendantId: EU }],
    });
    expect(buildFiltroDaVisibilidade({ userId: EU, ...SO_AS_PROPRIAS }, ["queued", "active"])).toEqual({
      OR: [{ status: { in: ["active"] }, assignedAttendantId: EU }],
    });
  });

  it("com ver todas: as de qualquer atendente, ainda fora da fila", () => {
    expect(buildFiltroDaVisibilidade({ userId: EU, verTodas: true, verFila: false }, null)).toEqual({
      OR: [{ status: { notIn: FILA } }],
    });
  });

  it("com ver a fila: as próprias e as que esperam atendente ou estão com o robô", () => {
    expect(buildFiltroDaVisibilidade({ userId: EU, verTodas: false, verFila: true }, null)).toEqual({
      OR: [{ status: { notIn: FILA }, assignedAttendantId: EU }, { status: { in: FILA } }],
    });
  });

  it("com as duas e uma aba pedida: cada lado fica com os status que lhe cabem", () => {
    expect(buildFiltroDaVisibilidade({ userId: EU, ...ADMIN }, ["queued", "closed"])).toEqual({
      OR: [{ status: { in: ["closed"] } }, { status: { in: ["queued"] } }],
    });
  });

  it("pedir a aba da fila sem a ação não traz nada", () => {
    expect(buildFiltroDaVisibilidade({ userId: EU, verTodas: true, verFila: false }, ["queued", "bot"])).toEqual({
      OR: [{ status: { in: [] } }],
    });
  });
});

describe("avisos da transferência", () => {
  const base = { sessionId: "s1", clientName: "Maria", paraUserId: "recebeu" };

  it("quem recebe é avisado; quem atendia e quem transferiu tiram a conversa da lista", () => {
    expect(buildAvisosDaTransferencia({ ...base, anteriorUserId: "atendia", porUserId: "gestor" })).toEqual([
      {
        userId: "recebeu",
        payload: { type: "session.transferred", session_id: "s1", to_user_id: "recebeu", client_name: "Maria" },
      },
      { userId: "atendia", payload: { type: "session.transferred_out", session_id: "s1", to_user_id: "recebeu" } },
      { userId: "gestor", payload: { type: "session.transferred_out", session_id: "s1", to_user_id: "recebeu" } },
    ]);
  });

  it("quem transferiu a própria conversa recebe um aviso só", () => {
    const avisos = buildAvisosDaTransferencia({ ...base, anteriorUserId: "gestor", porUserId: "gestor" });
    expect(avisos.map((a) => a.userId)).toEqual(["recebeu", "gestor"]);
  });

  it("conversa sem dono e transferência feita por quem recebe não geram aviso de saída", () => {
    const avisos = buildAvisosDaTransferencia({ ...base, anteriorUserId: null, porUserId: "recebeu" });
    expect(avisos.map((a) => a.userId)).toEqual(["recebeu"]);
  });
});
