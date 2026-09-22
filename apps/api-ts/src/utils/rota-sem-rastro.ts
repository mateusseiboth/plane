/**
 * Rotas que não deixam rastro de quem chamou. Hoje só o registro de denúncia:
 * na anônima, qualquer instante preciso gravado ao lado do usuário (o "último
 * uso" da chave de API, por exemplo) permitiria descobrir o autor.
 */
const ROTAS_SEM_RASTRO: Array<{ method: string; path: RegExp }> = [
  { method: "POST", path: /^\/api\/v1\/workspaces\/[^/]+\/denuncias\/?$/ },
];

export const isRotaSemRastro = (method: string, pathname: string): boolean =>
  ROTAS_SEM_RASTRO.some((r) => r.method === method.toUpperCase() && r.path.test(pathname));
