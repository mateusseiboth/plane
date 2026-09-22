import type { TRoleAction } from "@/services/roles.service";

export type TActionGroup = { label: string; actions: TRoleAction[] };

/**
 * Agrupa o catálogo do backend pelo `group` de cada ação, na ordem em que ele
 * chega. Ação nova registrada no backend aparece aqui sozinha, no grupo dela.
 */
export const groupActionCatalog = (catalog: TRoleAction[]): TActionGroup[] =>
  catalog.reduce<TActionGroup[]>((grupos, acao) => {
    const grupo = grupos.find((g) => g.label === acao.group);
    if (grupo) grupo.actions.push(acao);
    if (!grupo) grupos.push({ label: acao.group, actions: [acao] });
    return grupos;
  }, []);
