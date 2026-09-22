/**
 * Service da ouvidoria: registro vindo do robô (CNPJ → entidade), lista da
 * tela, marcar como lida e contador de não lidas. A permissão
 * (`ouvidoria.read`) é checada na rota; a autenticação de serviço, na rota
 * interna. Dependências injetadas para o teste unitário.
 */
import type { OuvidoriaDao, OuvidoriaRow } from "@modules/ouvidoria/ouvidoria.dao";
import {
  OUVIDORIA_KIND_LABEL,
  buildOuvidoriaWhere,
  validateOuvidoriaInput,
  type OuvidoriaKind,
} from "@modules/ouvidoria/ouvidoria.rules";
import { FieldValidationError, NotFoundError, requireNoFieldErrors } from "@utils/erro-de-dominio";
import { paginate } from "@utils/pagination";
import type { RealtimeEvent } from "@utils/realtime";

export type OuvidoriaDeps = {
  dao: OuvidoriaDao;
  publish: (workspaceId: string, event: RealtimeEvent) => void;
  now: () => Date;
};

export type OuvidoriaContext = { workspaceId: string; userId: string };

type Nomeado = { id: string; name: string };
type Pessoa = { id: string; displayName: string };

const POR_PAGINA = 20;

export const serializeOuvidoria = (o: OuvidoriaRow, entidade?: Nomeado, leitor?: Pessoa) => ({
  id: o.id,
  created_at: o.createdAt.toISOString(),
  kind: o.kind,
  kind_label: OUVIDORIA_KIND_LABEL[o.kind as OuvidoriaKind] ?? o.kind,
  entity: entidade ? { id: entidade.id, name: entidade.name } : null,
  cnpj: o.cnpj,
  name: o.name,
  phone: o.phone,
  message: o.message,
  protocol: o.protocol,
  chat_session_id: o.chatSessionId,
  is_read: !!o.readAt,
  read_at: o.readAt?.toISOString() ?? null,
  read_by: leitor ? { id: leitor.id, display_name: leitor.displayName } : null,
});

export type OuvidoriaDto = ReturnType<typeof serializeOuvidoria>;

const byId = <T extends { id: string }>(lista: T[]) => new Map(lista.map((i) => [i.id, i]));
const idsOf = (valores: Array<string | null>) => [...new Set(valores.filter((v): v is string => !!v))];

export function createOuvidoriaService({ dao, publish, now }: OuvidoriaDeps) {
  const hydrate = async (linhas: OuvidoriaRow[]): Promise<OuvidoriaDto[]> => {
    const [entidades, leitores] = await Promise.all([
      dao.findEntidades(idsOf(linhas.map((l) => l.entityId))),
      dao.findUsuarios(idsOf(linhas.map((l) => l.readById))),
    ]);
    const entidadePorId = byId(entidades);
    const leitorPorId = byId(leitores);
    return linhas.map((l) =>
      serializeOuvidoria(
        l,
        l.entityId ? entidadePorId.get(l.entityId) : undefined,
        l.readById ? leitorPorId.get(l.readById) : undefined
      )
    );
  };

  const findOrFail = async (workspaceId: string, id: string) => {
    const linha = await dao.findOne(workspaceId, id);
    if (!linha) throw new NotFoundError("Registro da ouvidoria não encontrado.");
    return linha;
  };

  return {
    async create(workspaceId: string, body: Record<string, unknown>) {
      const { data, errors } = validateOuvidoriaInput(body);
      requireNoFieldErrors(errors);
      const entidade = await dao.findEntidadePorCnpj(workspaceId, data.cnpj);
      if (!entidade) {
        throw new FieldValidationError([
          { path: "cnpj", message: "CNPJ não encontrado. Confira os números e envie de novo." },
        ]);
      }
      const linha = await dao.create({ ...data, workspaceId, entityId: entidade.id });
      publish(workspaceId, { entity: "ouvidoria", action: "create", id: linha.id });
      return serializeOuvidoria(linha, entidade);
    },

    async list(workspaceId: string, query: Record<string, unknown>) {
      const where = buildOuvidoriaWhere(workspaceId, query);
      return paginate({
        query: (skip, take) => dao.findMany(where, skip, take),
        count: () => dao.count(where),
        cursor: query.cursor as string | undefined,
        perPage: Number(query.per_page) || POR_PAGINA,
        transform: hydrate,
      });
    },

    async countUnread(workspaceId: string) {
      return { count: await dao.count({ workspaceId, readAt: null }) };
    },

    /** A primeira leitura fica: marcar de novo não troca quem leu. */
    async markRead(ctx: OuvidoriaContext, id: string) {
      const linha = await findOrFail(ctx.workspaceId, id);
      if (linha.readAt) return (await hydrate([linha]))[0];
      const lida = await dao.markRead(id, { readAt: now(), readById: ctx.userId });
      publish(ctx.workspaceId, { entity: "ouvidoria", action: "update", id, actor: ctx.userId });
      return (await hydrate([lida]))[0];
    },
  };
}

export type OuvidoriaService = ReturnType<typeof createOuvidoriaService>;
