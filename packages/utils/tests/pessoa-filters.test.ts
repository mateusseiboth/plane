/**
 * Atalhos de pessoa — "Meus chamados" (`assignee_id`) e "Abertos por mim"
 * (`created_by_id`). Os dois compartilham a mesma decisão: ligar/desligar o
 * usuário atual numa condição sem apagar o resto do filtro.
 *
 * O caso que quebra em silêncio é desligar quando o usuário é o único da lista:
 * deixar a condição vazia faz a listagem devolver ZERO chamados, e a pessoa lê
 * isso como "não tenho nada", não como "o filtro ficou quebrado".
 */
import { describe, expect, it } from "bun:test";
import {
  PESSOA_FILTER_PROPERTY,
  isCurrentUserSelected,
  resolvePessoaFilterAction,
  toPessoaList,
} from "../src/work-item-filters/pessoa-filters";

const EU = "user-1";
const OUTRO = "user-2";

describe("PESSOA_FILTER_PROPERTY", () => {
  it("aponta para as propriedades que o backend entende", () => {
    expect(PESSOA_FILTER_PROPERTY.ASSIGNEE).toBe("assignee_id");
    expect(PESSOA_FILTER_PROPERTY.CREATED_BY).toBe("created_by_id");
  });
});

describe("toPessoaList", () => {
  it("normaliza os formatos que a condição pode guardar", () => {
    expect(toPessoaList([EU, OUTRO])).toEqual([EU, OUTRO]);
    expect(toPessoaList(EU)).toEqual([EU]);
    expect(toPessoaList(undefined)).toEqual([]);
    expect(toPessoaList(null)).toEqual([]);
    expect(toPessoaList("")).toEqual([]);
  });

  it("descarta buracos deixados por uma condição recém-criada", () => {
    expect(toPessoaList([EU, "", undefined])).toEqual([EU]);
  });
});

describe("isCurrentUserSelected", () => {
  it("só é verdadeiro quando há usuário e ele está na lista", () => {
    expect(isCurrentUserSelected([EU, OUTRO], EU)).toBe(true);
    expect(isCurrentUserSelected([OUTRO], EU)).toBe(false);
    expect(isCurrentUserSelected([EU], undefined)).toBe(false);
  });
});

describe("resolvePessoaFilterAction", () => {
  it("sem usuário carregado não faz nada", () => {
    expect(resolvePessoaFilterAction([], undefined, false)).toEqual({ type: "noop" });
  });

  it("ligar sem a condição cria com o usuário atual", () => {
    expect(resolvePessoaFilterAction([], EU, false)).toEqual({ type: "add", values: [EU] });
  });

  it("ligar sobre a escolha de outra pessoa acrescenta, não substitui", () => {
    // Preservar a escolha é o ponto do atalho: ele compõe, o modelo substitui.
    expect(resolvePessoaFilterAction([OUTRO], EU, true)).toEqual({ type: "update", values: [OUTRO, EU] });
  });

  it("desligar quando sou o único REMOVE a condição", () => {
    expect(resolvePessoaFilterAction([EU], EU, true)).toEqual({ type: "remove" });
  });

  it("desligar com outras pessoas na lista tira só a mim", () => {
    expect(resolvePessoaFilterAction([EU, OUTRO], EU, true)).toEqual({ type: "update", values: [OUTRO] });
  });

  it("ligar e desligar em seguida devolve o filtro ao estado original", () => {
    const original = [OUTRO];
    const ligado = resolvePessoaFilterAction(original, EU, true);
    expect(ligado).toEqual({ type: "update", values: [OUTRO, EU] });
    const desligado = resolvePessoaFilterAction((ligado as { values: string[] }).values, EU, true);
    expect(desligado).toEqual({ type: "update", values: original });
  });

  it("condição existente mas ainda vazia trata como ligar do zero", () => {
    expect(resolvePessoaFilterAction([], EU, true)).toEqual({ type: "update", values: [EU] });
  });

  it("os dois atalhos são independentes: a decisão só olha a própria lista", () => {
    // "Meus chamados" ligado não pode influenciar "Abertos por mim".
    const responsaveis = [EU];
    const criadores: string[] = [];
    expect(resolvePessoaFilterAction(responsaveis, EU, true)).toEqual({ type: "remove" });
    expect(resolvePessoaFilterAction(criadores, EU, false)).toEqual({ type: "add", values: [EU] });
  });
});
