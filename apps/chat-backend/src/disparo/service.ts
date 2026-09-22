/**
 * Disparo em massa: cadastro de mensagens, prévia e envio filtrado, histórico
 * por execução, Status do WhatsApp, fila da Z-API e ritmo. A permissão já foi
 * conferida na rota (`requireDisparo`); aqui ficam as regras e a orquestração.
 * O envio em si é do worker (`worker.ts`): a rota só enfileira.
 */

import { randomUUID } from "crypto";
import type { PlaneUser } from "@/auth";
import { CHAT_AUDIT_ACTIONS, CHAT_AUDIT_ENTITIES, recordChatAudit } from "@/audit";
import * as dao from "@/disparo/dao";
import {
  ArquivoIndisponivelError,
  EnvioEmAndamentoError,
  ExecucaoNaoEncontradaError,
  MensagemNaoEncontradaError,
  ProvedorIndisponivelError,
  SemDestinatariosError,
  StatusSemImagemError,
  requireValid,
} from "@/disparo/erros";
import {
  DISPARO_EXECUCAO_STATUS,
  RITMO,
  buildDestinatarios,
  getTipoDoArquivo,
  readArquivo,
  readFiltros,
  readMensagem,
  readRitmo,
  summarizeItens,
  type FiltrosDoDisparo,
} from "@/disparo/regras";
import { asCorpo } from "@/ligacoes/payload";
import { getProvider, type MidiaDeSaida, type ResolvedProvider } from "@/providers/provider";
import { saveMedia, serveMedia } from "@/storage";
import { attendantName } from "@/users";

const PUBLIC_URL = (process.env.CHAT_PUBLIC_URL || "").replace(/\/$/, "");
const HISTORICO_LIMITE = 100;

// ── Serialização (snake_case, como o resto da API do chat) ────────────────────

const serializeMensagem = (m: dao.MensagemComUltimoEnvio) => ({
  id: m.id,
  titulo: m.titulo,
  texto: m.texto,
  media_key: m.mediaKey,
  media_mime: m.mediaMime,
  media_name: m.mediaName,
  created_at: m.createdAt,
  updated_at: m.updatedAt,
  ultimo_envio: m.execucoes[0]
    ? { created_at: m.execucoes[0].createdAt, total: m.execucoes[0].total, status: m.execucoes[0].status }
    : null,
});

const serializeFiltros = (f: FiltrosDoDisparo) => ({
  entity_type: f.entityType,
  entity_id: f.entityId,
  project_id: f.projectId,
});

const serializeResumo = (r: ReturnType<typeof summarizeItens>) => ({
  total: r.total,
  pendente: r.pendente,
  processando: r.processando,
  enviado: r.enviado,
  falhou: r.falhou,
  cancelado: r.cancelado,
});

async function serializeExecucoes(execucoes: dao.Execucao[]) {
  const contagens = await dao.countItensPorStatus(execucoes.map((e) => e.id));
  return Promise.all(
    execucoes.map(async (e) => ({
      id: e.id,
      mensagem_id: e.mensagemId,
      titulo: e.titulo,
      filtros: e.filtros,
      total: e.total,
      sem_telefone: e.semTelefone,
      repetidos: e.repetidos,
      status: e.status,
      created_by_id: e.createdById,
      created_by_name: await attendantName(e.createdById),
      created_at: e.createdAt,
      finished_at: e.finishedAt,
      resumo: serializeResumo(summarizeItens(contagens.filter((c) => c.execucaoId === e.id))),
    }))
  );
}

const serializeItem = (i: dao.Item) => ({
  id: i.id,
  telefone: i.telefone,
  contact_id: i.contactId,
  contact_name: i.contactName,
  entity_name: i.entityName,
  status: i.status,
  erro: i.erro,
  tentado_em: i.tentadoEm,
});

// ── Mensagens ─────────────────────────────────────────────────────────────────

const requireMensagem = async (slug: string, id: string) => {
  const mensagem = await dao.findMensagem(slug, id);
  if (!mensagem) throw new MensagemNaoEncontradaError();
  return mensagem;
};

const readArquivoDoCorpo = (body: unknown): File | null => {
  const arquivo = asCorpo(body).arquivo;
  return arquivo instanceof Blob && arquivo.size > 0 ? (arquivo as File) : null;
};

async function saveArquivo(slug: string, arquivo: File) {
  requireValid(readArquivo(arquivo));
  const key = `disparo/${slug}/${randomUUID()}`;
  await saveMedia(key, arquivo);
  return { mediaKey: key, mediaMime: arquivo.type, mediaName: arquivo.name || "arquivo" };
}

export const readMensagens = async (slug: string) => (await dao.listMensagens(slug)).map(serializeMensagem);

export async function createMensagem(slug: string, user: PlaneUser, body: unknown) {
  const arquivo = readArquivoDoCorpo(body);
  const dados = requireValid(readMensagem(body, !!arquivo));
  const midia = arquivo ? await saveArquivo(slug, arquivo) : {};
  return serializeMensagem(await dao.createMensagem({ workspaceId: slug, createdById: user.id, ...dados, ...midia }));
}

const SEM_ARQUIVO = { mediaKey: null, mediaMime: null, mediaName: null };

/** Arquivo novo substitui; `remover_arquivo` tira; nenhum dos dois mantém o que havia. */
async function resolveMidiaDaEdicao(slug: string, body: unknown, atual: { mediaKey: string | null }) {
  const arquivo = readArquivoDoCorpo(body);
  if (arquivo) return saveArquivo(slug, arquivo);
  if (String(asCorpo(body).remover_arquivo) === "true") return SEM_ARQUIVO;
  return { mediaKey: atual.mediaKey };
}

export async function updateMensagem(slug: string, id: string, body: unknown) {
  const atual = await requireMensagem(slug, id);
  const midia = await resolveMidiaDaEdicao(slug, body, atual);
  const dados = requireValid(readMensagem(body, !!midia.mediaKey));
  return serializeMensagem(await dao.updateMensagem(id, { ...dados, ...midia }));
}

/** Exclusão lógica: o histórico de envios continua de pé. */
export async function deleteMensagem(slug: string, id: string) {
  await requireMensagem(slug, id);
  await dao.updateMensagem(id, { deletedAt: new Date() });
}

// ── Prévia e envio ────────────────────────────────────────────────────────────

async function buildLista(slug: string, body: unknown) {
  const filtros = requireValid(readFiltros(body));
  return { filtros, ...buildDestinatarios(await dao.findContatos(slug, filtros)) };
}

export async function readPrevia(slug: string, body: unknown) {
  const { destinatarios, semTelefone, repetidos } = await buildLista(slug, body);
  return { total: destinatarios.length, sem_telefone: semTelefone, repetidos };
}

const requireProvedor = async (slug: string): Promise<ResolvedProvider> => {
  const resolvido = await getProvider(slug);
  if (!resolvido) throw new ProvedorIndisponivelError();
  return resolvido;
};

export async function sendMensagem(slug: string, id: string, user: PlaneUser, body: unknown, headers: unknown) {
  const mensagem = await requireMensagem(slug, id);
  const { filtros, destinatarios, semTelefone, repetidos } = await buildLista(slug, body);
  if (!destinatarios.length) throw new SemDestinatariosError();
  if (await dao.hasExecucaoEmAndamento(id)) throw new EnvioEmAndamentoError();
  await requireProvedor(slug);

  const execucao = await dao.createExecucaoComItens(
    id,
    {
      workspaceId: slug,
      titulo: mensagem.titulo,
      texto: mensagem.texto,
      mediaKey: mensagem.mediaKey,
      mediaMime: mensagem.mediaMime,
      mediaName: mensagem.mediaName,
      filtros: serializeFiltros(filtros),
      total: destinatarios.length,
      semTelefone,
      repetidos,
      createdById: user.id,
    },
    destinatarios
  );
  await recordChatAudit({
    workspaceSlug: slug,
    sessionId: execucao.id,
    entity: CHAT_AUDIT_ENTITIES.DISPARO,
    action: CHAT_AUDIT_ACTIONS.SEND,
    userId: user.id,
    headers,
    metadata: {
      mensagem_id: id,
      titulo: mensagem.titulo,
      total: destinatarios.length,
      filtros: serializeFiltros(filtros),
    },
  });
  const [serializada] = await serializeExecucoes([execucao]);
  return serializada!;
}

// ── Histórico ─────────────────────────────────────────────────────────────────

export async function readExecucoes(slug: string, query: unknown) {
  const mensagemId = asCorpo(query).mensagem_id;
  return serializeExecucoes(await dao.listExecucoes(slug, mensagemId ? String(mensagemId) : null, HISTORICO_LIMITE));
}

const requireExecucao = async (slug: string, id: string) => {
  const execucao = await dao.findExecucao(slug, id);
  if (!execucao) throw new ExecucaoNaoEncontradaError();
  return execucao;
};

export async function readExecucaoDetalhe(slug: string, id: string, query: unknown) {
  const [execucao] = await serializeExecucoes([await requireExecucao(slug, id)]);
  const status = asCorpo(query).status;
  const itens = await dao.listItens(id, status ? String(status) : null);
  return { ...execucao!, itens: itens.map(serializeItem) };
}

/** Para o que ainda não saiu. O que já foi enviado fica como está. */
export async function cancelEnvio(slug: string, id: string, user: PlaneUser, headers: unknown) {
  const execucao = await requireExecucao(slug, id);
  if (execucao.status !== DISPARO_EXECUCAO_STATUS.EM_ANDAMENTO) return readExecucaoDetalhe(slug, id, {});
  await dao.cancelExecucao(id, new Date());
  await recordChatAudit({
    workspaceSlug: slug,
    sessionId: id,
    entity: CHAT_AUDIT_ENTITIES.DISPARO,
    action: CHAT_AUDIT_ACTIONS.UPDATE,
    userId: user.id,
    headers,
    metadata: { cancelado: true },
  });
  return readExecucaoDetalhe(slug, id, {});
}

// ── Mídia de saída (envio e Status) ───────────────────────────────────────────

type Midia = { mediaKey: string | null; mediaMime: string | null; mediaName: string | null };

/**
 * Com `CHAT_PUBLIC_URL`, a Z-API baixa o arquivo pela URL pública; sem ela, o
 * arquivo vai em base64 (a Z-API aceita `data:<mime>;base64,...`). Sem isso o
 * provedor receberia um endereço vazio.
 */
async function readConteudoDaMidia(midia: Midia): Promise<{ url?: string; base64?: string }> {
  if (PUBLIC_URL) return { url: `${PUBLIC_URL}/media/${midia.mediaKey}` };
  const arquivo = await serveMedia(midia.mediaKey!, midia.mediaMime);
  if (!arquivo) throw new ArquivoIndisponivelError();
  const base64 = Buffer.from(await arquivo.arrayBuffer()).toString("base64");
  return { base64: `data:${midia.mediaMime};base64,${base64}` };
}

const TIPO_DO_PROVEDOR = { image: "image", document: "file" } as const;

export async function buildMidiaDeSaida(midia: Midia, legenda: string | null): Promise<MidiaDeSaida> {
  const tipo = getTipoDoArquivo(midia.mediaMime) ?? "document";
  return {
    ...(await readConteudoDaMidia(midia)),
    mime: midia.mediaMime ?? "application/octet-stream",
    name: midia.mediaName ?? undefined,
    type: TIPO_DO_PROVEDOR[tipo],
    ...(legenda ? { caption: legenda } : {}),
  };
}

// ── Status do WhatsApp ────────────────────────────────────────────────────────

export async function sendStatus(slug: string, id: string, user: PlaneUser, headers: unknown) {
  const mensagem = await requireMensagem(slug, id);
  if (getTipoDoArquivo(mensagem.mediaMime) !== "image") throw new StatusSemImagemError();
  const { provider } = await requireProvedor(slug);
  const midia = await readConteudoDaMidia(mensagem);
  const externalId = await provider.sendImageStatus((midia.url ?? midia.base64)!);
  await recordChatAudit({
    workspaceSlug: slug,
    sessionId: id,
    entity: CHAT_AUDIT_ENTITIES.DISPARO,
    action: CHAT_AUDIT_ACTIONS.SEND,
    userId: user.id,
    headers,
    metadata: { mensagem_id: id, titulo: mensagem.titulo, destino: "status" },
  });
  return { ok: true, external_id: externalId };
}

// ── Fila da Z-API e ritmo ─────────────────────────────────────────────────────

export async function readFilaZapi(slug: string) {
  const { provider } = await requireProvedor(slug);
  return provider.getFilaDeSaida();
}

export const getRitmo = async (slug: string): Promise<number> =>
  (await dao.findConfig(slug))?.mensagensPorMinuto ?? RITMO.PADRAO;

export const readConfig = async (slug: string) => ({ mensagens_por_minuto: await getRitmo(slug) });

export async function saveRitmo(slug: string, user: PlaneUser, body: unknown) {
  const porMinuto = requireValid(readRitmo(body));
  await dao.saveConfig(slug, porMinuto, user.id);
  return { mensagens_por_minuto: porMinuto };
}
