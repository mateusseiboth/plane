/**
 * Regras de tela das ferramentas do atendente: tempo legível, frase inserida no
 * rascunho, dados técnicos do cliente, erro do campo e aviso do alerta pausado.
 * Puro. Rodar com `bun test core/components/chat/atendente`.
 */
import { describe, expect, it } from "bun:test";
import {
  applyTransferenciaNaLista,
  formatSegundos,
  groupFrases,
  insertFrase,
  listClientInfo,
  readErroDoCampo,
  readSessaoDaUrl,
  rotuloDoAlertaPausado,
  withSistemaDaConversa,
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

describe("groupFrases", () => {
  it("separa as frases da pessoa das do espaço, mantendo a ordem", () => {
    const frases = [
      { id: "1", texto: "Do espaço A", ordem: 0, escopo: "espaco" as const },
      { id: "2", texto: "Minha", ordem: 0, escopo: "pessoal" as const },
      { id: "3", texto: "Do espaço B", ordem: 1, escopo: "espaco" as const },
    ];
    expect(groupFrases(frases)).toEqual({
      minhas: [frases[1]],
      doEspaco: [frases[0], frases[2]],
    });
    expect(groupFrases([])).toEqual({ minhas: [], doEspaco: [] });
  });
});

describe("withSistemaDaConversa", () => {
  const projetos = [{ value: "p1", label: "SIART" }];

  it("conversa transferida com sistema fora dos projetos de quem recebe: o sistema entra na lista", () => {
    const sessao = { project_id: "p9", project_name: "Notas de Falecimento", project_identifier: "NF" };
    expect(withSistemaDaConversa(projetos, sessao)).toEqual([
      { value: "p9", label: "Notas de Falecimento" },
      { value: "p1", label: "SIART" },
    ]);
  });

  it("sem nome, usa o identificador", () => {
    const sessao = { project_id: "p9", project_name: null, project_identifier: "NF" };
    expect(withSistemaDaConversa(projetos, sessao)[0]).toEqual({ value: "p9", label: "NF" });
  });

  it("sistema já na lista ou conversa sem sistema: lista igual", () => {
    expect(withSistemaDaConversa(projetos, { project_id: "p1", project_name: "SIART" })).toEqual(projetos);
    expect(withSistemaDaConversa(projetos, { project_id: null })).toEqual(projetos);
    expect(withSistemaDaConversa(projetos, null)).toEqual(projetos);
  });
});

describe("applyTransferenciaNaLista", () => {
  const sessoes = [
    { id: "s1", assigned_attendant_id: "eu" },
    { id: "s2", assigned_attendant_id: "eu" },
  ];
  const aviso = { session_id: "s1", to_user_id: "outro" };

  it("sem chat.ver_todas: a conversa transferida sai da lista na hora", () => {
    expect(applyTransferenciaNaLista(sessoes, aviso, false)).toEqual([{ id: "s2", assigned_attendant_id: "eu" }]);
  });

  it("com chat.ver_todas: a conversa fica, com o novo dono", () => {
    expect(applyTransferenciaNaLista(sessoes, aviso, true)).toEqual([
      { id: "s1", assigned_attendant_id: "outro" },
      { id: "s2", assigned_attendant_id: "eu" },
    ]);
  });
});

describe("readSessaoDaUrl", () => {
  it("abre a conversa pedida na URL", () => {
    expect(readSessaoDaUrl("?sessao=abc")).toBe("abc");
    expect(readSessaoDaUrl("")).toBeNull();
  });
});
