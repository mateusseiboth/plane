/**
 * A solicitação de que o chamado nasceu, como o detalhe do chamado a mostra:
 * quando existe, de onde veio, qual era o texto e a prioridade pedidos. Regras
 * puras, sem banco.
 */
import { describe, expect, it } from "bun:test";
import {
  buildSolicitacaoDoChamado,
  hasSolicitacaoDeOrigem,
  pickPrioridadePedida,
  pickTextoOriginal,
  resolveOrigemDaSolicitacao,
} from "@utils/solicitacao-de-origem";

describe("hasSolicitacaoDeOrigem", () => {
  it("é verdade quando há vínculo vivo com a triagem", () => {
    expect(hasSolicitacaoDeOrigem([{ deletedAt: null }])).toBe(true);
  });

  it("vínculo apagado ou ausente não conta", () => {
    expect(hasSolicitacaoDeOrigem([{ deletedAt: new Date() }])).toBe(false);
    expect(hasSolicitacaoDeOrigem([])).toBe(false);
    expect(hasSolicitacaoDeOrigem(undefined)).toBe(false);
  });
});

describe("resolveOrigemDaSolicitacao", () => {
  it("chamado aberto pela conversa é do chat", () => {
    expect(resolveOrigemDaSolicitacao({ source: "in-app", externalSource: "chat" })).toBe("chat");
  });

  it("solicitação do portal do cliente é do portal", () => {
    expect(resolveOrigemDaSolicitacao({ source: "portal", externalSource: null })).toBe("portal");
  });

  it("o resto foi aberto no aplicativo", () => {
    expect(resolveOrigemDaSolicitacao({ source: "in-app", externalSource: null })).toBe("app");
    expect(resolveOrigemDaSolicitacao({ source: "email", externalSource: "sac" })).toBe("app");
  });
});

describe("pickTextoOriginal", () => {
  it("usa a versão mais antiga da descrição: ela guarda o texto de antes da primeira edição", () => {
    expect(pickTextoOriginal({ descriptionHtml: "<p>pedido</p>" }, "<p>editado</p>")).toEqual({
      html: "<p>pedido</p>",
      isTextoAtual: false,
    });
  });

  it("sem versão, o texto atual é o original e o painel avisa", () => {
    expect(pickTextoOriginal(null, "<p>atual</p>")).toEqual({ html: "<p>atual</p>", isTextoAtual: true });
    expect(pickTextoOriginal({ descriptionHtml: null }, "<p>atual</p>")).toEqual({
      html: "<p>atual</p>",
      isTextoAtual: true,
    });
  });
});

describe("pickPrioridadePedida", () => {
  it("a primeira troca de prioridade guarda a pedida no valor anterior", () => {
    expect(pickPrioridadePedida({ oldValue: "urgent" }, "low")).toBe("urgent");
  });

  it("sem troca, a atual é a pedida", () => {
    expect(pickPrioridadePedida(null, "high")).toBe("high");
    expect(pickPrioridadePedida({ oldValue: null }, "high")).toBe("high");
  });
});

describe("buildSolicitacaoDoChamado", () => {
  const abertaEm = new Date("2026-10-01T12:00:00.000Z");
  const chamado = {
    name: "Erro na folha",
    priority: "low",
    descriptionHtml: "<p>editado</p>",
    externalSource: null,
    createdBy: { displayName: "Ana" },
    entity: { name: "Prefeitura de Itu" },
    portalRequest: null,
    moduleIssues: [{ module: { name: "Folha" } }],
    versions: [{ descriptionHtml: "<p>pedido</p>", name: "Erro" }],
    activities: [{ oldValue: "urgent" }],
    intakeIssues: [{ id: "solic-1", createdAt: abertaEm, source: "in-app", deletedAt: null }],
  };

  it("monta o painel com os dados de quando a solicitação foi aberta", () => {
    expect(buildSolicitacaoDoChamado(chamado)).toEqual({
      id: "solic-1",
      aberta_em: abertaEm.toISOString(),
      aberta_por: "Ana",
      origem: "app",
      entidade: "Prefeitura de Itu",
      modulo: "Folha",
      prioridade: "urgent",
      titulo: "Erro",
      descricao_html: "<p>pedido</p>",
      is_texto_atual: false,
    });
  });

  it("no portal, quem abriu é a conta do cliente", () => {
    const doPortal = {
      ...chamado,
      createdBy: null,
      portalRequest: { account: { name: "Cliente Itu" } },
      intakeIssues: [{ ...chamado.intakeIssues[0]!, source: "portal" }],
    };
    expect(buildSolicitacaoDoChamado(doPortal)).toMatchObject({ aberta_por: "Cliente Itu", origem: "portal" });
  });

  it("chamado que não nasceu de solicitação devolve null", () => {
    expect(buildSolicitacaoDoChamado({ ...chamado, intakeIssues: [] })).toBeNull();
  });
});
