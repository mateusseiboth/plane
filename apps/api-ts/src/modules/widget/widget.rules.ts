/**
 * Regras puras do escopo de um widget. `owner_user_id` nulo = global (aparece
 * para todos); preenchido = widget da pessoa que enviou (só na home dela).
 */

/** Listagens de widget: a da home (globais + os meus), as duas abas do admin e a da própria pessoa. */
export const EscopoDaListagem = { HOME: "home", GLOBAL: "global", USERS: "users", MINE: "mine" } as const;
export type EscopoDaListagem = (typeof EscopoDaListagem)[keyof typeof EscopoDaListagem];

type TWhereDoDono = Record<string, unknown>;

const WHERE_DO_ESCOPO: Record<EscopoDaListagem, (userId: string) => TWhereDoDono> = {
  home: (userId) => ({ OR: [{ ownerUserId: null }, { ownerUserId: userId }] }),
  global: () => ({ ownerUserId: null }),
  users: () => ({ ownerUserId: { not: null } }),
  mine: (userId) => ({ ownerUserId: userId }),
};

const ESCOPOS_PELA_QUERY = new Set<string>([EscopoDaListagem.GLOBAL, EscopoDaListagem.USERS]);

/** `?scope=` da listagem: `global`, `users` ou, sem valor conhecido, a da home. */
export function readEscopoDaListagem(valor: unknown): EscopoDaListagem {
  if (typeof valor !== "string" || !ESCOPOS_PELA_QUERY.has(valor)) return EscopoDaListagem.HOME;
  return valor as EscopoDaListagem;
}

export const buildWhereDoEscopo = (escopo: EscopoDaListagem, userId: string): TWhereDoDono =>
  WHERE_DO_ESCOPO[escopo](userId);

/** A aba "De usuários" mostra os widgets privados de todo mundo: só quem administra. */
export const isEscopoSoDeAdmin = (escopo: EscopoDaListagem): boolean => escopo === EscopoDaListagem.USERS;

/** Global é de todos; o privado, de quem enviou e de quem administra. */
export function isWidgetVisivel(widget: { ownerUserId: string | null }, userId: string, podeAdministrar: boolean) {
  if (widget.ownerUserId === null) return true;
  return widget.ownerUserId === userId || podeAdministrar;
}

const toSlug = (nome: string) => nome.toLowerCase().replace(/\s+/g, "-");

/**
 * Onde o bundle fica no storage. O de usuário vai para a pasta da pessoa: duas
 * pessoas podem enviar o mesmo nome e versão sem uma sobrescrever a outra.
 */
export function buildStorageKey(
  manifest: { name: string; version: string },
  entryFilename: string,
  ownerUserId: string | null
): string {
  const caminho = `${toSlug(manifest.name)}/${manifest.version}/${entryFilename}`;
  if (ownerUserId === null) return caminho;
  return `usuarios/${ownerUserId}/${caminho}`;
}

type TDono = { id: string; displayName: string; email: string; firstName?: string; lastName?: string };

const serializeDono = (dono: TDono | null | undefined) =>
  dono
    ? {
        id: dono.id,
        display_name: dono.displayName,
        email: dono.email,
        first_name: dono.firstName ?? "",
        last_name: dono.lastName ?? "",
      }
    : null;

/** Contrato snake_case do widget, com o escopo e o dono (quando é de usuário). */
export function serializeWidget(w: any) {
  const ownerUserId: string | null = w.ownerUserId ?? null;
  return {
    id: w.id,
    name: w.name,
    description: w.description ?? null,
    version: w.version,
    author: w.author,
    entry_file: w.entryFile,
    manifest: w.manifest,
    permissions: w.permissions,
    status: w.status,
    storage_key: w.storageKey,
    created_by: w.createdById ?? null,
    scope: ownerUserId === null ? "global" : "user",
    owner_user_id: ownerUserId,
    owner: serializeDono(w.ownerUser),
    created_at: w.createdAt?.toISOString(),
    updated_at: w.updatedAt?.toISOString(),
  };
}
