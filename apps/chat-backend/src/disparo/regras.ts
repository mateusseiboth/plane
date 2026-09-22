/**
 * Regras puras do disparo em massa: telefone de destino, lista sem repetição,
 * ritmo de envio, leitura do que chega nas rotas e resumo da execução.
 * Não lê banco nem chama o provedor.
 */

import { telefoneComDdi } from "@/responsaveis";
import {
  asCorpo,
  erro,
  finish,
  isBlank,
  isUuid,
  readText,
  type CampoComErro,
  type Resultado,
} from "@/ligacoes/payload";

export const DISPARO_ITEM_STATUS = {
  PENDENTE: "pendente",
  PROCESSANDO: "processando",
  ENVIADO: "enviado",
  FALHOU: "falhou",
  CANCELADO: "cancelado",
} as const;
export type DisparoItemStatus = (typeof DISPARO_ITEM_STATUS)[keyof typeof DISPARO_ITEM_STATUS];

export const DISPARO_EXECUCAO_STATUS = {
  EM_ANDAMENTO: "em_andamento",
  CONCLUIDA: "concluida",
  CANCELADA: "cancelada",
} as const;
export type DisparoExecucaoStatus = (typeof DISPARO_EXECUCAO_STATUS)[keyof typeof DISPARO_EXECUCAO_STATUS];

export const RITMO = { PADRAO: 20, MIN: 1, MAX: 60 } as const;

const TITULO_MAX = 200;
const TEXTO_MAX = 4000;
export const ARQUIVO_MAX_BYTES = 10 * 1024 * 1024;

// ── Telefone ──────────────────────────────────────────────────────────────────

const PRIMEIRO_DIGITO_DE_CELULAR = new Set(["6", "7", "8", "9"]);

/**
 * Número de destino no formato que o WhatsApp entrega: 55 + DDD + número, com
 * o nono dígito no celular. O cadastro herdado do SAC tem o mesmo celular com e
 * sem o 9; sem acrescentar aqui, a mesma pessoa receberia duas vezes. Fixo
 * (começa em 2 a 5) fica como está. O que não é telefone brasileiro volta `null`.
 */
export function normalizeTelefoneDisparo(valor?: string | null): string | null {
  const comDdi = telefoneComDdi(valor);
  if (!comDdi.startsWith("55")) return null;
  const local = comDdi.slice(2);
  if (local[0] === "0") return null;
  if (local.length === 11) return local[2] === "9" ? comDdi : null;
  if (local.length !== 10) return null;
  if (!PRIMEIRO_DIGITO_DE_CELULAR.has(local[2]!)) return comDdi;
  return `55${local.slice(0, 2)}9${local.slice(2)}`;
}

export type ContatoDoDisparo = {
  contactId: string;
  name: string;
  entityName: string | null;
  phone: string | null;
};

export type Destinatario = Omit<ContatoDoDisparo, "phone"> & { telefone: string };

export type ListaDeDestinatarios = { destinatarios: Destinatario[]; semTelefone: number; repetidos: number };

/** Um destinatário por telefone; o primeiro cadastro com o número fica com ele. */
export function buildDestinatarios(contatos: readonly ContatoDoDisparo[]): ListaDeDestinatarios {
  const porTelefone = new Map<string, Destinatario>();
  let semTelefone = 0;
  let repetidos = 0;
  for (const { phone, ...contato } of contatos) {
    const telefone = normalizeTelefoneDisparo(phone);
    if (!telefone) {
      semTelefone += 1;
      continue;
    }
    if (porTelefone.has(telefone)) {
      repetidos += 1;
      continue;
    }
    porTelefone.set(telefone, { ...contato, telefone });
  }
  return { destinatarios: [...porTelefone.values()], semTelefone, repetidos };
}

// ── Ritmo ─────────────────────────────────────────────────────────────────────

export const getIntervaloMs = (porMinuto: number): number => Math.round(60_000 / porMinuto);

/** O último envio do espaço já está a um intervalo de distância? */
export const isHoraDoProximoEnvio = (ultimoEnvio: Date | null, agora: Date, porMinuto: number): boolean =>
  !ultimoEnvio || agora.getTime() - ultimoEnvio.getTime() >= getIntervaloMs(porMinuto);

export function readRitmo(body: unknown): Resultado<number> {
  const valor = Number(asCorpo(body).mensagens_por_minuto);
  const valido =
    !isBlank(asCorpo(body).mensagens_por_minuto) && Number.isInteger(valor) && valor >= RITMO.MIN && valor <= RITMO.MAX;
  return valido
    ? { ok: true, data: valor }
    : { ok: false, errors: [erro("mensagens_por_minuto", `Use um número inteiro de ${RITMO.MIN} a ${RITMO.MAX}.`)] };
}

// ── Filtros ───────────────────────────────────────────────────────────────────

export type FiltrosDoDisparo = { entityType: number | null; entityId: string | null; projectId: string | null };

/** Tipos de entidade do SAC (0 Prefeitura … 7 Consórcio), os mesmos do cadastro. */
const TIPO_DE_ENTIDADE_MAX = 7;

const readTipoDeEntidade = (valor: unknown): number | null | undefined => {
  if (isBlank(valor)) return null;
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 0 && numero <= TIPO_DE_ENTIDADE_MAX ? numero : undefined;
};

const readUuidOpcional = (valor: unknown): string | null | undefined => {
  if (isBlank(valor)) return null;
  return isUuid(valor) ? valor : undefined;
};

export function readFiltros(body: unknown): Resultado<FiltrosDoDisparo> {
  const b = asCorpo(body);
  const entityType = readTipoDeEntidade(b.entity_type);
  const entityId = readUuidOpcional(b.entity_id);
  const projectId = readUuidOpcional(b.project_id);
  const errors = [
    entityType === undefined ? erro("entity_type", "Tipo de entidade inválido.") : null,
    entityId === undefined ? erro("entity_id", "Entidade inválida.") : null,
    projectId === undefined ? erro("project_id", "Sistema inválido.") : null,
  ].filter((e): e is CampoComErro => e !== null);
  return finish(errors, () => ({ entityType: entityType!, entityId: entityId!, projectId: projectId! }));
}

// ── Mensagem e arquivo ────────────────────────────────────────────────────────

export type DadosDaMensagem = { titulo: string; texto: string | null };

/** Com arquivo, o texto é a legenda e pode faltar; sem arquivo, é a mensagem. */
export function readMensagem(body: unknown, temArquivo: boolean): Resultado<DadosDaMensagem> {
  const b = asCorpo(body);
  const titulo = readText(b.titulo, TITULO_MAX);
  const texto = isBlank(b.texto) ? null : String(b.texto).slice(0, TEXTO_MAX);
  const errors = [
    titulo ? null : erro("titulo", "Informe o título."),
    texto || temArquivo ? null : erro("texto", "Escreva o texto ou anexe um arquivo."),
  ].filter((e): e is CampoComErro => e !== null);
  return finish(errors, () => ({ titulo: titulo!, texto }));
}

export type TipoDoArquivo = "image" | "document";

const TIPO_POR_MIME: Record<string, TipoDoArquivo> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/webp": "image",
  "application/pdf": "document",
};

export const getTipoDoArquivo = (mime?: string | null): TipoDoArquivo | null => TIPO_POR_MIME[mime ?? ""] ?? null;

export function readArquivo(arquivo: { type: string; size: number }): Resultado<TipoDoArquivo> {
  const tipo = getTipoDoArquivo(arquivo.type);
  if (!tipo) return { ok: false, errors: [erro("arquivo", "Envie uma imagem (JPG, PNG, GIF ou WEBP) ou um PDF.")] };
  if (arquivo.size > ARQUIVO_MAX_BYTES) return { ok: false, errors: [erro("arquivo", "O arquivo passa de 10 MB.")] };
  return { ok: true, data: tipo };
}

// ── Resumo da execução ────────────────────────────────────────────────────────

export type ResumoDosItens = Record<DisparoItemStatus, number> & { total: number; emAberto: number };

export function summarizeItens(linhas: readonly { status: string; total: number }[]): ResumoDosItens {
  const vazio = Object.fromEntries(Object.values(DISPARO_ITEM_STATUS).map((s) => [s, 0])) as Record<
    DisparoItemStatus,
    number
  >;
  const porStatus = linhas.reduce(
    (soma, { status, total }) =>
      status in soma ? { ...soma, [status]: soma[status as DisparoItemStatus] + total } : soma,
    vazio
  );
  const total = Object.values(porStatus).reduce((a, b) => a + b, 0);
  return { total, ...porStatus, emAberto: porStatus.pendente + porStatus.processando };
}
