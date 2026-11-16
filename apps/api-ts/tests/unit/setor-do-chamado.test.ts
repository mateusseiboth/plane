/**
 * Em que setor o chamado está: a faixa de urgentes e as listas mostram, para
 * quem abriu saber com quem está o pedido. Tudo sai da matriz de Funções
 * (transições e ações), nada de lista fixa de setor. Puro, sem banco.
 */
import { describe, expect, it } from "bun:test";
import {
  buildDonosPorEtapa,
  buildSetorDoChamado,
  findSetorDaTriagem,
  type FuncaoDoEspaco,
} from "@modules/urgentes/setor-do-chamado.rules";

const ATENDIMENTO: FuncaoDoEspaco = { id: "a", name: "Atendimento", level: 6, permissions: ["intake.create"] };
const QUALIDADE: FuncaoDoEspaco = { id: "q", name: "Qualidade", level: 8, permissions: ["intake.review"] };
const TI: FuncaoDoEspaco = { id: "t", name: "TI", level: 12, permissions: [] };
const ADMIN: FuncaoDoEspaco = { id: "z", name: "Administrador", level: 20, permissions: ["intake.review"] };
const FUNCOES = [ATENDIMENTO, QUALIDADE, TI, ADMIN];

const DONOS = buildDonosPorEtapa(
  [
    { fromStateName: "Em Análise", roleId: "q" },
    { fromStateName: "Em Análise", roleId: "t" },
    { fromStateName: "Em Desenvolvimento", roleId: "t" },
    { fromStateName: "Em Teste", roleId: "q" },
    { fromStateName: "", roleId: "a" },
    { fromStateName: "Em Teste", roleId: "sumiu" },
  ],
  FUNCOES
);

const contexto = { donosPorEtapa: DONOS, setorDaTriagem: findSetorDaTriagem(FUNCOES) };

describe("findSetorDaTriagem", () => {
  it("é a função mais específica que tria: a de menor nível com intake.review", () => {
    expect(findSetorDaTriagem(FUNCOES)).toBe("Qualidade");
  });

  it("ninguém tria: sem setor", () => {
    expect(findSetorDaTriagem([ATENDIMENTO, TI])).toBeNull();
  });
});

describe("buildDonosPorEtapa", () => {
  it("dono da etapa é quem pode sair dela; transição de função apagada fica de fora", () => {
    expect(DONOS.get("Em Análise")).toEqual(["Qualidade", "TI"]);
    expect(DONOS.get("Em Teste")).toEqual(["Qualidade"]);
  });
});

describe("buildSetorDoChamado", () => {
  it("na triagem é o setor que tria, mesmo com o atendente como responsável", () => {
    const chamado = { etapa: "Triagem", grupo: "triage", setoresDosResponsaveis: ["Atendimento"] };
    expect(buildSetorDoChamado(chamado, contexto)).toBe("Qualidade");
  });

  it("com responsável de um setor dono da etapa, é o setor dele", () => {
    const chamado = { etapa: "Em Análise", grupo: "started", setoresDosResponsaveis: ["Atendimento", "TI"] };
    expect(buildSetorDoChamado(chamado, contexto)).toBe("TI");
  });

  it("sem responsável dono da etapa, são os donos da etapa", () => {
    const chamado = { etapa: "Em Análise", grupo: "started", setoresDosResponsaveis: ["Atendimento"] };
    expect(buildSetorDoChamado(chamado, contexto)).toBe("Qualidade / TI");
  });

  it("etapa sem dono na matriz: o setor dos responsáveis, ou nenhum", () => {
    expect(
      buildSetorDoChamado({ etapa: "Pendências", grupo: "backlog", setoresDosResponsaveis: ["TI", "TI"] }, contexto)
    ).toBe("TI");
    expect(
      buildSetorDoChamado({ etapa: "Pendências", grupo: "backlog", setoresDosResponsaveis: [] }, contexto)
    ).toBeNull();
  });
});
