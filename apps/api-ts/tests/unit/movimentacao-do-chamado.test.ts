/**
 * Comentário obrigatório antes de mudar a etapa do chamado: a regra pura e o
 * service que a aplica. A obrigação é a ação `issue.require_comment_to_move`
 * da função efetiva (marcada = precisa comentar). DAO dublado, sem banco.
 */
import { describe, expect, it } from "bun:test";
import {
  MENSAGEM_COMENTE_ANTES_DE_MOVER,
  isComentarioExigido,
  isMovimentacaoLiberada,
  type MarcosDaMovimentacao,
} from "@modules/issue/movimentacao.rules";
import { createMovimentacaoService } from "@modules/issue/movimentacao.service";
import { EProjectAction, type EffectiveRole } from "@utils/permissions";

const CRIADO = new Date("2026-10-01T10:00:00.000Z");
const MOVIDO = new Date("2026-10-02T10:00:00.000Z");

const funcao = (permissions: string[]): EffectiveRole => ({ id: "f1", key: "member", level: 15, permissions });
const OBRIGADA = funcao(["issue.view", EProjectAction.ISSUE_REQUIRE_COMMENT_TO_MOVE]);
const DISPENSADA = funcao(["issue.view"]);

const marcos = (parcial: Partial<MarcosDaMovimentacao>): MarcosDaMovimentacao => ({
  criadoEm: CRIADO,
  ultimaMudancaDeEtapaEm: null,
  ultimoComentarioDoUsuarioEm: null,
  ...parcial,
});

describe("isMovimentacaoLiberada", () => {
  it("sem comentário nenhum, não move", () => {
    expect(isMovimentacaoLiberada(marcos({}))).toBe(false);
  });

  it("nunca mudou de etapa: vale o comentário feito depois da criação", () => {
    expect(isMovimentacaoLiberada(marcos({ ultimoComentarioDoUsuarioEm: new Date("2026-10-01T11:00:00Z") }))).toBe(
      true
    );
  });

  it("comentário anterior à criação não conta", () => {
    expect(isMovimentacaoLiberada(marcos({ ultimoComentarioDoUsuarioEm: new Date("2026-10-01T09:00:00Z") }))).toBe(
      false
    );
  });

  it("comentário depois da última mudança de etapa libera", () => {
    const m = marcos({ ultimaMudancaDeEtapaEm: MOVIDO, ultimoComentarioDoUsuarioEm: new Date("2026-10-02T10:00:01Z") });
    expect(isMovimentacaoLiberada(m)).toBe(true);
  });

  it("comentário de antes da última mudança de etapa não libera a próxima", () => {
    const m = marcos({ ultimaMudancaDeEtapaEm: MOVIDO, ultimoComentarioDoUsuarioEm: new Date("2026-10-01T12:00:00Z") });
    expect(isMovimentacaoLiberada(m)).toBe(false);
  });

  it("comentário no mesmo instante da mudança não libera a próxima", () => {
    const m = marcos({ ultimaMudancaDeEtapaEm: MOVIDO, ultimoComentarioDoUsuarioEm: MOVIDO });
    expect(isMovimentacaoLiberada(m)).toBe(false);
  });
});

describe("isComentarioExigido", () => {
  it("vale para a pessoa logada cuja função tem a obrigação marcada", () => {
    expect(isComentarioExigido({ credencial: "sessao", role: OBRIGADA })).toBe(true);
  });

  it("não vale quando a função não tem a obrigação", () => {
    expect(isComentarioExigido({ credencial: "sessao", role: DISPENSADA })).toBe(false);
  });

  it("não vale para script ou integração com chave de API, mesmo com a obrigação", () => {
    expect(isComentarioExigido({ credencial: "chave-de-api", role: OBRIGADA })).toBe(false);
  });
});

describe("requireComentarioAntesDeMover", () => {
  const makeService = (porChamado: Record<string, MarcosDaMovimentacao | null>) => {
    const consultados: string[] = [];
    const service = createMovimentacaoService({
      findMarcos: async (issueId) => {
        consultados.push(issueId);
        return porChamado[issueId] ?? null;
      },
    });
    return { service, consultados };
  };

  const comentado = marcos({ ultimoComentarioDoUsuarioEm: new Date("2026-10-01T11:00:00Z") });
  const semComentario = marcos({});

  it("recusa com o erro no campo da etapa", async () => {
    const { service } = makeService({ c1: semComentario });
    const erro = await service
      .requireComentarioAntesDeMover({ issueIds: ["c1"], userId: "u1", credencial: "sessao", role: OBRIGADA })
      .catch((e) => e);
    expect(erro).toMatchObject({ status: 400, path: "state_id", message: MENSAGEM_COMENTE_ANTES_DE_MOVER });
  });

  it("libera quem comentou", async () => {
    const { service } = makeService({ c1: comentado });
    await service.requireComentarioAntesDeMover({
      issueIds: ["c1"],
      userId: "u1",
      credencial: "sessao",
      role: OBRIGADA,
    });
  });

  it("em lote, um chamado sem comentário recusa o lote inteiro", async () => {
    const { service } = makeService({ c1: comentado, c2: semComentario });
    const erro = await service
      .requireComentarioAntesDeMover({ issueIds: ["c1", "c2"], userId: "u1", credencial: "sessao", role: OBRIGADA })
      .catch((e) => e);
    expect(erro).toMatchObject({ status: 400, path: "state_id" });
  });

  it("chave de API nem consulta o banco", async () => {
    const { service, consultados } = makeService({ c1: semComentario });
    await service.requireComentarioAntesDeMover({
      issueIds: ["c1"],
      userId: "u1",
      credencial: "chave-de-api",
      role: OBRIGADA,
    });
    expect(consultados).toEqual([]);
  });

  it("função sem a obrigação move sem comentário e nem consulta o banco", async () => {
    const { service, consultados } = makeService({ c1: semComentario });
    await service.requireComentarioAntesDeMover({
      issueIds: ["c1"],
      userId: "u1",
      credencial: "sessao",
      role: DISPENSADA,
    });
    expect(consultados).toEqual([]);
  });

  it("sem chamado para mover, não consulta nada", async () => {
    const { service, consultados } = makeService({});
    await service.requireComentarioAntesDeMover({ issueIds: [], userId: "u1", credencial: "sessao", role: OBRIGADA });
    expect(consultados).toEqual([]);
  });
});
