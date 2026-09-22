/**
 * Service das chaves de API dos painéis de TV: criação (o valor aparece uma
 * vez), revogação, listagem e a autenticação de cada requisição do painel.
 *
 * A comparação é pelo HASH, nunca pelo valor: o banco não guarda a chave. Erro
 * de chave é sempre o mesmo, `ChaveDePainelInvalidaError` — dizer "existe, mas
 * está revogada" ajudaria quem está tentando adivinhar.
 *
 * Dependências injetadas (DAO, auditoria, relógio, limitador) para o teste
 * unitário rodar sem banco.
 */

import { AUDIT_ACTIONS, type AuditInput } from "@utils/audit";
import type { ChaveDao, ChaveGravada } from "@modules/painel-tv/chaves/chave.dao";
import {
  generateChave,
  hashChave,
  isEscopoLiberado,
  parseChaveInput,
  readUltimos4,
  type PainelDaChave,
} from "@modules/painel-tv/chaves/chave";
import {
  ChaveDePainelInvalidaError,
  ChaveDePainelNaoEncontradaError,
  MuitasRequisicoesDoPainelError,
  PainelNaoLiberadoError,
  ValidacaoDaChaveError,
} from "@modules/painel-tv/chaves/chave.errors";

export const ENTIDADE_AUDITADA = "panel_key";

/** Folga alta: a TV recarrega a cada minuto e a cada mudança de chamado. */
const LIMITE_POR_MINUTO = 120;

export type ChaveDeps = {
  dao: ChaveDao;
  audit: (input: AuditInput) => Promise<void>;
  now: () => Date;
  rateLimit: (chave: string, maximo: number, janelaMs: number) => boolean;
};

export type ChaveContexto = {
  workspaceId: string;
  slug: string;
  userId: string;
  headers?: Record<string, string | undefined>;
};

export type PedidoDoPainel = {
  valor: string | null;
  /** `null` só para o "quem sou eu" da página, que ainda não escolheu painel. */
  painel: PainelDaChave | null;
  workspaceId: string;
  ip: string;
};

export type ChaveAutenticada = { id: string; workspaceId: string; name: string; scopes: string[] };

export function serializeChave(chave: ChaveGravada) {
  return {
    id: chave.id,
    name: chave.name,
    scopes: chave.scopes,
    is_active: chave.isActive,
    last_four: chave.lastFour,
    last_used_at: chave.lastUsedAt?.toISOString() ?? null,
    created_at: chave.createdAt.toISOString(),
    created_by_id: chave.createdById,
    revoked_at: chave.revokedAt?.toISOString() ?? null,
  };
}

export function createChaveService({ dao, audit, now, rateLimit }: ChaveDeps) {
  const registrar = (ctx: ChaveContexto, chave: ChaveGravada, action: string) =>
    audit({
      workspaceId: ctx.workspaceId,
      entity: ENTIDADE_AUDITADA,
      entityId: chave.id,
      action,
      actor: { id: ctx.userId },
      headers: ctx.headers,
      metadata: { name: chave.name, scopes: chave.scopes },
    });

  return {
    async list(ctx: ChaveContexto) {
      const chaves = await dao.findChaves(ctx.workspaceId);
      return { results: chaves.map(serializeChave) };
    },

    /** O valor em claro sai daqui e nunca mais: só o hash é gravado. */
    async create(ctx: ChaveContexto, body: Record<string, unknown>) {
      const { data, erros } = parseChaveInput(body);
      if (erros.length) throw new ValidacaoDaChaveError(erros);
      const valor = generateChave();
      const chave = await dao.createChave({
        workspaceId: ctx.workspaceId,
        name: data.name,
        keyHash: hashChave(valor),
        lastFour: readUltimos4(valor),
        scopes: data.scopes,
        createdById: ctx.userId,
      });
      await registrar(ctx, chave, AUDIT_ACTIONS.CREATE);
      return { ...serializeChave(chave), key: valor };
    },

    async revoke(ctx: ChaveContexto, id: string) {
      const chave = await dao.findChave(ctx.workspaceId, id);
      if (!chave) throw new ChaveDePainelNaoEncontradaError();
      const revogada = await dao.revokeChave(id, { isActive: false, revokedAt: now(), revokedById: ctx.userId });
      await registrar(ctx, revogada, AUDIT_ACTIONS.DELETE);
      return serializeChave(revogada);
    },

    /** Porta de entrada de toda rota de painel. Devolve a chave ou recusa. */
    async authenticate({ valor, painel, workspaceId, ip }: PedidoDoPainel): Promise<ChaveAutenticada> {
      if (!valor) throw new ChaveDePainelInvalidaError();
      // Limite por IP primeiro: chave errada em rajada não pode custar uma ida
      // ao banco por tentativa.
      if (!rateLimit(`painel-ip:${ip}`, LIMITE_POR_MINUTO, 60_000)) throw new MuitasRequisicoesDoPainelError();

      const chave = await dao.findPorHash(hashChave(valor));
      if (!chave || !chave.isActive || chave.workspaceId !== workspaceId) throw new ChaveDePainelInvalidaError();
      if (!rateLimit(`painel-chave:${chave.id}`, LIMITE_POR_MINUTO, 60_000)) throw new MuitasRequisicoesDoPainelError();
      if (painel && !isEscopoLiberado(chave.scopes, painel)) throw new PainelNaoLiberadoError();

      void dao.touchChave(chave.id, now());
      return { id: chave.id, workspaceId: chave.workspaceId, name: chave.name, scopes: chave.scopes };
    },
  };
}

export type ChaveService = ReturnType<typeof createChaveService>;
