/**
 * Abertura do Avião: a tela de carregamento só sai depois que a aplicação
 * ficou pronta E o avião completou um ciclo inteiro (decolar, voar, pousar).
 * Enquanto a aplicação não vem, o ciclo repete. Regras puras, sem DOM.
 * Rodar com `bun test core/components/abertura`.
 */
import { describe, expect, it } from "bun:test";
import { buildControleDaAbertura } from "./controle-da-abertura";
import { buildProntidaoDaApp } from "./prontidao-da-app";

const controle = (exigirCicloCompleto = true) => {
  let encerramentos = 0;
  const c = buildControleDaAbertura({ exigirCicloCompleto, onEncerrar: () => encerramentos++ });
  return { c, encerramentos: () => encerramentos };
};

describe("controle da abertura: o avião sempre pousa antes de a tela sair", () => {
  it("fim de ciclo sem a app pronta não encerra: o avião decola de novo", () => {
    const { c, encerramentos } = controle();
    c.onFimDoCiclo();
    c.onFimDoCiclo();
    expect(encerramentos()).toBe(0);
    expect(c.isEncerrada()).toBe(false);
  });

  it("app pronta no meio do voo espera o pouso", () => {
    const { c, encerramentos } = controle();
    c.markPronta();
    expect(encerramentos()).toBe(0);
    c.onFimDoCiclo();
    expect(encerramentos()).toBe(1);
    expect(c.isEncerrada()).toBe(true);
  });

  it("ciclos vistos antes de a app ficar pronta não contam: espera o próximo pouso", () => {
    const { c, encerramentos } = controle();
    c.onFimDoCiclo();
    c.markPronta();
    expect(encerramentos()).toBe(0);
    c.onFimDoCiclo();
    expect(encerramentos()).toBe(1);
  });

  it("encerra uma vez só, mesmo com mais pousos depois", () => {
    const { c, encerramentos } = controle();
    c.markPronta();
    c.onFimDoCiclo();
    c.onFimDoCiclo();
    c.markPronta();
    expect(encerramentos()).toBe(1);
  });

  it("sem animação (movimento reduzido) encerra assim que a app fica pronta", () => {
    const { c, encerramentos } = controle(false);
    c.markPronta();
    expect(encerramentos()).toBe(1);
  });

  it("tempo esgotado é a rede de segurança: só encerra se a app já estiver pronta", () => {
    const { c, encerramentos } = controle();
    c.onTempoEsgotado();
    expect(encerramentos()).toBe(0);
    c.markPronta();
    c.onTempoEsgotado();
    expect(encerramentos()).toBe(1);
  });
});

describe("prontidão da app: quem chega depois também fica sabendo", () => {
  it("avisa quem assinou antes e quem assina depois de pronta", () => {
    const prontidao = buildProntidaoDaApp();
    const avisos: string[] = [];
    prontidao.onPronta(() => avisos.push("antes"));
    expect(prontidao.isPronta()).toBe(false);
    prontidao.markPronta();
    prontidao.markPronta();
    prontidao.onPronta(() => avisos.push("depois"));
    expect(prontidao.isPronta()).toBe(true);
    expect(avisos).toEqual(["antes", "depois"]);
  });

  it("cancelar a assinatura para de avisar", () => {
    const prontidao = buildProntidaoDaApp();
    const avisos: string[] = [];
    const cancelar = prontidao.onPronta(() => avisos.push("nunca"));
    cancelar();
    prontidao.markPronta();
    expect(avisos).toEqual([]);
  });
});
