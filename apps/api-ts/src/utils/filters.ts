// Issue filter parsing — the frontend packs work-item filters into a single
// URL-encoded JSON query param named `filters` (e.g. {"state_group__in":"backlog"}),
// and sometimes also sends loose params. Neither the project nor the workspace
// issue endpoints parsed `filters`, so filtering was silently ignored.
//
// normalizeFilters() merges both sources into a canonical map; applyIssueFilters()
// translates that map into a Prisma `where` (it needs prisma to resolve
// state groups → state ids).
import prisma from "@db";
import {instanteDaEntrada} from "@utils/prazo";

type FilterMap = Record<string, string[]>;

// Coerce a filter value (CSV string | array | single) into a clean string[].
function toArray(v: unknown): string[] {
  if (v === undefined || v === null || v === "") return [];
  if (Array.isArray(v)) return v.flatMap((x) => toArray(x));
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Map a raw filter key (possibly Django-style with __in/__id suffix) to a canonical key.
function canonicalKey(raw: string): string | null {
  const k = raw.replace(/__(in|id)$/i, "");
  switch (k) {
    case "priority":
      return "priority";
    case "state":
    case "state_id":
      return "state";
    case "state_group":
    case "state__group":
      return "state_group";
    case "assignees":
    case "assignee":
    case "assignee_id":
      return "assignees";
    case "labels":
    case "label":
    case "label_id":
      return "labels";
    case "entity":
    case "entity_id":
      return "entity";
    case "created_by":
    case "created_by_id":
      return "created_by";
    case "mentions":
    case "mention":
    case "mention_id":
      return "mentions";
    case "project":
    case "project_id":
      return "project";
    case "subscriber":
    case "subscriber_id":
      return "subscriber";
    case "cycle":
    case "cycle_id":
      return "cycle";
    case "module":
    case "module_id":
    case "issue_module__module":
      return "module";
    case "start_date":
      return "start_date";
    case "target_date":
      return "target_date";
    default:
      return null;
  }
}

/** Merge the JSON `filters` param and loose query params into a canonical FilterMap. */
export function normalizeFilters(query: Record<string, unknown>): FilterMap {
  const out: FilterMap = {};
  const add = (rawKey: string, value: unknown) => {
    const key = canonicalKey(rawKey);
    if (!key) return;
    const vals = toArray(value);
    if (!vals.length) return;
    out[key] = [...(out[key] ?? []), ...vals];
  };

  // 1. JSON `filters` param. The frontend now wraps conditions in nested
  // `and`/`or` arrays (e.g. {"and":[{"state_group__in":"started"},{"priority__in":"medium"}]}),
  // so walk the tree recursively instead of reading only the top-level object.
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === "and" || k === "or") walk(v);
      else add(k, v);
    }
  };
  if (typeof query.filters === "string" && query.filters) {
    try {
      walk(JSON.parse(query.filters as string));
    } catch {
      // ignore malformed filters json
    }
  }

  // 2. Loose query params (fallback / direct API callers)
  for (const [k, v] of Object.entries(query)) {
    if (k === "filters") continue;
    add(k, v);
  }

  return out;
}

/**
 * Apply a normalized FilterMap onto a Prisma `where`. Mutates and returns `where`.
 * `scope` bounds the state-group lookup to a project or workspace.
 */
export async function applyIssueFilters(
  where: any,
  filters: FilterMap,
  scope: {projectId?: string; workspaceId?: string},
): Promise<any> {
  if (filters.priority?.length) where.priority = {in: filters.priority};
  if (filters.created_by?.length) where.createdById = {in: filters.created_by};
  // entity (cliente/órgão) — ids are workspace-scoped, so the same set works at
  // both the project and the workspace level.
  if (filters.entity?.length) where.entityId = {in: filters.entity};
  if (filters.project?.length) where.projectId = where.projectId ? where.projectId : {in: filters.project};
  if (filters.assignees?.length) where.assignees = {some: {assigneeId: {in: filters.assignees}, deletedAt: null}};
  // IssueMention.mentionId (não `mentionedId`): o nome errado fazia o Prisma
  // rejeitar a query inteira, então filtrar por menção devolvia 500.
  if (filters.mentions?.length) where.mentions = {some: {mentionId: {in: filters.mentions}, deletedAt: null}};
  // subscriber_id é oferecido no painel de filtros de "Meus chamados"; sem esta
  // linha a chave era normalizada e depois descartada (filtro sem efeito).
  if (filters.subscriber?.length) where.subscribers = {some: {subscriberId: {in: filters.subscriber}, deletedAt: null}};
  if (filters.cycle?.length) where.cycleIssues = {some: {cycleId: {in: filters.cycle}, deletedAt: null}};
  if (filters.module?.length) where.moduleIssues = {some: {moduleId: {in: filters.module}, deletedAt: null}};

  // labels — workspace-level views deduplicate labels by name, so a single selected
  // label id must match every same-named label across the workspace's projects.
  if (filters.labels?.length) {
    const labelIdSet = new Set<string>(filters.labels);
    if (scope.workspaceId) {
      const names = await prisma.label.findMany({
        where: {id: {in: filters.labels}, deletedAt: null},
        select: {name: true},
        distinct: ["name"],
      });
      if (names.length) {
        const sameName = await prisma.label.findMany({
          where: {name: {in: names.map((l) => l.name)}, workspaceId: scope.workspaceId, deletedAt: null},
          select: {id: true},
        });
        for (const l of sameName) labelIdSet.add(l.id);
      }
    }
    where.labels = {some: {labelId: {in: [...labelIdSet]}, deletedAt: null}};
  }

  // state ids — combine explicit state ids and state-group resolution
  const stateIdSet = new Set<string>(filters.state ?? []);
  // Workspace-level views deduplicate states by name, so a single selected state id
  // must match every same-named state across the workspace's projects.
  if (scope.workspaceId && filters.state?.length) {
    const names = await prisma.state.findMany({
      where: {id: {in: filters.state}, deletedAt: null},
      select: {name: true},
      distinct: ["name"],
    });
    if (names.length) {
      const sameName = await prisma.state.findMany({
        where: {name: {in: names.map((s) => s.name)}, workspaceId: scope.workspaceId, deletedAt: null},
        select: {id: true},
      });
      for (const s of sameName) stateIdSet.add(s.id);
    }
  }
  if (filters.state_group?.length) {
    const states = await prisma.state.findMany({
      where: {
        group: {in: filters.state_group},
        deletedAt: null,
        ...(scope.projectId ? {projectId: scope.projectId} : {}),
        ...(scope.workspaceId ? {workspaceId: scope.workspaceId} : {}),
      },
      select: {id: true},
    });
    for (const s of states) stateIdSet.add(s.id);
  }
  // Um filtro de estado que não resolve para nenhum id precisa devolver lista
  // VAZIA. Antes o `where.stateId` simplesmente não era aplicado e a listagem
  // vinha inteira — filtrar por um grupo que o projeto não possui parecia
  // "filtro ignorado" em vez de "nenhum resultado".
  if (stateIdSet.size) where.stateId = {in: [...stateIdSet]};
  else if (filters.state?.length || filters.state_group?.length) where.stateId = {in: []};

  // Datas. O front manda os limites de um intervalo como ENTRADAS SEPARADAS —
  // `toArray` quebra a query em vírgulas —, cada uma no formato Django
  // "<data>;<token>" (ex.: "2026-01-01;after,2026-01-31;before"). A versão
  // anterior lia só `raw[0]` e ainda tratava o token como se fosse a segunda
  // data: um intervalo virava igualdade na data inicial e devolvia 0 chamados.
  //
  // Agora que o vencimento tem hora, a borda do intervalo importa: `lte` com
  // "2026-09-30" lido como 00:00 excluiria o chamado que vence às 17h do dia 30
  // — justamente o dia que o usuário pediu. O Django legado comparava contra uma
  // coluna DATE, então `__lte` já era inclusivo no dia inteiro; manter isso é
  // paridade, não invenção. Por isso cada limite pega a sua borda do dia:
  // início para `gte`, fim para `lte`. Ver @utils/prazo.
  /** Cada token diz qual borda do intervalo a data ocupa. */
  const BORDA: Record<string, "gte" | "lte"> = {
    after: "gte",
    from: "gte",
    start: "gte",
    gte: "gte",
    before: "lte",
    to: "lte",
    end: "lte",
    lte: "lte",
  };
  const applyDate = (field: string, raw: string[]) => {
    const range: Record<string, Date> = {};
    const soltas: string[] = [];

    const ehData = (texto?: string) => Boolean(texto) && instanteDaEntrada(texto, "inicio") !== null;
    /** Grava o limite já na borda do dia que ele ocupa. */
    const limite = (lado: "gte" | "lte", texto: string) => {
      const instante = instanteDaEntrada(texto, lado === "gte" ? "inicio" : "fim");
      if (instante) range[lado] = instante;
    };
    const emMilissegundos = (texto: string) => instanteDaEntrada(texto, "inicio")!.getTime();

    for (const entrada of raw) {
      const [primeira, segunda] = entrada.split(";").map((p) => p.trim());
      const token = segunda ? BORDA[segunda.toLowerCase()] : undefined;

      // "<data>;<token>" — o token diz qual borda a data ocupa.
      if (token) {
        limite(token, primeira);
        continue;
      }
      // "<data>;<data>" traz o intervalo inteiro numa entrada só. Com a primeira
      // ilegível, só o limite superior é aproveitável.
      if (ehData(segunda)) {
        if (ehData(primeira)) limite("gte", primeira);
        limite("lte", segunda);
        continue;
      }
      if (ehData(primeira)) soltas.push(primeira);
    }

    // Duas datas sem token ("a,b") também descrevem um intervalo.
    if (soltas.length >= 2) {
      const ordenadas = [...soltas].sort((x, y) => emMilissegundos(x) - emMilissegundos(y));
      if (range.gte === undefined) limite("gte", ordenadas[0]);
      if (range.lte === undefined) limite("lte", ordenadas[ordenadas.length - 1]);
    } else if (soltas.length === 1 && !Object.keys(range).length) {
      // Uma data solta é o DIA INTEIRO. Antes virava igualdade exata, o que só
      // funcionava enquanto todo vencimento era meia-noite cravada; com hora,
      // "vence em 30/09" não casaria com nada.
      limite("gte", soltas[0]);
      limite("lte", soltas[0]);
    }

    if (Object.keys(range).length) where[field] = range;
  };
  if (filters.target_date?.length) applyDate("targetDate", filters.target_date);
  if (filters.start_date?.length) applyDate("startDate", filters.start_date);

  return where;
}

/**
 * Combina a restrição de UM grupo (uma coluna do quadro) com a que o filtro já
 * impôs ao mesmo campo, em vez de substituí-la.
 *
 * As respostas agrupadas montavam cada coluna com `{...where, stateId: <estados
 * do grupo>}`, o que apagava o `stateId` vindo do filtro. Resultado visível:
 * filtrar por "Triagem" devolvia `total_count: 23` e, ao lado, as colunas
 * "Em andamento 1573" e "Concluído 49370" — a listagem parecia ignorar o filtro.
 *
 * Interseção vazia é um resultado legítimo: significa que aquela coluna não tem
 * nada dentro do filtro, e `{in: []}` é exatamente o que a consulta precisa.
 */
export function restringirAoGrupo(doFiltro: unknown, doGrupo: unknown): unknown {
  const lista = (v: unknown): string[] | null => {
    if (typeof v === "string") return [v];
    if (Array.isArray(v)) return v as string[];
    if (v && typeof v === "object" && Array.isArray((v as {in?: unknown}).in)) return (v as {in: string[]}).in;
    return null;
  };

  const grupo = lista(doGrupo);
  if (!grupo) return doGrupo;

  const filtro = lista(doFiltro);
  if (!filtro) return {in: grupo};

  return {in: grupo.filter((v) => filtro.includes(v))};
}
