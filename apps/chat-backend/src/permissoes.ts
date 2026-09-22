/**
 * Permissões do chat pela matriz de ações do Plane (permissões v2).
 *
 * O chat perguntava pelo NÚMERO do papel (`>= 6` atende, `>= 15` gerencia,
 * `>= 20` administra) e por isso ignorava a função configurada na tela de
 * Funções e as exceções por pessoa. Agora são ações do catálogo do api-ts
 * (`apps/api-ts/src/utils/permissions.ts`), lidas do banco compartilhado:
 *
 *  - `chat.atender`     aparece nas listas, recebe conversa da fila e conecta.
 *  - `chat.gerenciar`   transfere atendimento e lê os relatórios.
 *  - `chat.administrar` vê fila, robô e avaliação, e configura o chat.
 *  - `chat.disparo`     dispara mensagens em massa (src/disparo/).
 *
 * O container do chat não leva o código do api-ts, então as chaves e a
 * regra de exceção estão repetidas aqui; `tests/permissoes-do-chat.test.ts`
 * compara as duas e quebra se divergirem. Os padrões por função são gravados
 * pelo api-ts no boot. Sem função gravada, o chat nega.
 */

import prisma from "@db";

export const CHAT_ACTION = {
  ATENDER: "chat.atender",
  GERENCIAR: "chat.gerenciar",
  ADMINISTRAR: "chat.administrar",
  DISPARO: "chat.disparo",
} as const;
export type ChatAction = (typeof CHAT_ACTION)[keyof typeof CHAT_ACTION];

const CHAT_ACTIONS = new Set<string>(Object.values(CHAT_ACTION));

const parseList = (raw: unknown): string[] => {
  const valor = typeof raw === "string" ? safeJson(raw) : raw;
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
};

function safeJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

/** Mesma regra do api-ts (`applyMemberOverrides`), restrita às ações do chat. */
export function applyChatOverrides(
  base: readonly string[],
  overrides: { granted: unknown; revoked: unknown }
): string[] {
  const negadas = new Set(parseList(overrides.revoked));
  const somadas = [...base, ...parseList(overrides.granted)].filter((a) => CHAT_ACTIONS.has(a));
  return [...new Set(somadas)].filter((a) => !negadas.has(a));
}

type LinhaDePermissao = { permissions: unknown; granted: unknown; revoked: unknown };

/** Ações de chat efetivas de uma associação. Sem função gravada (`null`), nenhuma. */
export function resolveChatActions(linha: LinhaDePermissao): string[] {
  if (linha.permissions == null) return [];
  return applyChatOverrides(parseList(linha.permissions), { granted: linha.granted, revoked: linha.revoked });
}

type LinhaDoMembro = LinhaDePermissao & { id: string; name: string };

/**
 * Membros ativos do espaço com a função efetiva de cada um: a vinculada
 * (`workflow_role_id`) ou, sem vínculo, a de mesmo nível, como o `resolveRole`
 * do api-ts. `slug` é o slug do workspace do Plane (o `workspaceId` do chat).
 */
async function readMembros(slug: string, userId?: string): Promise<LinhaDoMembro[]> {
  const filtroUsuario = userId ?? null;
  return (await prisma.$queryRaw`
    SELECT u.id::text AS id,
           COALESCE(NULLIF(u.display_name, ''), NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email) AS name,
           COALESCE(vinculada.permissions, por_nivel.permissions) AS permissions,
           wm.granted_actions AS granted,
           wm.revoked_actions AS revoked
    FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    JOIN users u ON u.id = wm.member_id
    LEFT JOIN workflow_roles vinculada
      ON vinculada.id = wm.workflow_role_id AND vinculada.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT r.permissions FROM workflow_roles r
      WHERE r.workspace_id = wm.workspace_id AND r.level = wm.role AND r.deleted_at IS NULL
      ORDER BY r.is_system DESC LIMIT 1
    ) por_nivel ON true
    WHERE w.slug = ${slug} AND wm.deleted_at IS NULL AND wm.is_active = true
      AND (${filtroUsuario}::text IS NULL OR wm.member_id::text = ${filtroUsuario}::text)
    ORDER BY name ASC`) as LinhaDoMembro[];
}

/** A pessoa tem a ação de chat neste espaço? Banco fora do ar = não. */
export async function hasChatAction(slug: string, userId: string, action: ChatAction): Promise<boolean> {
  try {
    const [linha] = await readMembros(slug, userId);
    return !!linha && resolveChatActions(linha).includes(action);
  } catch (e) {
    console.error("[permissoes] hasChatAction", e);
    return false;
  }
}

export type Atendente = { id: string; name: string };

/**
 * Todo mundo do espaço que atende (`chat.atender`), em ordem alfabética. Fonte
 * única das listas de atendentes (transferência, fila). Banco fora do ar
 * devolve lista vazia: tela sem opção, não tela com a equipe errada.
 */
export async function listAtendentes(slug: string): Promise<Atendente[]> {
  try {
    const membros = await readMembros(slug);
    return membros
      .filter((m) => resolveChatActions(m).includes(CHAT_ACTION.ATENDER))
      .map(({ id, name }) => ({ id, name }));
  } catch (e) {
    console.error("[permissoes] listAtendentes", e);
    return [];
  }
}
