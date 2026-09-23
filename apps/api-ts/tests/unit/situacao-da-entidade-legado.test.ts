/**
 * Situação da entidade vinda da intranet legada: `entidades_situacao`
 * ("descongelado" é cliente ativo, "congelado" não é mais) e
 * `entidades_status` (1 ativa, 0 excluída). É a regra que o importador e o
 * script de sincronização usam para `is_active` e `frozen_at` no Plane.
 */
import { describe, expect, it } from "bun:test";
import { readSituacaoDaEntidade } from "@scripts/situacao-da-entidade-legado";

describe("readSituacaoDaEntidade", () => {
  it("descongelado com status 1 é cliente ativo e não congelado", () => {
    expect(readSituacaoDaEntidade({ situacao: "descongelado", status: 1 })).toEqual({
      isActive: true,
      congelada: false,
    });
  });

  it("congelado deixa de ser cliente: inativo e congelado", () => {
    expect(readSituacaoDaEntidade({ situacao: "congelado", status: 1 })).toEqual({ isActive: false, congelada: true });
  });

  it("status 0 é inativo mesmo descongelado", () => {
    expect(readSituacaoDaEntidade({ situacao: "descongelado", status: 0 })).toEqual({
      isActive: false,
      congelada: false,
    });
  });

  it("situação vazia ou desconhecida conta como congelada, para não mostrar quem não se sabe", () => {
    expect(readSituacaoDaEntidade({ situacao: null, status: 1 })).toEqual({ isActive: false, congelada: true });
    expect(readSituacaoDaEntidade({ situacao: " Descongelado ", status: 1 })).toEqual({
      isActive: true,
      congelada: false,
    });
  });
});
