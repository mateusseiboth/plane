/**
 * Lista analítica por usuário com os marcos (`chamados_porusuario*.php`,
 * `andamento_atual_ti.php` e a parte de homologação de `pendencias_qualidade.php`).
 *
 *  - perfil "responsavel": chamados de cada responsável atual. Com período, entra o
 *    chamado em aberto (sempre, como no legado) e o que teve algum marco no período;
 *  - perfil "homologacao": chamados homologados no período, agrupados por quem homologou.
 *
 * `situacao` recorta em abertos, encerrados ou todos.
 *
 * A LISTAGEM devolve, por pessoa, os totais e só uma amostra dos chamados mais
 * recentes (`por_usuario`, padrão 25 e no máximo 200): em produção são 46 mil
 * chamados, e mandar todos num JSON só travava a tela por segundos. A lista
 * inteira de uma pessoa sai paginada em `findChamadosDoUsuario`.
 */
import type { Prisma } from "@prisma/client";
import { STATE } from "@utils/permissions";
import { createCacheEmMemoria } from "@modules/reports/comum/cache-em-memoria";
import { serializeChamadoDoRelatorio } from "@modules/reports/comum/chamado-do-relatorio";
import { requireOpcao } from "@modules/reports/comum/erros";
import { issueWhere, userNameMap, withoutPeriodo, type Filters } from "@modules/reports/comum/filtros";
import { isNoPeriodo, type Periodo } from "@modules/reports/comum/periodo";
import { GRUPOS_ENCERRADOS } from "@modules/reports/marcos/marcos";
import {
  findChamadosComMarcos,
  readAutoresDosMarcos,
  serializeMarcos,
  type ChamadoComMarcos,
} from "@modules/reports/marcos/marcos.service";

export const PERFIS_DO_ANALITICO = ["responsavel", "homologacao"] as const;
export type PerfilDoAnalitico = (typeof PERFIS_DO_ANALITICO)[number];

export const SITUACOES_DO_ANALITICO = ["todos", "abertos", "encerrados"] as const;
export type SituacaoDoAnalitico = (typeof SITUACOES_DO_ANALITICO)[number];

type Params = {
  workspaceId: string;
  filtros: Filters;
  usuarioId?: string;
  perfil: PerfilDoAnalitico;
  situacao: SituacaoDoAnalitico;
};

const readPeriodo = (f: Filters): Periodo | null =>
  f.dateFrom || f.dateTo ? { inicio: f.dateFrom ?? new Date(0), fim: f.dateTo ?? new Date(8.64e15) } : null;

const dentroDe = (periodo: Periodo | null) => (periodo ? { createdAt: { gte: periodo.inicio, lte: periodo.fim } } : {});

const isEncerrado = (c: ChamadoComMarcos) => GRUPOS_ENCERRADOS.includes(c.chamado.state?.group ?? "");

type PerfilStrategy = {
  where: (p: Params, periodo: Periodo | null) => Prisma.IssueWhereInput;
  /** Para quem o chamado conta. */
  donos: (c: ChamadoComMarcos, p: Params) => string[];
  isNoRecorte: (c: ChamadoComMarcos, periodo: Periodo | null) => boolean;
};

const PERFIS: Record<PerfilDoAnalitico, PerfilStrategy> = {
  responsavel: {
    where: (p, periodo) => ({
      assignees: { some: { deletedAt: null, ...(p.usuarioId ? { assigneeId: p.usuarioId } : {}) } },
      ...(periodo
        ? {
            OR: [
              { state: { group: { notIn: [...GRUPOS_ENCERRADOS] } } },
              { activities: { some: { field: "state", deletedAt: null, ...dentroDe(periodo) } } },
              { assignees: { some: dentroDe(periodo) } },
            ],
          }
        : {}),
    }),
    donos: (c, p) => c.responsaveis.filter((id) => !p.usuarioId || id === p.usuarioId),
    isNoRecorte: (c, periodo) => {
      if (!periodo || !isEncerrado(c)) return true;
      const m = c.marcos;
      return [m.atribuidoEm, m.inicioTiEm, m.finalizadoTiEm, m.homologadoEm, m.encerradoEm].some((d) =>
        isNoPeriodo(d, periodo)
      );
    },
  },
  homologacao: {
    where: (p, periodo) => ({
      activities: {
        some: {
          field: "state",
          oldValue: STATE.EM_TESTE,
          deletedAt: null,
          ...(p.usuarioId ? { actorId: p.usuarioId } : {}),
          ...dentroDe(periodo),
        },
      },
    }),
    donos: (c, p) =>
      [c.marcos.homologadoPor].filter((id): id is string => !!id && (!p.usuarioId || id === p.usuarioId)),
    isNoRecorte: (c, periodo) => !!c.marcos.homologadoEm && (!periodo || isNoPeriodo(c.marcos.homologadoEm, periodo)),
  },
};

const SITUACOES: Record<SituacaoDoAnalitico, (c: ChamadoComMarcos) => boolean> = {
  todos: () => true,
  abertos: (c) => !isEncerrado(c),
  encerrados: isEncerrado,
};

export const readPerfil = (valor: unknown) =>
  requireOpcao(valor, PERFIS_DO_ANALITICO, "responsavel", "Perfil do relatório inválido.");
export const readSituacao = (valor: unknown) =>
  requireOpcao(valor, SITUACOES_DO_ANALITICO, "todos", "Situação do relatório inválida.");

const POR_USUARIO_PADRAO = 25;
const POR_USUARIO_MAXIMO = 200;
const POR_PAGINA_PADRAO = 50;
const POR_PAGINA_MAXIMO = 200;

const clamp = (valor: unknown, padrao: number, maximo: number) =>
  Math.min(Math.max(Math.trunc(Number(valor)) || padrao, 1), maximo);

/** Quantos chamados de cada pessoa a listagem devolve como amostra. */
export const readPorUsuario = (valor: unknown) => clamp(valor, POR_USUARIO_PADRAO, POR_USUARIO_MAXIMO);
export const readPagina = (valor: unknown) => Math.max(Math.trunc(Number(valor)) || 1, 1);
export const readPorPagina = (valor: unknown) => clamp(valor, POR_PAGINA_PADRAO, POR_PAGINA_MAXIMO);

const atribuidoPara = (c: ChamadoComMarcos, usuarioId: string) =>
  c.atribuicoes.find((a) => a.usuarioId === usuarioId)?.em ?? c.marcos.atribuidoEm;

const byMaisRecente = (a: ChamadoComMarcos, b: ChamadoComMarcos) =>
  b.chamado.createdAt.getTime() - a.chamado.createdAt.getTime();

type UsuarioDoAnalitico = {
  user_id: string;
  name: string;
  total: number;
  abertos: number;
  encerrados: number;
  /** Todos os chamados da pessoa, do mais recente para o mais antigo. */
  chamados: ReturnType<typeof serializeChamadoDoAnalitico>[];
};

type AnaliticoCompleto = {
  perfil: PerfilDoAnalitico;
  situacao: SituacaoDoAnalitico;
  total: number;
  usuarios: UsuarioDoAnalitico[];
};

const serializeChamadoDoAnalitico = (c: ChamadoComMarcos, usuarioId: string, nomes: Map<string, string>) => ({
  ...serializeChamadoDoRelatorio(c.chamado),
  marcos: serializeMarcos(c.marcos, nomes, atribuidoPara(c, usuarioId)),
});

async function buildAnaliticoCompleto(p: Params): Promise<AnaliticoCompleto> {
  const periodo = readPeriodo(p.filtros);
  const perfil = PERFIS[p.perfil];
  const where = { ...issueWhere(p.workspaceId, withoutPeriodo(p.filtros)), ...perfil.where(p, periodo) };
  const chamados = (await findChamadosComMarcos(p.workspaceId, where)).filter(
    (c) => SITUACOES[p.situacao](c) && perfil.isNoRecorte(c, periodo)
  );

  const porUsuario = new Map<string, ChamadoComMarcos[]>();
  for (const c of chamados) for (const id of perfil.donos(c, p)) porUsuario.set(id, [...(porUsuario.get(id) ?? []), c]);

  const nomes = await userNameMap([...porUsuario.keys(), ...chamados.flatMap((c) => readAutoresDosMarcos(c.marcos))]);
  const usuarios = [...porUsuario.entries()]
    .map(([usuarioId, lista]): UsuarioDoAnalitico => {
      const encerrados = lista.filter(isEncerrado).length;
      return {
        user_id: usuarioId,
        name: nomes.get(usuarioId) ?? "—",
        total: lista.length,
        abertos: lista.length - encerrados,
        encerrados,
        chamados: lista.toSorted(byMaisRecente).map((c) => serializeChamadoDoAnalitico(c, usuarioId, nomes)),
      };
    })
    .toSorted((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return { perfil: p.perfil, situacao: p.situacao, total: chamados.length, usuarios };
}

/**
 * Mesmo filtro, por 60 s: a tela pede a listagem e logo em seguida uma página de
 * alguém, e recalcular os marcos de dezenas de milhares de chamados a cada pedido
 * levava segundos. Ver `cache-em-memoria.ts`.
 */
const TEMPO_DO_CACHE_MS = 60_000;
const cacheDoAnalitico = createCacheEmMemoria<AnaliticoCompleto>(TEMPO_DO_CACHE_MS);

const readChaveDoCache = (p: Params) =>
  JSON.stringify([
    p.workspaceId,
    p.perfil,
    p.situacao,
    p.usuarioId ?? null,
    p.filtros.projectIds ?? null,
    p.filtros.entityId ?? null,
    p.filtros.dateFrom ?? null,
    p.filtros.dateTo ?? null,
  ]);

const findAnaliticoCompleto = (p: Params) => cacheDoAnalitico(readChaveDoCache(p), () => buildAnaliticoCompleto(p));

/** Listagem: totais por pessoa e a amostra dos chamados mais recentes. */
export async function findAnaliticoPorUsuario(p: Params, porUsuario: number = POR_USUARIO_PADRAO) {
  const completo = await findAnaliticoCompleto(p);
  return {
    perfil: completo.perfil,
    situacao: completo.situacao,
    total: completo.total,
    por_usuario: porUsuario,
    usuarios: completo.usuarios.map((u) => ({
      user_id: u.user_id,
      name: u.name,
      total: u.total,
      chamados_total: u.total,
      abertos: u.abertos,
      encerrados: u.encerrados,
      chamados: u.chamados.slice(0, porUsuario),
    })),
  };
}

/** Os chamados de uma pessoa, paginados, com os mesmos filtros da listagem. */
export async function findChamadosDoUsuario(p: Params, usuarioId: string, pagina: number, porPagina: number) {
  const completo = await findAnaliticoCompleto({ ...p, usuarioId });
  const usuario = completo.usuarios.find((u) => u.user_id === usuarioId);
  const chamados = usuario?.chamados ?? [];
  const inicio = (pagina - 1) * porPagina;
  return {
    user_id: usuarioId,
    name: usuario?.name ?? "—",
    total: chamados.length,
    abertos: usuario?.abertos ?? 0,
    encerrados: usuario?.encerrados ?? 0,
    page: pagina,
    per_page: porPagina,
    total_pages: Math.max(1, Math.ceil(chamados.length / porPagina)),
    chamados: chamados.slice(inicio, inicio + porPagina),
  };
}
