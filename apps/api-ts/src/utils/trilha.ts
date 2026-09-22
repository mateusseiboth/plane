/**
 * Trilha de atividades do chamado (`issue_activities`) na forma que a tela lê
 * (`IIssueActivity`, snake_case).
 *
 * O perfil ("Seu trabalho") devolvia o objeto CRU do Prisma: em camelCase o
 * autor sumia (avatar "?" e nome vazio) e a frase saía truncada, porque
 * `new_value` chegava `undefined` — "definiu o estado como" sem nada depois.
 *
 * `IssueActivity` só guarda os IDs do autor e do projeto (não há relação no
 * schema), então as referências são carregadas em lote por `readReferenciasDaTrilha`
 * — uma consulta por coleção, nunca uma por linha.
 */
import prisma from "@db";
import { isoDate } from "@utils/serialize";

/**
 * Marcadores internos da trilha: existem para o sistema se reencontrar
 * (idempotência da réplica, resposta dispensada no portal) e não têm frase para
 * o usuário. Na tela saíam como uma linha só com o avatar.
 */
const CAMPOS_INTERNOS = ["portal_resposta", "intake_replica"];

/** Filtro Prisma que tira os marcadores internos da trilha exibida. */
export const withoutMarcadorInterno = { field: { notIn: CAMPOS_INTERNOS } };

/** O chamado citado pela frase, para o link "PROJ-12 Título". */
export const ATIVIDADE_INCLUDE = {
  issue: { select: { id: true, name: true, sequenceId: true, priority: true, descriptionHtml: true } },
} as const;

const AUTOR_SELECT = {
  id: true,
  displayName: true,
  firstName: true,
  lastName: true,
  email: true,
  avatarUrl: true,
  isBotUser: true,
} as const;

const PROJETO_SELECT = { id: true, name: true, identifier: true, iconProp: true } as const;

type Autor = { [K in keyof typeof AUTOR_SELECT]: unknown };
type Projeto = { [K in keyof typeof PROJETO_SELECT]: unknown };

export type ReferenciasDaTrilha = {
  autores: Map<string, Autor>;
  projetos: Map<string, Projeto>;
  workspace: { id: string; name: string; slug: string };
};

const idsUnicos = (valores: (string | null | undefined)[]): string[] => [
  ...new Set(valores.filter((v): v is string => !!v)),
];

/** Autor e projeto de todas as linhas de uma vez (o modelo só guarda os ids). */
export async function readReferenciasDaTrilha(
  atividades: { actorId?: string | null; projectId?: string | null }[],
  workspace: { id: string; name: string; slug: string }
): Promise<ReferenciasDaTrilha> {
  const [autores, projetos] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: idsUnicos(atividades.map((a) => a.actorId)) } },
      select: AUTOR_SELECT,
    }),
    prisma.project.findMany({
      where: { id: { in: idsUnicos(atividades.map((a) => a.projectId)) } },
      select: PROJETO_SELECT,
    }),
  ]);
  return {
    autores: new Map(autores.map((a) => [a.id, a as Autor])),
    projetos: new Map(projetos.map((p) => [p.id, p as Projeto])),
    workspace,
  };
}

function buildAutor(autor: Autor | undefined) {
  if (!autor) return null;
  const a = autor as Record<string, any>;
  return {
    id: a.id,
    display_name: a.displayName ?? "",
    first_name: a.firstName ?? "",
    last_name: a.lastName ?? "",
    email: a.email ?? "",
    avatar_url: a.avatarUrl ?? null,
    is_bot: a.isBotUser ?? false,
  };
}

function buildProjeto(projeto: Projeto | undefined) {
  if (!projeto) return null;
  const p = projeto as Record<string, any>;
  return { id: p.id, name: p.name, identifier: p.identifier, logo_props: p.iconProp ?? {} };
}

function buildChamado(issue: Record<string, any> | null | undefined) {
  if (!issue) return null;
  return {
    id: issue.id,
    name: issue.name,
    sequence_id: issue.sequenceId ?? 0,
    priority: issue.priority ?? null,
    description_html: issue.descriptionHtml ?? "<p></p>",
    type_id: null,
  };
}

/** Uma linha da trilha na forma de `IIssueActivity`. */
export function serializeAtividade(a: any, refs: ReferenciasDaTrilha): Record<string, unknown> {
  return {
    id: a.id,
    workspace: a.workspaceId ?? null,
    workspace_detail: refs.workspace,
    project: a.projectId ?? null,
    project_detail: buildProjeto(refs.projetos.get(a.projectId)),
    issue: a.issueId ?? null,
    issue_detail: buildChamado(a.issue),
    actor: a.actorId ?? null,
    actor_detail: buildAutor(refs.autores.get(a.actorId)),
    verb: a.verb,
    field: a.field ?? null,
    old_value: a.oldValue ?? null,
    new_value: a.newValue ?? null,
    // A trilha não guarda o id do alvo (etiqueta, ciclo, módulo, responsável);
    // a tela usa o identificador só para colorir a pílula e montar o link.
    old_identifier: null,
    new_identifier: null,
    comment: a.comment ?? "",
    epoch: a.epoch ?? null,
    issue_comment: a.issueCommentId ?? null,
    attachments: [],
    created_at: isoDate(a.createdAt),
    updated_at: isoDate(a.updatedAt),
    created_by: a.actorId ?? null,
    updated_by: a.actorId ?? null,
  };
}

/** Serializa a página inteira, carregando autor e projeto em lote. */
export async function serializeTrilha(
  atividades: any[],
  workspace: { id: string; name: string; slug: string }
): Promise<Record<string, unknown>[]> {
  const refs = await readReferenciasDaTrilha(atividades, workspace);
  return atividades.map((a) => serializeAtividade(a, refs));
}
