/**
 * Lista analítica por usuário com os marcos (`chamados_porusuario*.php`,
 * `andamento_atual_ti.php` e a parte de homologação de `pendencias_qualidade.php`).
 *
 *  - perfil "responsavel": chamados de cada responsável atual. Com período, entra o
 *    chamado em aberto (sempre, como no legado) e o que teve algum marco no período;
 *  - perfil "homologacao": chamados homologados no período, agrupados por quem homologou.
 *
 * `situacao` recorta em abertos, encerrados ou todos.
 */
import type { Prisma } from "@prisma/client";
import { STATE } from "@utils/permissions";
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

const atribuidoPara = (c: ChamadoComMarcos, usuarioId: string) =>
  c.atribuicoes.find((a) => a.usuarioId === usuarioId)?.em ?? c.marcos.atribuidoEm;

export async function findAnaliticoPorUsuario(p: Params) {
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
    .map(([usuarioId, lista]) => ({
      user_id: usuarioId,
      name: nomes.get(usuarioId) ?? "—",
      total: lista.length,
      chamados: lista.map((c) => ({
        ...serializeChamadoDoRelatorio(c.chamado),
        marcos: serializeMarcos(c.marcos, nomes, atribuidoPara(c, usuarioId)),
      })),
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return { perfil: p.perfil, situacao: p.situacao, total: chamados.length, usuarios };
}
