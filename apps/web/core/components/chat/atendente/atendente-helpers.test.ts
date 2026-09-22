/**
 * Regras de tela das ferramentas do atendente: tempo legível, frase inserida no
 * rascunho, dados técnicos do cliente, erro do campo e aviso do alerta pausado.
 * Puro. Rodar com `bun test core/components/chat/atendente`.
 */
import { describe, expect, it } from "bun:test";
import {
  formatSegundos,
  insertFrase,
  listClientInfo,
  readErroDoCampo,
  readSessaoDaUrl,
  rotuloDoAlertaPausado,
} from "./atendente-helpers";

describe("formatSegundos", () => {
  it("vazio, segundos, minutos e horas", () => {
    expect(formatSegundos(null)).toBe("-");
    expect(formatSegundos(45)).toBe("45 s");
    expect(formatSegundos(180)).toBe("3 min");
    expect(formatSegundos(3900)).toBe("1 h 05 min");
  });
});

describe("insertFrase", () => {
  it("rascunho vazio vira a frase; com texto, a frase entra no fim", () => {
    expect(insertFrase("", "Aguarde.")).toBe("Aguarde.");
    expect(insertFrase("Olá!  ", "Aguarde.")).toBe("Olá! Aguarde.");
  });
});

describe("listClientInfo", () => {
  it("rótulos na ordem da tela, só o que veio", () => {
    expect(listClientInfo({ so: "Windows 11", versao: "3.1", xpto: "?" })).toEqual([
      { rotulo: "Versão do sistema", valor: "3.1" },
      { rotulo: "Sistema operacional", valor: "Windows 11" },
    ]);
    expect(listClientInfo(undefined)).toEqual([]);
  });
});

describe("readErroDoCampo", () => {
  it("mensagem do campo recusado pelo servidor", () => {
    const erro = { detail: "Confira os campos destacados.", errors: [{ path: "chave", message: "Informe a chave." }] };
    expect(readErroDoCampo(erro, "chave")).toBe("Informe a chave.");
    expect(readErroDoCampo(erro, "texto")).toBeUndefined();
    expect(readErroDoCampo(null, "chave")).toBeUndefined();
  });
});

describe("rotuloDoAlertaPausado", () => {
  it("mostra até quando, só se ainda vale", () => {
    const agora = new Date("2026-09-22T15:00:00Z");
    expect(rotuloDoAlertaPausado("2026-09-22T15:30:00Z", agora)).toMatch(/^Alerta pausado até \d{2}:\d{2}$/);
    expect(rotuloDoAlertaPausado("2026-09-22T14:00:00Z", agora)).toBeNull();
    expect(rotuloDoAlertaPausado(null, agora)).toBeNull();
  });
});

describe("readSessaoDaUrl", () => {
  it("abre a conversa pedida na URL", () => {
    expect(readSessaoDaUrl("?sessao=abc")).toBe("abc");
    expect(readSessaoDaUrl("")).toBeNull();
  });
});
