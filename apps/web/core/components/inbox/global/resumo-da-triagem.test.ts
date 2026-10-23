/**
 * Número do menu Solicitação/Triagem: solicitações que a pessoa abriu, já
 * resolvidas e que ela ainda não viu (`GET .../global-intake-issues/resumo/`).
 * Abrir a solicitação resolvida marca como vista, só para quem a abriu.
 * Rodar com `bun test core/components/inbox/global`.
 */
import { describe, expect, it } from "bun:test";
import {
  isEventoDoResumoDaTriagem,
  isMarcarComoVisto,
  isSolicitacaoResolvida,
  readResolvidasNaoVistas,
} from "./resumo-da-triagem";

describe("readResolvidasNaoVistas", () => {
  it("lê o número que a API devolve", () => {
    expect(readResolvidasNaoVistas({ resolvidas_nao_vistas: 3 })).toBe(3);
  });

  it("sem resposta ainda, é zero (o menu não mostra o número)", () => {
    expect(readResolvidasNaoVistas(undefined)).toBe(0);
  });
});

describe("isEventoDoResumoDaTriagem", () => {
  it("mudança de solicitação ou de chamado recalcula (concluir o chamado resolve o pedido)", () => {
    expect(isEventoDoResumoDaTriagem({ entity: "intake", action: "update" })).toBe(true);
    expect(isEventoDoResumoDaTriagem({ entity: "issue", action: "update" })).toBe(true);
  });

  it("comentário, mural e afins não mexem no número", () => {
    expect(isEventoDoResumoDaTriagem({ entity: "comment", action: "create" })).toBe(false);
    expect(isEventoDoResumoDaTriagem({ entity: "mural", action: "create" })).toBe(false);
  });
});

describe("isSolicitacaoResolvida", () => {
  it("atendida, ou aceita com o chamado concluído", () => {
    expect(isSolicitacaoResolvida(3, "started")).toBe(true);
    expect(isSolicitacaoResolvida(1, "completed")).toBe(true);
  });

  it("aceita em curso, pendente, recusada e duplicada não", () => {
    expect(isSolicitacaoResolvida(1, "started")).toBe(false);
    expect(isSolicitacaoResolvida(-2, "triage")).toBe(false);
    expect(isSolicitacaoResolvida(-1, "completed")).toBe(false);
    expect(isSolicitacaoResolvida(2, undefined)).toBe(false);
  });
});

describe("isMarcarComoVisto", () => {
  it("quem abriu a solicitação resolvida marca", () => {
    expect(isMarcarComoVisto({ autorId: "ana", userId: "ana", isResolvida: true })).toBe(true);
  });

  it("outra pessoa não marca", () => {
    expect(isMarcarComoVisto({ autorId: "ana", userId: "bia", isResolvida: true })).toBe(false);
  });

  it("solicitação sem autor do time (portal) ou ainda em curso não marca", () => {
    expect(isMarcarComoVisto({ autorId: null, userId: "ana", isResolvida: true })).toBe(false);
    expect(isMarcarComoVisto({ autorId: "ana", userId: undefined, isResolvida: true })).toBe(false);
    expect(isMarcarComoVisto({ autorId: "ana", userId: "ana", isResolvida: false })).toBe(false);
  });
});
