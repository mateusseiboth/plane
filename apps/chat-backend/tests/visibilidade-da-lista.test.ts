/**
 * Quem vê qual conversa na lista do atendente, e quem é avisado quando uma
 * conversa troca de dono. Puro: sem banco e sem servidor.
 *
 * O caso que motivou: o dono transferiu um atendimento e continuou vendo a
 * conversa. Ele tem `chat.administrar`, e quem administra vê todas. Quem não
 * administra vê só as próprias, então a transferida sai da lista dele na hora.
 */
import { describe, expect, it } from "bun:test";
import { buildAvisosDaTransferencia } from "@/transferencia";
import { ESCOPO_DA_LISTA, buildFiltroDaVisibilidade, isSessaoVisivel, readEscopoDaLista } from "@/visibilidade";

const transferida = { assignedAttendantId: "recebeu", status: "active" };

describe("escopo da lista pela ação", () => {
  it("quem administra vê todas; os demais, as próprias", () => {
    expect(readEscopoDaLista(true)).toBe(ESCOPO_DA_LISTA.TODAS);
    expect(readEscopoDaLista(false)).toBe(ESCOPO_DA_LISTA.MINHAS);
  });
});

describe("conversa transferida", () => {
  it("quem administra continua vendo depois de transferir", () => {
    expect(isSessaoVisivel(ESCOPO_DA_LISTA.TODAS, transferida, "transferiu")).toBe(true);
  });

  it("quem não administra deixa de ver", () => {
    expect(isSessaoVisivel(ESCOPO_DA_LISTA.MINHAS, transferida, "transferiu")).toBe(false);
  });

  it("quem recebeu passa a ver", () => {
    expect(isSessaoVisivel(ESCOPO_DA_LISTA.MINHAS, transferida, "recebeu")).toBe(true);
  });

  it("robô e fila nunca aparecem para quem não administra, mesmo atribuídas a ele", () => {
    expect(isSessaoVisivel(ESCOPO_DA_LISTA.MINHAS, { assignedAttendantId: "u", status: "queued" }, "u")).toBe(false);
    expect(isSessaoVisivel(ESCOPO_DA_LISTA.MINHAS, { assignedAttendantId: "u", status: "bot" }, "u")).toBe(false);
    expect(isSessaoVisivel(ESCOPO_DA_LISTA.TODAS, { assignedAttendantId: null, status: "queued" }, "u")).toBe(true);
  });
});

describe("filtro da consulta", () => {
  it("quem administra: só o status pedido", () => {
    expect(buildFiltroDaVisibilidade(ESCOPO_DA_LISTA.TODAS, "u", null)).toEqual({});
    expect(buildFiltroDaVisibilidade(ESCOPO_DA_LISTA.TODAS, "u", ["queued"])).toEqual({ status: { in: ["queued"] } });
  });

  it("quem não administra: as próprias, sem robô e sem fila", () => {
    expect(buildFiltroDaVisibilidade(ESCOPO_DA_LISTA.MINHAS, "u", null)).toEqual({
      assignedAttendantId: "u",
      status: { notIn: ["bot", "queued"] },
    });
    expect(buildFiltroDaVisibilidade(ESCOPO_DA_LISTA.MINHAS, "u", ["queued", "active"])).toEqual({
      assignedAttendantId: "u",
      status: { in: ["active"] },
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
