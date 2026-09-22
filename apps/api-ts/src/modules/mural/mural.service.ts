/**
 * Service do mural de recados: publicação, edição, leitura, home, aviso
 * obrigatório e confirmação de leitura. A permissão (`mural.publish`) é
 * checada na rota; aqui chega só `canPublish`, que decide se recado inativo
 * existe para quem pergunta. Dependências injetadas para o teste unitário.
 */
import type { MuralDao, MuralRecadoRow } from "@modules/mural/mural.dao";
import { MuralNotFoundError, MuralValidationError } from "@modules/mural/mural.errors";
import {
  buildPeriodoDoMural,
  selectRecadosDaHome,
  validateRecadoInput,
  type RecadoData,
} from "@modules/mural/mural.rules";
import { serializePessoa, serializeRecado, type MuralRecadoDto } from "@modules/mural/mural.serialize";
import { paginate } from "@utils/pagination";
import type { RealtimeEvent } from "@utils/realtime";

export type MuralDeps = {
  dao: MuralDao;
  notify: (opts: { workspaceId: string; recadoId: string; actorId: string; title: string }) => Promise<void>;
  publish: (workspaceId: string, event: RealtimeEvent) => void;
  now: () => Date;
};

export type MuralContext = { workspaceId: string; slug: string; userId: string; canPublish: boolean };

type Body = Record<string, unknown>;

/** Lidos comuns que a home mostra além dos não lidos e dos fixados. */
const LIDOS_NA_HOME = 3;
const POR_PAGINA = 20;

export function createMuralService({ dao, notify, publish, now }: MuralDeps) {
  const hydrate = async (ctx: MuralContext, recados: MuralRecadoRow[]): Promise<MuralRecadoDto[]> => {
    const ids = recados.map((r) => r.id);
    const idsDosAnexos = recados.map((r) => r.attachmentId).filter((id): id is string => !!id);
    const [autores, anexos, leituras] = await Promise.all([
      dao.findUsuarios([...new Set(recados.map((r) => r.authorId))]),
      idsDosAnexos.length ? dao.findAnexos(ctx.workspaceId, idsDosAnexos) : Promise.resolve([]),
      ids.length ? dao.findLeiturasDoUsuario(ctx.userId, ids) : Promise.resolve([]),
    ]);
    const autorPorId = new Map(autores.map((a) => [a.id, a]));
    const anexoPorId = new Map(anexos.map((a) => [a.id, a]));
    const leituraPorRecado = new Map(leituras.map((l) => [l.recadoId, l.readAt]));
    const agora = now();
    return recados.map((r) =>
      serializeRecado(r, {
        slug: ctx.slug,
        now: agora,
        autor: autorPorId.get(r.authorId),
        anexo: r.attachmentId ? anexoPorId.get(r.attachmentId) : undefined,
        readAt: leituraPorRecado.get(r.id),
      }),
    );
  };

  const hydrateOne = async (ctx: MuralContext, recado: MuralRecadoRow) => (await hydrate(ctx, [recado]))[0];

  /** Inativo só existe para quem publica; para os demais é como se não existisse. */
  const findVisible = async (ctx: MuralContext, id: string): Promise<MuralRecadoRow> => {
    const recado = await dao.findRecado(ctx.workspaceId, id);
    if (!recado || (!recado.isActive && !ctx.canPublish)) throw new MuralNotFoundError();
    return recado;
  };

  const requireAnexoDoEspaco = async (ctx: MuralContext, data: RecadoData) => {
    if (!data.attachmentId) return;
    const [anexo] = await dao.findAnexos(ctx.workspaceId, [data.attachmentId]);
    if (anexo) return;
    throw new MuralValidationError([{ path: "attachment_id", message: "Anexo não encontrado." }]);
  };

  const readInput = async (ctx: MuralContext, body: Body, partial: boolean): Promise<RecadoData> => {
    const { data, errors } = validateRecadoInput(body, { partial, now: now() });
    if (errors.length) throw new MuralValidationError(errors);
    await requireAnexoDoEspaco(ctx, data);
    return data;
  };

  const readSet = async (ctx: MuralContext, recados: MuralRecadoRow[]) => {
    const leituras = recados.length ? await dao.findLeiturasDoUsuario(ctx.userId, recados.map((r) => r.id)) : [];
    return new Set(leituras.map((l) => l.recadoId));
  };

  return {
    async list(ctx: MuralContext, query: Record<string, unknown>) {
      const isWithInativos = ctx.canPublish && query.inactive === "true";
      const periodo = buildPeriodoDoMural(query);
      const where = {
        workspaceId: ctx.workspaceId,
        ...(isWithInativos ? {} : { isActive: true }),
        ...(periodo ? { publishedAt: periodo } : {}),
      };
      return paginate({
        query: (skip, take) => dao.findRecados(where, skip, take),
        count: () => dao.countRecados(where),
        cursor: query.cursor as string | undefined,
        perPage: Number(query.per_page) || POR_PAGINA,
        transform: (items) => hydrate(ctx, items),
      });
    },

    async home(ctx: MuralContext) {
      const vigentes = await dao.findVigentes(ctx.workspaceId, now());
      const lidos = await readSet(ctx, vigentes);
      const escolhidos = selectRecadosDaHome(
        vigentes.map((r) => ({ ...r, isRead: lidos.has(r.id) })),
        LIDOS_NA_HOME,
      );
      return hydrate(ctx, escolhidos);
    },

    /** Obrigatórios vigentes que a pessoa ainda não confirmou, do mais antigo ao mais novo. */
    async pendingRequired(ctx: MuralContext) {
      const obrigatorios = await dao.findVigentes(ctx.workspaceId, now(), { isRequired: true });
      const lidos = await readSet(ctx, obrigatorios);
      const pendentes = obrigatorios.filter((r) => !lidos.has(r.id)).reverse();
      return hydrate(ctx, pendentes);
    },

    async get(ctx: MuralContext, id: string) {
      return hydrateOne(ctx, await findVisible(ctx, id));
    },

    async create(ctx: MuralContext, body: Body) {
      const data = await readInput(ctx, body, false);
      const recado = await dao.createRecado({
        ...data,
        title: data.title ?? "",
        workspaceId: ctx.workspaceId,
        authorId: ctx.userId,
      });
      await notify({ workspaceId: ctx.workspaceId, recadoId: recado.id, actorId: ctx.userId, title: recado.title });
      publish(ctx.workspaceId, { entity: "mural", action: "create", id: recado.id, actor: ctx.userId });
      return hydrateOne(ctx, recado);
    },

    async update(ctx: MuralContext, id: string, body: Body) {
      await findVisible(ctx, id);
      const data = await readInput(ctx, body, true);
      const recado = await dao.updateRecado(id, data);
      publish(ctx.workspaceId, { entity: "mural", action: "update", id, actor: ctx.userId });
      return hydrateOne(ctx, recado);
    },

    async markRead(ctx: MuralContext, id: string) {
      await findVisible(ctx, id);
      await dao.saveLeitura(id, ctx.userId);
    },

    /** Confirmação de leitura: membros ativos do espaço, separados em quem leu e quem não leu. */
    async readers(ctx: MuralContext, id: string) {
      await findVisible(ctx, id);
      const [membros, leituras] = await Promise.all([
        dao.findMembrosAtivos(ctx.workspaceId),
        dao.findLeiturasDoRecado(id),
      ]);
      const leituraPorPessoa = new Map(leituras.map((l) => [l.userId, l.readAt]));
      const isLeitor = (p: { id: string }) => leituraPorPessoa.has(p.id);
      return {
        read: membros
          .filter(isLeitor)
          .map((p) => ({ ...serializePessoa(p), read_at: leituraPorPessoa.get(p.id)!.toISOString() })),
        unread: membros.filter((p) => !isLeitor(p)).map(serializePessoa),
      };
    },
  };
}

export type MuralService = ReturnType<typeof createMuralService>;
