/**
 * O bloco "Solicitação" de cada registro da ouvidoria: o processo quando já
 * existe a solicitação, o botão de criar para quem tem a ação, nada para os
 * demais. Rodar com `bun test core/components/ouvidoria`.
 */
import { describe, expect, it } from "bun:test";
import { readBlocoDaSolicitacao } from "@/components/ouvidoria/solicitacao-da-ouvidoria";

const solicitacao = {
  issue_id: "c1",
  project_id: "p1",
  numero: "SIART · SIART-1",
  titulo: "Reclamação",
  situacao: "No atendimento",
  etapa: "Triagem",
  atendente: "u1",
  processo: [],
};

describe("readBlocoDaSolicitacao", () => {
  it("com a solicitação, mostra o processo (para quem lê, mesmo sem poder criar)", () => {
    expect(readBlocoDaSolicitacao({ solicitacao, canCriar: false })).toBe("processo");
  });

  it("sem a solicitação, quem pode cria", () => {
    expect(readBlocoDaSolicitacao({ solicitacao: null, canCriar: true })).toBe("criar");
  });

  it("sem a solicitação e sem a ação, nada", () => {
    expect(readBlocoDaSolicitacao({ solicitacao: null, canCriar: false })).toBe("nada");
  });
});
