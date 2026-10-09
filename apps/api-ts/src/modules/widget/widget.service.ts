/**
 * Service do registro de widgets: envio (global ou "meu"), listagens por
 * escopo, visibilidade do widget privado e a passagem para global. As rotas só
 * leem a requisição e chamam daqui. Dependências injetadas para o teste.
 */
import type { WidgetDao } from "@modules/widget/widget.dao";
import {
  buildStorageKey,
  buildWhereDoEscopo,
  EscopoDaListagem,
  isEscopoSoDeAdmin,
  isWidgetVisivel,
  readEscopoDaListagem,
  serializeWidget,
} from "@modules/widget/widget.rules";
import { paginate } from "@utils/pagination";
import type { MaybeAdminUser } from "@utils/registry-access";
import type { WidgetStorageDriver } from "@utils/widget-storage";
import { extractWidgetZip } from "@utils/widget-zip";
import { validateManifest } from "@utils/widget-manifest";

type TDeps = {
  dao: WidgetDao;
  storage: Pick<WidgetStorageDriver, "put">;
  isUploader: (user: MaybeAdminUser) => Promise<boolean>;
};

type TFiltrosDaListagem = { name?: string; author?: string; status?: string; version?: string; cursor?: string };

const failWith = (status: number, message: string) => Object.assign(new Error(message), { status });

const NAO_ENCONTRADO = "Widget não encontrado.";

/** Filtros opcionais da listagem: cada um só entra quando veio na query. */
const FILTROS: Record<keyof Omit<TFiltrosDaListagem, "cursor">, (valor: string) => Record<string, unknown>> = {
  name: (valor) => ({ name: { contains: valor, mode: "insensitive" } }),
  author: (valor) => ({ author: { contains: valor, mode: "insensitive" } }),
  status: (valor) => ({ status: valor }),
  version: (valor) => ({ version: valor }),
};

const buildWhereDosFiltros = (query: TFiltrosDaListagem): Record<string, unknown> =>
  Object.assign(
    {},
    ...Object.entries(FILTROS)
      .filter(([campo]) => query[campo as keyof TFiltrosDaListagem])
      .map(([campo, build]) => build(query[campo as keyof TFiltrosDaListagem] as string))
  );

export const createWidgetService = ({ dao, storage, isUploader }: TDeps) => {
  /** Admin de instância/superusuário sempre; o resto, pela regra do uploader (TI, plugin.manage). */
  const canAdministrar = (user: MaybeAdminUser) => isUploader(user);

  const requireAdministrar = async (user: MaybeAdminUser) => {
    if (!(await canAdministrar(user))) throw failWith(403, "Somente quem administra os widgets pode fazer isso.");
  };

  /** O widget vivo, se a pessoa pode vê-lo. O privado de outra pessoa responde como inexistente. */
  const findVisivel = async (id: string, user: MaybeAdminUser) => {
    const widget = await dao.findVivo(id);
    if (!widget) throw failWith(404, NAO_ENCONTRADO);
    const isDeOutraPessoa = widget.ownerUserId !== null && widget.ownerUserId !== user.id;
    const podeAdministrar = isDeOutraPessoa && (await canAdministrar(user));
    if (!isWidgetVisivel(widget, user.id, podeAdministrar)) throw failWith(404, NAO_ENCONTRADO);
    return widget;
  };

  const requireVersaoNova = async (alvo: { name: string; version: string; ownerUserId: string | null }) => {
    if (await dao.findMesmaVersao(alvo)) {
      throw failWith(409, `O widget "${alvo.name}" na versão ${alvo.version} já existe.`);
    }
  };

  const list = (where: Record<string, unknown>, cursor?: string) =>
    paginate({
      query: (skip, take) => dao.findPagina(where, skip, take),
      count: () => dao.count(where),
      cursor,
      transform: (items) => items.map(serializeWidget),
    });

  return {
    findVisivel,

    /**
     * Envio do pacote. `ownerUserId` nulo publica para todos; com dono, o
     * widget fica só na home da pessoa. Validação e limites são os mesmos.
     */
    async upload(zip: Buffer, user: MaybeAdminUser, ownerUserId: string | null) {
      const { manifest: rawManifest, entryBuffer, entryFilename } = extractWidgetZip(zip);
      const manifest = validateManifest(rawManifest);
      await requireVersaoNova({ name: manifest.name, version: manifest.version, ownerUserId });

      const storageKey = buildStorageKey(manifest, entryFilename, ownerUserId);
      await storage.put(storageKey, entryBuffer);

      const widget = await dao.createWithVersao({
        name: manifest.name,
        description: manifest.description || null,
        version: manifest.version,
        author: manifest.author,
        entryFile: entryFilename,
        manifest: rawManifest,
        permissions: manifest.permissions,
        storageKey,
        createdById: user.id,
        ownerUserId,
      });
      return serializeWidget(widget);
    },

    /** Só quem participa de algum espaço ativo tem widgets próprios. */
    async requireMembroAtivo(user: MaybeAdminUser) {
      if (!(await dao.isMembroAtivo(user.id))) {
        throw failWith(403, "Para enviar um widget, você precisa participar de um espaço ativo.");
      }
    },

    /** Listagem por `?scope=`: home (globais + os meus), `global` ou `users` (só quem administra). */
    async listByEscopo(query: TFiltrosDaListagem & { scope?: string }, user: MaybeAdminUser) {
      const escopo = readEscopoDaListagem(query.scope);
      if (isEscopoSoDeAdmin(escopo)) await requireAdministrar(user);
      const where = { deletedAt: null, ...buildWhereDoEscopo(escopo, user.id), ...buildWhereDosFiltros(query) };
      return list(where, query.cursor);
    },

    listMine(user: MaybeAdminUser, cursor?: string) {
      return list({ deletedAt: null, ...buildWhereDoEscopo(EscopoDaListagem.MINE, user.id) }, cursor);
    },

    /** A própria pessoa remove o próprio widget. O de outra pessoa responde como inexistente. */
    async removeMine(id: string, user: MaybeAdminUser) {
      const widget = await dao.findVivo(id);
      if (widget?.ownerUserId !== user.id) throw failWith(404, NAO_ENCONTRADO);
      await dao.softDelete(id);
    },

    /** Widget de usuário passa a valer para todos. Mesmo nome e versão já globais recusa. */
    async makeGlobal(id: string, user: MaybeAdminUser) {
      await requireAdministrar(user);
      const widget = await findVisivel(id, user);
      if (widget.ownerUserId === null) throw failWith(400, "O widget já aparece para todos.");
      await requireVersaoNova({ name: widget.name, version: widget.version, ownerUserId: null });
      return serializeWidget(await dao.setDono(id, null));
    },

    /**
     * Remoção pela tela de administração. O global segue exigindo admin da
     * instância; o de usuário também pode ser removido por quem administra os widgets.
     */
    async removeComoAdmin(id: string, user: MaybeAdminUser) {
      const widget = await findVisivel(id, user);
      const isAdminDaInstancia = user.isInstanceAdmin || user.isSuperuser;
      const podeRemover = isAdminDaInstancia || (widget.ownerUserId !== null && (await canAdministrar(user)));
      if (!podeRemover) throw failWith(403, "Apenas administradores da instância podem gerenciar widgets.");
      await dao.softDelete(id);
      return widget;
    },
  };
};

export type WidgetService = ReturnType<typeof createWidgetService>;
