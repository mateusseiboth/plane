/**
 * Service dos currículos: recebimento pelo robô, lista da tela, marcações,
 * exclusão definitiva e expurgo pelo prazo de guarda (LGPD). A permissão
 * (`curriculo.read`) é checada na rota; a autenticação de serviço, na rota
 * interna. Dependências injetadas para o teste unitário.
 */
import type { CurriculoDao, CurriculoRow } from "@modules/curriculo/curriculo.dao";
import {
  RETENCAO_PADRAO_DIAS,
  buildCurriculoWhere,
  buildMarcacao,
  inicioDaRetencao,
  isVencido,
  validateCurriculoInput,
  validatePdf,
  validateRetencao,
} from "@modules/curriculo/curriculo.rules";
import { NotFoundError, requireNoFieldErrors } from "@utils/erro-de-dominio";
import { paginate } from "@utils/pagination";

export type CurriculoStorage = {
  save: (key: string, arquivo: Blob) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export type CurriculoDeps = { dao: CurriculoDao; storage: CurriculoStorage; now: () => Date; newId: () => string };

type Pessoa = { id: string; displayName: string };

const POR_PAGINA = 20;

const serializePessoa = (p?: Pessoa) => (p ? { id: p.id, display_name: p.displayName } : null);

export const serializeCurriculo = (c: CurriculoRow, pessoas: Map<string, Pessoa> = new Map()) => ({
  id: c.id,
  received_at: c.receivedAt.toISOString(),
  name: c.name,
  phone: c.phone,
  position: c.position,
  message: c.message,
  file_name: c.fileName,
  file_size: c.fileSize,
  chat_session_id: c.chatSessionId,
  is_read: !!c.readAt,
  read_at: c.readAt?.toISOString() ?? null,
  read_by: serializePessoa(c.readById ? pessoas.get(c.readById) : undefined),
  is_interviewed: !!c.interviewedAt,
  interviewed_at: c.interviewedAt?.toISOString() ?? null,
  interviewed_by: serializePessoa(c.interviewedById ? pessoas.get(c.interviewedById) : undefined),
});

export type CurriculoDto = ReturnType<typeof serializeCurriculo>;

export function createCurriculoService({ dao, storage, now, newId }: CurriculoDeps) {
  const hydrate = async (linhas: CurriculoRow[]) => {
    const ids = [...new Set(linhas.flatMap((l) => [l.readById, l.interviewedById]).filter((id): id is string => !!id))];
    const pessoas = new Map((ids.length ? await dao.findUsuarios(ids) : []).map((p) => [p.id, p]));
    return linhas.map((l) => serializeCurriculo(l, pessoas));
  };

  const findOrFail = async (workspaceId: string, id: string) => {
    const linha = await dao.findOne(workspaceId, id);
    if (!linha) throw new NotFoundError("Currículo não encontrado.");
    return linha;
  };

  /** Arquivo primeiro: sem ele o registro não serve; o arquivo órfão some no expurgo do storage. */
  const removeDefinitivo = async (linha: CurriculoRow) => {
    await storage.remove(linha.fileKey);
    await dao.remove(linha.id);
  };

  return {
    async create(workspaceId: string, body: Record<string, unknown>, arquivo: Blob | null, nomeDoArquivo: string) {
      const { data, errors } = validateCurriculoInput(body);
      requireNoFieldErrors([...errors, ...(await validatePdf(arquivo))], "Revise o currículo enviado.");
      const id = newId();
      const fileKey = `curriculos/${workspaceId}/${id}.pdf`;
      await storage.save(fileKey, arquivo as Blob);
      const linha = await dao.create({
        id,
        workspaceId,
        ...data,
        fileKey,
        fileName: nomeDoArquivo.trim().slice(0, 200) || "curriculo.pdf",
        fileSize: (arquivo as Blob).size,
      });
      return serializeCurriculo(linha);
    },

    list(workspaceId: string, query: Record<string, unknown>) {
      const where = buildCurriculoWhere(workspaceId, query);
      return paginate({
        query: (skip, take) => dao.findMany(where, skip, take),
        count: () => dao.count(where),
        cursor: query.cursor as string | undefined,
        perPage: Number(query.per_page) || POR_PAGINA,
        transform: hydrate,
      });
    },

    positions: (workspaceId: string) => dao.findPositions(workspaceId),

    findOrFail,

    async mark(workspaceId: string, userId: string, id: string, body: Record<string, unknown>) {
      const antes = await findOrFail(workspaceId, id);
      const marcacao = buildMarcacao(body, userId, now());
      const depois = Object.keys(marcacao).length ? await dao.update(id, marcacao) : antes;
      return { antes: serializeCurriculo(antes), depois: (await hydrate([depois]))[0] };
    },

    async remove(workspaceId: string, id: string) {
      const linha = await findOrFail(workspaceId, id);
      await removeDefinitivo(linha);
      return linha;
    },

    async readConfig(workspaceId: string) {
      const config = await dao.findConfig(workspaceId);
      return { retention_days: config?.retentionDays ?? RETENCAO_PADRAO_DIAS };
    },

    async saveConfig(workspaceId: string, body: Record<string, unknown>) {
      requireNoFieldErrors(validateRetencao(body.retention_days));
      const config = await dao.saveConfig(workspaceId, Number(body.retention_days));
      return { retention_days: config.retentionDays };
    },

    /**
     * Expurgo da LGPD: apaga arquivo e registro do que passou do prazo do
     * próprio espaço (sem configuração, o padrão). Devolve o que apagou para a
     * rotina registrar na auditoria.
     */
    async purgeExpired(): Promise<CurriculoRow[]> {
      const agora = now();
      const prazoPorEspaco = new Map((await dao.findConfigs()).map((c) => [c.workspaceId, c.retentionDays]));
      const menorPrazo = Math.min(RETENCAO_PADRAO_DIAS, ...prazoPorEspaco.values());
      const candidatos = await dao.findRecebidosAntesDe(inicioDaRetencao(menorPrazo, agora));
      const vencidos = candidatos.filter((c) =>
        isVencido(c.receivedAt, prazoPorEspaco.get(c.workspaceId) ?? RETENCAO_PADRAO_DIAS, agora)
      );
      for (const linha of vencidos) {
        // Um por vez: o storage (S3) não precisa de rajada, e a rotina é diária.
        // oxlint-disable-next-line no-await-in-loop
        await removeDefinitivo(linha);
      }
      return vencidos;
    },
  };
}

export type CurriculoService = ReturnType<typeof createCurriculoService>;
