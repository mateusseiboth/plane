/**
 * Registro citado pela trilha de auditoria: rótulo legível e rota que o abre.
 *
 * A trilha guarda só `entity` + `entity_id`. Na tela isso virava "Chamado
 * b9cc59d1" e o administrador não tinha como saber QUAL chamado a pessoa viu
 * ou alterou. Aqui cada tipo diz como se chama e onde mora, num mapa de
 * estratégias: tipo novo entra como mais uma entrada, sem mexer no resto.
 *
 * A resolução é em LOTE: uma consulta por tipo por página, nunca uma por linha.
 */

import prisma from "@db";

/** O que a tela precisa para mostrar e abrir o registro citado. */
export type RegistroDaAuditoria = {
  tipo: string;
  id: string;
  rotulo: string;
  /** Rota no web, ou null quando o tipo não tem tela (ou o registro sumiu). */
  caminho: string | null;
};

/** O mínimo da linha da trilha para descrever o registro. */
export type LinhaDaTrilha = {
  entity: string;
  entityId: string;
  /** Vem do banco como JSON solto; é lido sempre por `metadadoDe`. */
  metadata?: unknown;
  changes?: unknown;
};

/** Leitura tolerante do JSON gravado na trilha. */
const metadadoDe = (linha: LinhaDaTrilha, campo: string): unknown =>
  (linha.metadata as Record<string, unknown> | null | undefined)?.[campo];

type Carregador = (ids: string[], workspaceId: string) => Promise<Map<string, any>>;

type EstrategiaDeRegistro = {
  /** Nome do tipo na tela ("Chamado", "Solicitação"). */
  titulo: string;
  /** Carrega em lote os registros daquele tipo. */
  load: Carregador;
  /** Identificação legível do registro (o título já vem na frente). */
  describe: (dado: any, linha: LinhaDaTrilha) => string;
  /** Rota do web que abre o registro, ou null quando não há tela. */
  caminho: (dado: any, linha: LinhaDaTrilha, slug: string) => string | null;
};

/** Chave de agrupamento: o mesmo id pode ser de tipos diferentes. */
export const chaveDoRegistro = (linha: Pick<LinhaDaTrilha, "entity" | "entityId">) =>
  `${linha.entity}:${linha.entityId}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Só o começo do id: o suficiente para conferir, sem poluir a tabela. */
const curto = (id: string) => id.slice(0, 8);

const joinRotulo = (...partes: (string | null | undefined)[]) => partes.filter(Boolean).join(" ");

/** O rótulo é linha de tabela: título longo vira resumo. */
function tituloCurto(texto: unknown, maxLen = 60): string {
  const limpo = String(texto ?? "").trim();
  if (limpo.length <= maxLen) return limpo;
  return `${limpo.slice(0, maxLen)}…`;
}

const entreParenteses = (texto: unknown) => {
  const limpo = String(texto ?? "").trim();
  return limpo ? `(${limpo})` : "";
};

/**
 * Carga em lote de um tipo. Falha aqui nunca derruba a listagem: sem o registro
 * a linha continua aparecendo, só sem link.
 */
function carregaPor<T extends { id: string }>(find: (ids: string[], workspaceId: string) => Promise<T[]>): Carregador {
  return async (ids, workspaceId) => {
    const uuids = ids.filter((id) => UUID.test(id));
    if (uuids.length === 0) return new Map();
    const encontrados = await find(uuids, workspaceId).catch((e) => {
      console.error("[audit] falha ao resolver registros da trilha:", e);
      return [] as T[];
    });
    return new Map(encontrados.map((registro) => [registro.id, registro]));
  };
}

/** Tipo sem registro próprio no banco: a linha da trilha já diz tudo. */
const semCarga: Carregador = async (ids) => new Map(ids.map((id) => [id, {}]));

/** Identificador de chamado como o usuário lê: "QLT-12". */
const codigoDoChamado = (identifier: unknown, sequenceId: unknown) =>
  `${String(identifier ?? "").trim()}-${sequenceId ?? 0}`.replace(/^-/, "");

/** Número anual do chamado ("34-2026"), quando o gatilho já numerou. */
function numeroAnual(dado: any): string {
  if (!dado?.ticketSequence || !dado?.ticketYear) return "";
  return `(${dado.ticketSequence}-${dado.ticketYear})`;
}

const caminhoDoChamado = (slug: string, projectId: unknown, issueId: unknown) =>
  `/${slug}/projects/${projectId}/issues/${issueId}`;

/**
 * Aba da triagem em que o item ainda aparece. Solicitação já aceita ou recusada
 * sai da lista de abertas: sem a aba certa o link abre a tela vazia.
 */
const ABA_DA_TRIAGEM: Record<string, string> = { "-2": "open", "0": "open" };
const abaDaTriagem = (status: unknown) => ABA_DA_TRIAGEM[String(status ?? -2)] ?? "closed";

const MANIFESTACAO: Record<string, string> = { sugestao: "Sugestão", reclamacao: "Reclamação" };

const nomeDaPessoa = (dado: any) =>
  `${dado?.firstName ?? ""} ${dado?.lastName ?? ""}`.trim() || dado?.displayName || dado?.email || "";

const ESTRATEGIAS: Record<string, EstrategiaDeRegistro> = {
  issue: {
    titulo: "Chamado",
    load: carregaPor((ids, workspaceId) =>
      prisma.issue.findMany({
        where: { id: { in: ids }, workspaceId },
        select: {
          id: true,
          name: true,
          sequenceId: true,
          projectId: true,
          ticketSequence: true,
          ticketYear: true,
          deletedAt: true,
          project: { select: { identifier: true } },
        },
      })
    ),
    describe: (dado) =>
      joinRotulo(codigoDoChamado(dado.project?.identifier, dado.sequenceId), numeroAnual(dado), tituloCurto(dado.name)),
    caminho: (dado, _linha, slug) => caminhoDoChamado(slug, dado.projectId, dado.id),
  },

  intake: {
    titulo: "Solicitação",
    load: carregaPor((ids, workspaceId) =>
      prisma.issue.findMany({
        where: { id: { in: ids }, workspaceId },
        select: {
          id: true,
          name: true,
          projectId: true,
          deletedAt: true,
          entity: { select: { name: true } },
          intakeIssues: { select: { status: true }, take: 1 },
        },
      })
    ),
    describe: (dado) => joinRotulo(tituloCurto(dado.name), entreParenteses(dado.entity?.name)),
    caminho: (dado, _linha, slug) =>
      `/${slug}/projects/${dado.projectId}/intake?currentTab=${abaDaTriagem(dado.intakeIssues?.[0]?.status)}&inboxIssueId=${dado.id}`,
  },

  comment: {
    titulo: "Comentário",
    load: carregaPor((ids, workspaceId) =>
      prisma.issueComment.findMany({
        where: { id: { in: ids }, workspaceId },
        select: {
          id: true,
          issueId: true,
          projectId: true,
          deletedAt: true,
          issue: { select: { name: true, sequenceId: true, project: { select: { identifier: true } } } },
        },
      })
    ),
    describe: (dado) =>
      joinRotulo(
        "em",
        codigoDoChamado(dado.issue?.project?.identifier, dado.issue?.sequenceId),
        tituloCurto(dado.issue?.name)
      ),
    caminho: (dado, _linha, slug) => caminhoDoChamado(slug, dado.projectId, dado.issueId),
  },

  // Anexo não tem tela própria: quem abre é o chamado ou a visita que o carrega.
  attachment: {
    titulo: "Anexo",
    load: carregaPor((ids) =>
      prisma.fileAsset.findMany({ where: { id: { in: ids } }, select: { id: true, attributes: true, deletedAt: true } })
    ),
    describe: (dado) => tituloCurto((dado.attributes as any)?.name ?? ""),
    caminho: () => null,
  },

  project: {
    titulo: "Projeto",
    load: carregaPor((ids, workspaceId) =>
      prisma.project.findMany({
        where: { id: { in: ids }, workspaceId },
        select: { id: true, name: true, identifier: true, deletedAt: true },
      })
    ),
    describe: (dado) => joinRotulo(tituloCurto(dado.name), entreParenteses(dado.identifier)),
    caminho: (dado, _linha, slug) => `/${slug}/projects/${dado.id}/issues`,
  },

  workspace: {
    titulo: "Espaço de trabalho",
    load: carregaPor((ids) =>
      prisma.workspace.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, deletedAt: true } })
    ),
    describe: (dado) => tituloCurto(dado.name),
    caminho: (_dado, _linha, slug) => `/${slug}/settings`,
  },

  entity: {
    titulo: "Entidade",
    load: carregaPor((ids, workspaceId) =>
      prisma.entity.findMany({
        where: { id: { in: ids }, workspaceId },
        select: { id: true, name: true, city: true, deletedAt: true },
      })
    ),
    describe: (dado) => tituloCurto(dado.name),
    caminho: (_dado, _linha, slug) => `/${slug}/settings/entities`,
  },

  entity_contact: {
    titulo: "Responsável",
    load: carregaPor((ids, workspaceId) =>
      prisma.entityContact.findMany({
        where: { id: { in: ids }, workspaceId },
        select: { id: true, name: true, deletedAt: true, entity: { select: { name: true } } },
      })
    ),
    describe: (dado) => joinRotulo(tituloCurto(dado.name), entreParenteses(dado.entity?.name)),
    caminho: (_dado, _linha, slug) => `/${slug}/contatos`,
  },

  entity_contact_type: {
    titulo: "Tipo de responsável",
    load: carregaPor((ids, workspaceId) =>
      prisma.entityContactType.findMany({ where: { id: { in: ids }, workspaceId }, select: { id: true, name: true } })
    ),
    describe: (dado) => tituloCurto(dado.name),
    caminho: (_dado, _linha, slug) => `/${slug}/contatos`,
  },

  technical_visit: {
    titulo: "Visita técnica",
    load: carregaPor((ids, workspaceId) =>
      prisma.technicalVisit.findMany({
        where: { id: { in: ids }, workspaceId },
        select: { id: true, visitNumber: true, city: true, deletedAt: true, entity: { select: { name: true } } },
      })
    ),
    describe: (dado) => joinRotulo(dado.visitNumber ?? "", entreParenteses(dado.entity?.name ?? dado.city)),
    caminho: (dado, _linha, slug) => `/${slug}/visits/${dado.id}`,
  },

  page: {
    titulo: "Página",
    load: carregaPor((ids, workspaceId) =>
      prisma.page.findMany({
        where: { id: { in: ids }, workspaceId },
        select: {
          id: true,
          name: true,
          isGlobal: true,
          deletedAt: true,
          projects: { select: { projectId: true }, take: 1 },
        },
      })
    ),
    describe: (dado) => tituloCurto(dado.name),
    caminho: (dado, _linha, slug) => {
      const projectId = dado.projects?.[0]?.projectId;
      if (dado.isGlobal || !projectId) return `/${slug}/wiki/${dado.id}`;
      return `/${slug}/projects/${projectId}/pages/${dado.id}`;
    },
  },

  cycle: {
    titulo: "Ciclo",
    load: carregaPor((ids, workspaceId) =>
      prisma.cycle.findMany({
        where: { id: { in: ids }, workspaceId },
        select: { id: true, name: true, projectId: true, deletedAt: true },
      })
    ),
    describe: (dado) => tituloCurto(dado.name),
    caminho: (dado, _linha, slug) => `/${slug}/projects/${dado.projectId}/cycles/${dado.id}`,
  },

  module: {
    titulo: "Módulo",
    load: carregaPor((ids, workspaceId) =>
      prisma.module.findMany({
        where: { id: { in: ids }, workspaceId },
        select: { id: true, name: true, projectId: true, deletedAt: true },
      })
    ),
    describe: (dado) => tituloCurto(dado.name),
    caminho: (dado, _linha, slug) => `/${slug}/projects/${dado.projectId}/modules/${dado.id}`,
  },

  curriculo: {
    titulo: "Currículo",
    load: carregaPor((ids, workspaceId) =>
      prisma.curriculo.findMany({
        where: { id: { in: ids }, workspaceId },
        select: { id: true, name: true, position: true },
      })
    ),
    describe: (dado) => joinRotulo(tituloCurto(dado.name), entreParenteses(dado.position)),
    caminho: (_dado, _linha, slug) => `/${slug}/curriculos`,
  },

  ouvidoria: {
    titulo: "Ouvidoria",
    load: carregaPor((ids, workspaceId) =>
      prisma.ouvidoria.findMany({
        where: { id: { in: ids }, workspaceId },
        select: { id: true, kind: true, name: true, protocol: true },
      })
    ),
    describe: (dado) =>
      joinRotulo(MANIFESTACAO[String(dado.kind)] ?? "Manifestação", "de", tituloCurto(dado.name), dado.protocol ?? ""),
    caminho: (_dado, _linha, slug) => `/${slug}/ouvidoria`,
  },

  panel_key: {
    titulo: "Chave de painel",
    load: carregaPor((ids, workspaceId) =>
      prisma.painelChave.findMany({
        where: { id: { in: ids }, workspaceId },
        select: { id: true, name: true, lastFour: true },
      })
    ),
    describe: (dado) => joinRotulo(tituloCurto(dado.name), entreParenteses(`final ${dado.lastFour}`)),
    caminho: (_dado, _linha, slug) => `/${slug}/settings/paineis-tv`,
  },

  // Membro e usuário são a mesma pessoa; o que muda é o contexto do evento.
  member: {
    titulo: "Membro",
    load: carregaPor((ids) =>
      prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, displayName: true, email: true, deletedAt: true },
      })
    ),
    describe: (dado) => joinRotulo(nomeDaPessoa(dado), entreParenteses(dado.email)),
    caminho: (_dado, _linha, slug) => `/${slug}/settings/members`,
  },

  user: {
    titulo: "Usuário",
    load: carregaPor((ids) =>
      prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, displayName: true, email: true, deletedAt: true },
      })
    ),
    describe: (dado) => joinRotulo(nomeDaPessoa(dado), entreParenteses(dado.email)),
    caminho: (_dado, _linha, slug) => `/${slug}/settings/members`,
  },

  // As conversas vivem no banco do chat; o protocolo guardado na trilha é o que abre a tela.
  chat_session: {
    titulo: "Atendimento",
    load: semCarga,
    describe: (_dado, linha) => String(metadadoDe(linha, "protocolo") ?? ""),
    caminho: (_dado, linha, slug) => {
      const protocolo = String(metadadoDe(linha, "protocolo") ?? "").trim();
      if (!protocolo) return null;
      return `/${slug}/chat-view/${protocolo}`;
    },
  },

  chat_attendant: {
    titulo: "Atendente",
    load: carregaPor((ids) =>
      prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, displayName: true, email: true, deletedAt: true },
      })
    ),
    describe: (dado) => joinRotulo(nomeDaPessoa(dado), entreParenteses(dado.email)),
    caminho: (_dado, _linha, slug) => `/${slug}/chat`,
  },

  chat_disparo: {
    titulo: "Disparo de mensagens",
    load: semCarga,
    describe: (_dado, linha) => tituloCurto(metadadoDe(linha, "titulo") ?? metadadoDe(linha, "nome") ?? ""),
    caminho: (_dado, _linha, slug) => `/${slug}/chat/disparo`,
  },

  report: {
    titulo: "Relatório",
    load: semCarga,
    describe: (_dado, linha) => tituloCurto(metadadoDe(linha, "relatorio") ?? metadadoDe(linha, "nome") ?? ""),
    caminho: (_dado, _linha, slug) => `/${slug}/reports`,
  },

  audit_log: {
    titulo: "Trilha de auditoria",
    load: semCarga,
    describe: () => "",
    caminho: (_dado, _linha, slug) => `/${slug}/settings/auditoria`,
  },
};

/** Tipo que a trilha ainda não conhece: legível, mas sem prometer uma tela. */
const estrategiaDesconhecida = (tipo: string): EstrategiaDeRegistro => ({
  titulo: tipo,
  load: semCarga,
  describe: (_dado, linha) => curto(linha.entityId),
  caminho: () => null,
});

const estrategiaDe = (tipo: string) => ESTRATEGIAS[tipo] ?? estrategiaDesconhecida(tipo);

/** Campos onde costuma sobrar o nome do que foi apagado. */
const NOMES_GUARDADOS = ["name", "nome", "titulo", "title", "display_name", "assunto", "protocolo"];

function nomeGuardado(linha: LinhaDaTrilha): string {
  const doMetadata = NOMES_GUARDADOS.map((campo) => metadadoDe(linha, campo)).find(
    (valor) => typeof valor === "string" && valor
  );
  if (doMetadata) return tituloCurto(doMetadata);

  const changes = (linha.changes ?? {}) as Record<string, { de?: unknown } | undefined>;
  const doDiff = NOMES_GUARDADOS.map((campo) => changes[campo]?.de).find((valor) => typeof valor === "string" && valor);
  return doDiff ? tituloCurto(doDiff) : "";
}

/**
 * Descreve o registro citado por uma linha da trilha. Pura: recebe o registro
 * já carregado (ou null, quando ele não existe mais).
 */
export function describeRegistro(linha: LinhaDaTrilha, dado: unknown, slug: string): RegistroDaAuditoria {
  const estrategia = estrategiaDe(linha.entity);
  const base = { tipo: linha.entity, id: linha.entityId };

  if (!dado) {
    return {
      ...base,
      rotulo: `${joinRotulo(estrategia.titulo, nomeGuardado(linha) || curto(linha.entityId))} (removido)`,
      caminho: null,
    };
  }

  const rotulo = joinRotulo(estrategia.titulo, estrategia.describe(dado, linha));
  if ((dado as any).deletedAt) return { ...base, rotulo: `${rotulo} (removido)`, caminho: null };

  return { ...base, rotulo, caminho: estrategia.caminho(dado, linha, slug) };
}

/**
 * Resolve o registro de cada linha da página, em lote: uma consulta por TIPO,
 * nunca uma por linha. A chave do resultado é `chaveDoRegistro`.
 */
export async function resolveRegistrosDaTrilha(
  linhas: LinhaDaTrilha[],
  ctx: { workspaceId: string; slug: string }
): Promise<Map<string, RegistroDaAuditoria>> {
  const idsPorTipo = new Map<string, Set<string>>();
  for (const linha of linhas) {
    const ids = idsPorTipo.get(linha.entity) ?? new Set<string>();
    ids.add(linha.entityId);
    idsPorTipo.set(linha.entity, ids);
  }

  const carregados = new Map<string, Map<string, any>>();
  await Promise.all(
    [...idsPorTipo].map(async ([tipo, ids]) => {
      carregados.set(tipo, await estrategiaDe(tipo).load([...ids], ctx.workspaceId));
    })
  );

  return new Map(
    linhas.map((linha) => [
      chaveDoRegistro(linha),
      describeRegistro(linha, carregados.get(linha.entity)?.get(linha.entityId) ?? null, ctx.slug),
    ])
  );
}
