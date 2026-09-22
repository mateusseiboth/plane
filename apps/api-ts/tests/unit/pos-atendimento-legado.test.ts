/**
 * Importação do pós-atendimento do SAC: tradução da linha do MySQL, conversão do
 * comentário `pos-N` (sem MySQL, expectativa nula), escolha do destino (chamado ou
 * visita) e o desempate de chamado com mais de um pós. Puro; sem banco.
 */
import { describe, expect, it } from "bun:test";
import {
  keepOnePorAlvo,
  mapComentarioPos,
  mapLinhaDoSac,
  resolveAlvoDoSac,
} from "@modules/pos-atendimento/pos-atendimento.legado";

const DATA = new Date("2018-11-30T20:22:44Z");

const linha = (over: Record<string, unknown> = {}) => ({
  posatendimento_id: 11839,
  posatendimento_chamados_id: 28904,
  posatendimento_usuarios_id: 12,
  posatendimento_data: DATA,
  posatendimento_tipo: 6,
  posatendimento_observacao: "  Cliente   atendido.\r\nTudo certo. ",
  posatendimento_solucao: 4,
  posatendimento_satisfacao: 3,
  posatendimento_verificado: 1,
  posatendimento_usuarios_id_qualidade: 40,
  pos_atendimento_observacao_qualidade: "Ok",
  ...over,
});

describe("linha do MySQL", () => {
  it("traduz os códigos e mantém a data do contato", () => {
    expect(mapLinhaDoSac(linha())).toEqual({
      legacyId: 11839,
      expectativa: 4,
      classificacao: 3,
      meioContato: 6,
      observacao: "Cliente atendido.\nTudo certo.",
      recordedAt: DATA,
      verifiedAt: DATA,
      verificationComment: "Ok",
      legacyRecordedBy: 12,
      legacyVerifiedBy: 40,
    });
  });

  it("zero do legado vira nulo e não verificado fica sem data", () => {
    const r = mapLinhaDoSac(
      linha({
        posatendimento_tipo: 0,
        posatendimento_solucao: 0,
        posatendimento_satisfacao: 0,
        posatendimento_verificado: 0,
        posatendimento_usuarios_id_qualidade: null,
        pos_atendimento_observacao_qualidade: "",
      })
    );
    expect(r).toMatchObject({
      expectativa: null,
      classificacao: null,
      meioContato: null,
      verifiedAt: null,
      verificationComment: null,
      legacyVerifiedBy: null,
    });
  });
});

describe("comentário pos-N (sem MySQL)", () => {
  const comentario = (over: Record<string, unknown> = {}) => ({
    issueId: "issue-1",
    externalId: "pos-321",
    actorId: "user-1",
    createdAt: DATA,
    commentStripped: "Pós-atendimento — solução: sim, satisfação: 2\nLigou e confirmou.\nQualidade: Conferido",
    commentJson: { metadata: { origem: "posatendimento", tipo: 1, solucao: true, satisfacao: 2, verificado: true } },
    ...over,
  });

  it("recupera classificação, meio, observação e verificação; a expectativa se perdeu", () => {
    expect(mapComentarioPos(comentario())).toEqual({
      legacyId: 321,
      issueId: "issue-1",
      expectativa: null,
      classificacao: 2,
      meioContato: 1,
      observacao: "Ligou e confirmou.",
      recordedById: "user-1",
      recordedAt: DATA,
      verifiedAt: DATA,
      verificationComment: "Conferido",
    });
  });

  it("não verificado e sem nota", () => {
    const r = mapComentarioPos(
      comentario({
        commentStripped: "Pós-atendimento — solução: não, satisfação: -",
        commentJson: { metadata: { tipo: 0, satisfacao: 0, verificado: false } },
      })
    );
    expect(r).toMatchObject({
      classificacao: null,
      meioContato: null,
      observacao: "",
      verifiedAt: null,
      verificationComment: null,
    });
  });

  it("id fora do padrão é descartado", () => {
    expect(mapComentarioPos(comentario({ externalId: "pos-x" }))).toBeNull();
  });
});

describe("destino do pós legado", () => {
  const chamados = new Map([
    [28904, "issue-a"],
    [100, "issue-b"],
  ]);
  const visitas = new Map([[28904, "visit-a"]]);

  it("chamado de visita com pós feito pela visita vai para a visita", () => {
    expect(resolveAlvoDoSac(28904, { chamados, visitas })).toEqual({ visitId: "visit-a" });
  });

  it("os demais vão para o chamado", () => {
    expect(resolveAlvoDoSac(100, { chamados, visitas })).toEqual({ issueId: "issue-b" });
  });

  it("sem chamado migrado não há destino", () => {
    expect(resolveAlvoDoSac(5, { chamados, visitas })).toBeNull();
  });
});

describe("chamado com mais de um pós no legado", () => {
  it("fica o mais recente; os outros são relatados", () => {
    const { mantidos, descartados } = keepOnePorAlvo([
      { legacyId: 1, alvo: "i1" },
      { legacyId: 3, alvo: "i1" },
      { legacyId: 2, alvo: "i2" },
    ]);
    expect(mantidos.map((m) => m.legacyId)).toEqual([3, 2]);
    expect(descartados.map((m) => m.legacyId)).toEqual([1]);
  });
});
