/**
 * Cada linha da lista global de solicitações: número, entidade e onde o pedido
 * está. Rodar com `bun test core/components/inbox/global`.
 */
import { describe, expect, it } from "bun:test";
import { buildLinhaDaSolicitacao } from "@/components/inbox/global/linha-da-solicitacao";

describe("buildLinhaDaSolicitacao", () => {
  it("número anual, nome do sistema com o número, entidade e etapa com setor", () => {
    const linha = buildLinhaDaSolicitacao({
      project: { identifier: "ALMOXA", name: "Almoxarifado" },
      issue: { sequence_id: 11, ticket_number: "12-2026", state_name: "Em Análise" },
      entity: { name: "Prefeitura de Teste" },
      setor: "Qualidade",
    });
    expect(linha).toEqual({
      numero: "12-2026",
      noSistema: "Almoxarifado · ALMOXA-11",
      entidade: "Prefeitura de Teste",
      ondeEsta: "Em Análise · Qualidade",
    });
  });

  it("sem número anual nem entidade nem etapa, mostra o que houver", () => {
    expect(
      buildLinhaDaSolicitacao({
        project: { identifier: "ALMOXA" },
        issue: { sequence_id: 3 },
        entity: null,
        setor: null,
      })
    ).toEqual({ numero: null, noSistema: "ALMOXA-3", entidade: null, ondeEsta: null });
  });
});
