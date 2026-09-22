/**
 * Service da denúncia interna. Qualquer membro denuncia; ler exige
 * `denuncia.read` (checado na rota).
 *
 * ANÔNIMA = NADA LIGA AO AUTOR. Este service não publica evento em tempo
 * real, não avisa ninguém e não grava auditoria: cada um desses deixaria um
 * instante preciso ao lado do usuário logado. O registro leva só o dia.
 */
import type { DenunciaDao, DenunciaRow } from "@modules/denuncia/denuncia.dao";
import { formatDiaLocal, validateDenunciaInput } from "@modules/denuncia/denuncia.rules";
import { requireNoFieldErrors } from "@utils/erro-de-dominio";
import { paginate } from "@utils/pagination";

export type DenunciaDeps = { dao: DenunciaDao; now: () => Date; timeZone: string };

export type DenunciaContext = { workspaceId: string; userId: string };

const POR_PAGINA = 20;

const diaDe = (data: Date) => data.toISOString().slice(0, 10);

export function createDenunciaService({ dao, now, timeZone }: DenunciaDeps) {
  const hydrate = async (linhas: DenunciaRow[]) => {
    const ids = [...new Set(linhas.map((l) => l.authorId).filter((id): id is string => !!id))];
    const autores = new Map((ids.length ? await dao.findUsuarios(ids) : []).map((u) => [u.id, u]));
    return linhas.map((l) => {
      const autor = l.authorId ? autores.get(l.authorId) : undefined;
      return {
        id: l.id,
        title: l.title,
        description: l.description,
        is_anonymous: l.isAnonymous,
        reported_on: diaDe(l.reportedOn),
        author: autor ? { id: autor.id, display_name: autor.displayName } : null,
      };
    });
  };

  return {
    async create(ctx: DenunciaContext, body: Record<string, unknown>) {
      const { data, errors } = validateDenunciaInput(body);
      requireNoFieldErrors(errors, "Revise os campos da denúncia.");
      const dia = formatDiaLocal(now(), timeZone);
      const linha = await dao.create({
        workspaceId: ctx.workspaceId,
        ...data,
        authorId: data.isAnonymous ? null : ctx.userId,
        reportedOn: new Date(`${dia}T00:00:00.000Z`),
      });
      return { id: linha.id, title: linha.title, is_anonymous: linha.isAnonymous, reported_on: dia };
    },

    list(workspaceId: string, query: Record<string, unknown>) {
      return paginate({
        query: (skip, take) => dao.findMany(workspaceId, skip, take),
        count: () => dao.count(workspaceId),
        cursor: query.cursor as string | undefined,
        perPage: Number(query.per_page) || POR_PAGINA,
        transform: hydrate,
      });
    },
  };
}
