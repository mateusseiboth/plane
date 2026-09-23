/**
 * Colunas do painel de TV do TI e da Qualidade: mapeamento padrão, contagem com
 * percentual, chamados urgentes, o filtro que o DAO usa e a validação da
 * configuração gravada pelo espaço. Puro — sem banco.
 */
import { describe, expect, it } from "bun:test";
import {
  COLUNAS_PADRAO,
  buildFiltroDoQuadro,
  buildQuadro,
  parseColunasDoPainel,
  readColunasDoPainel,
  type ChamadoDoQuadro,
} from "@modules/painel-tv/quadro/colunas";

const AGORA = new Date("2026-09-22T12:00:00.000Z");

const chamado = (over: Partial<ChamadoDoQuadro> = {}): ChamadoDoQuadro => ({
  id: crypto.randomUUID(),
  etapa: "A Fazer",
  grupo: "unstarted",
  prioridade: "medium",
  temResponsavel: false,
  concluidoEm: null,
  ...over,
});

describe("colunas do painel", () => {
  it("o padrão do TI reproduz o painel legado: Pendente, Atribuído, Em desenvolvimento, Concluído e Enviado", () => {
    expect(COLUNAS_PADRAO.ti.map((c) => c.chave)).toEqual([
      "pendente",
      "atribuido",
      "em_desenvolvimento",
      "concluido",
      "enviado",
    ]);
    expect(COLUNAS_PADRAO.ti[0]).toMatchObject({ rotulo: "Pendente", responsavel: "sem" });
    expect(COLUNAS_PADRAO.ti[1]).toMatchObject({ rotulo: "Atribuído", responsavel: "com" });
  });

  it("o padrão da Qualidade reproduz Verificar, Analisar, Homologar e Homologado", () => {
    expect(COLUNAS_PADRAO.qualidade.map((c) => c.chave)).toEqual(["verificar", "analisar", "homologar", "homologado"]);
    expect(COLUNAS_PADRAO.qualidade.map((c) => c.etapas[0])).toEqual([
      "Triagem",
      "Em Análise",
      "Em Teste",
      "Concluído",
    ]);
  });

  it("separa pendente de atribuído pelo responsável", () => {
    const quadro = buildQuadro(COLUNAS_PADRAO.ti, [chamado(), chamado({ temResponsavel: true })], AGORA);
    expect(quadro.colunas[0]!.total).toBe(1);
    expect(quadro.colunas[1]!.total).toBe(1);
  });

  it("cada chamado entra em uma coluna só, a primeira que combina", () => {
    const quadro = buildQuadro(COLUNAS_PADRAO.qualidade, [chamado({ etapa: "Em Teste", grupo: "started" })], AGORA);
    expect(quadro.colunas.map((c) => c.total)).toEqual([0, 0, 1, 0]);
  });

  it("percentual só sobre as colunas que contam no total (o legado não soma Homologado)", () => {
    const emTeste = Array.from({ length: 3 }, () => chamado({ etapa: "Em Teste", grupo: "started" }));
    const naTriagem = chamado({ etapa: "Triagem", grupo: "triage" });
    const concluido = chamado({ etapa: "Concluído", grupo: "completed", concluidoEm: AGORA });
    const quadro = buildQuadro(COLUNAS_PADRAO.qualidade, [...emTeste, naTriagem, concluido], AGORA);
    expect(quadro.total).toBe(4);
    expect(quadro.colunas[0]).toMatchObject({ chave: "verificar", total: 1, percentual: 25 });
    expect(quadro.colunas[2]).toMatchObject({ chave: "homologar", total: 3, percentual: 75 });
    expect(quadro.colunas[3]).toMatchObject({ chave: "homologado", total: 1, percentual: null });
  });

  it("coluna de concluídos só mostra o que terminou dentro da janela configurada", () => {
    const recente = chamado({ etapa: "Concluído", grupo: "completed", concluidoEm: new Date("2026-09-20T12:00:00Z") });
    const antigo = chamado({ etapa: "Concluído", grupo: "completed", concluidoEm: new Date("2026-08-01T12:00:00Z") });
    const semData = chamado({ etapa: "Concluído", grupo: "completed", concluidoEm: null });
    const quadro = buildQuadro(COLUNAS_PADRAO.qualidade, [recente, antigo, semData], AGORA);
    expect(quadro.colunas[3]!.chamados.map((c) => c.id)).toEqual([recente.id]);
  });

  it("chamado em etapa que nenhuma coluna quer fica de fora", () => {
    const quadro = buildQuadro(COLUNAS_PADRAO.qualidade, [chamado({ etapa: "Cancelado", grupo: "cancelled" })], AGORA);
    expect(quadro.total).toBe(0);
  });

  it("urgentes saem das colunas em aberto, e o alerta ignora os já concluídos", () => {
    const parado = chamado({ etapa: "Triagem", grupo: "triage", prioridade: "urgent" });
    const entregue = chamado({
      etapa: "Concluído",
      grupo: "completed",
      prioridade: "urgent",
      concluidoEm: AGORA,
    });
    const quadro = buildQuadro(COLUNAS_PADRAO.qualidade, [parado, entregue], AGORA);
    expect(quadro.urgentes.map((c) => c.id)).toEqual([parado.id]);
  });

  it("no TI, urgente que já está em Concluído (homologação) não dispara o alerta; na Qualidade dispara", () => {
    const emDesenvolvimento = chamado({ etapa: "Em Desenvolvimento", grupo: "started", prioridade: "urgent" });
    const emHomologacao = chamado({ etapa: "Em Teste", grupo: "started", prioridade: "urgent" });
    const ti = buildQuadro(COLUNAS_PADRAO.ti, [emDesenvolvimento, emHomologacao], AGORA);
    expect(ti.colunas.find((c) => c.chave === "concluido")?.chamados.map((c) => c.id)).toEqual([emHomologacao.id]);
    expect(ti.urgentes.map((c) => c.id)).toEqual([emDesenvolvimento.id]);

    const qualidade = buildQuadro(COLUNAS_PADRAO.qualidade, [emDesenvolvimento, emHomologacao], AGORA);
    expect(qualidade.urgentes.map((c) => c.id)).toEqual([emHomologacao.id]);
  });

  it("na Qualidade, urgente em desenvolvimento não aparece em coluna nenhuma nem no alerta: é só do TI", () => {
    const emDesenvolvimento = chamado({ etapa: "Em Desenvolvimento", grupo: "started", prioridade: "urgent" });
    const qualidade = buildQuadro(COLUNAS_PADRAO.qualidade, [emDesenvolvimento], AGORA);
    expect(qualidade.colunas.flatMap((c) => c.chamados)).toEqual([]);
    expect(qualidade.urgentes).toEqual([]);
  });

  it("o filtro do DAO pede as etapas de todas as colunas e a data-limite dos concluídos", () => {
    const filtro = buildFiltroDoQuadro(COLUNAS_PADRAO.qualidade, AGORA);
    expect(filtro.etapas).toEqual(["Triagem", "Em Análise", "Em Teste", "Concluído"]);
    expect(filtro.concluidosDesde?.toISOString()).toBe("2026-09-15T12:00:00.000Z");
  });

  it("sem coluna de concluídos, o filtro não limita por data", () => {
    const filtro = buildFiltroDoQuadro([{ chave: "x", rotulo: "X", cor: "azul", etapas: ["A Fazer"] }], AGORA);
    expect(filtro.concluidosDesde).toBeNull();
  });
});

describe("configuração das colunas gravada pelo espaço", () => {
  const valida = [
    { chave: "espera", rotulo: "Esperando", cor: "laranja", etapas: ["Triagem", "Pendências"] },
    { chave: "feito", rotulo: "Feito", cor: "verde", etapas: ["Concluído"], concluido_em_dias: 3, no_total: false },
    { chave: "teste", rotulo: "Em teste", cor: "ouro", etapas: ["Em Teste"], alerta: false },
  ];

  it("aceita a configuração completa e devolve as colunas internas", () => {
    const { colunas, erros } = parseColunasDoPainel(valida);
    expect(erros).toEqual([]);
    expect(colunas).toEqual([
      { chave: "espera", rotulo: "Esperando", cor: "laranja", etapas: ["Triagem", "Pendências"] },
      { chave: "feito", rotulo: "Feito", cor: "verde", etapas: ["Concluído"], concluidoEmDias: 3, noTotal: false },
      { chave: "teste", rotulo: "Em teste", cor: "ouro", etapas: ["Em Teste"], alerta: false },
    ]);
  });

  it("recusa coluna sem rótulo, sem etapa, com cor desconhecida e lista vazia", () => {
    expect(parseColunasDoPainel([{ chave: "a", rotulo: " ", cor: "azul", etapas: ["A Fazer"] }]).erros).toEqual([
      { path: "columns[0].rotulo", message: "Informe o nome da coluna." },
    ]);
    expect(parseColunasDoPainel([{ chave: "a", rotulo: "A", cor: "azul", etapas: [] }]).erros).toEqual([
      { path: "columns[0].etapas", message: "Escolha ao menos uma etapa." },
    ]);
    expect(parseColunasDoPainel([{ chave: "a", rotulo: "A", cor: "turquesa", etapas: ["A Fazer"] }]).erros).toEqual([
      { path: "columns[0].cor", message: "Cor desconhecida: turquesa." },
    ]);
    expect(parseColunasDoPainel([]).erros).toEqual([{ path: "columns", message: "Escolha ao menos uma coluna." }]);
  });

  it("recusa filtro de responsável fora de com/sem", () => {
    expect(
      parseColunasDoPainel([{ chave: "a", rotulo: "A", cor: "azul", etapas: ["A Fazer"], responsavel: "talvez" }]).erros
    ).toEqual([{ path: "columns[0].responsavel", message: "Use com, sem ou deixe em branco." }]);
  });

  it("sem configuração gravada vale o padrão do código", () => {
    expect(readColunasDoPainel("ti", null)).toEqual(COLUNAS_PADRAO.ti);
    expect(readColunasDoPainel("ti", [])).toEqual(COLUNAS_PADRAO.ti);
    expect(readColunasDoPainel("qualidade", [{ chave: "a", rotulo: "A", cor: "azul", etapas: ["A Fazer"] }])).toEqual([
      { chave: "a", rotulo: "A", cor: "azul", etapas: ["A Fazer"] },
    ]);
  });

  it("configuração gravada inválida não derruba o painel: vale o padrão", () => {
    expect(readColunasDoPainel("ti", [{ chave: "a" }])).toEqual(COLUNAS_PADRAO.ti);
  });
});
