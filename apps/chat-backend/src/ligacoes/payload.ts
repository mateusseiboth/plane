/**
 * Leitura e validação do que chega nas rotas de ligação: o envio do PBX, a
 * conclusão do atendente, o vínculo do chamado e os ramais da configuração.
 *
 * Cada campo recusado volta como `{ path, message }`, no caminho que o
 * formulário entende (`ramais[1].extension`), para a tela marcar o campo certo.
 * Puro: não lê banco.
 */

import type { CadastroDoEncerramento } from "@/encerramento";

export type CampoComErro = { path: string; message: string };
export type Resultado<T> = { ok: true; data: T } | { ok: false; errors: CampoComErro[] };

export const LIGACAO_STATUS = { ANSWERED: "answered", MISSED: "missed" } as const;
export type LigacaoStatus = (typeof LIGACAO_STATUS)[keyof typeof LIGACAO_STATUS];

type Corpo = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const asCorpo = (body: unknown): Corpo => (body && typeof body === "object" ? (body as Corpo) : {});

const isBlank = (valor: unknown): boolean => valor === undefined || valor === null || String(valor).trim() === "";

const readText = (valor: unknown, max: number): string | null =>
  isBlank(valor) ? null : String(valor).trim().slice(0, max);

const isUuid = (valor: unknown): valor is string => typeof valor === "string" && UUID.test(valor);

const erro = (path: string, message: string): CampoComErro => ({ path, message });

const finish = <T>(errors: CampoComErro[], build: () => T): Resultado<T> =>
  errors.length ? { ok: false, errors } : { ok: true, data: build() };

// ── Envio do PBX ──────────────────────────────────────────────────────────────

/** Disposição do CDR do FreePBX (ou o nosso próprio vocabulário) → status. */
const STATUS_POR_DISPOSICAO: Record<string, LigacaoStatus> = {
  answered: LIGACAO_STATUS.ANSWERED,
  missed: LIGACAO_STATUS.MISSED,
  "no answer": LIGACAO_STATUS.MISSED,
  noanswer: LIGACAO_STATUS.MISSED,
  busy: LIGACAO_STATUS.MISSED,
  failed: LIGACAO_STATUS.MISSED,
};

const readStatus = (valor: unknown): LigacaoStatus | undefined =>
  isBlank(valor) ? LIGACAO_STATUS.ANSWERED : STATUS_POR_DISPOSICAO[String(valor).trim().toLowerCase()];

/** ISO 8601, "AAAA-MM-DD HH:MM:SS" ou segundos desde 1970 (CDR). */
function readDate(valor: unknown): Date | null | undefined {
  if (isBlank(valor)) return null;
  const numero = typeof valor === "number" ? valor : Number.NaN;
  const data = Number.isFinite(numero) ? new Date(numero * 1000) : new Date(String(valor).trim().replace(" ", "T"));
  return Number.isNaN(data.getTime()) ? undefined : data;
}

function readDuration(valor: unknown): number | null | undefined {
  if (isBlank(valor)) return null;
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 0 ? numero : undefined;
}

function readUrl(valor: unknown): string | null | undefined {
  if (isBlank(valor)) return null;
  const texto = String(valor).trim();
  return /^https?:\/\/\S+$/i.test(texto) ? texto : undefined;
}

export type LigacaoRecebida = {
  callId: string;
  caller: string | null;
  extension: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  durationSec: number | null;
  recordingUrl: string | null;
  status: LigacaoStatus;
};

export function parseLigacaoRecebida(body: unknown): Resultado<LigacaoRecebida> {
  const b = asCorpo(body);
  const callId = readText(b.call_id, 128);
  const startedAt = readDate(b.started_at);
  const endedAt = readDate(b.ended_at);
  const durationSec = readDuration(b.duration_sec);
  const recordingUrl = readUrl(b.recording_url);
  const status = readStatus(b.status);

  const errors = [
    callId ? null : erro("call_id", "Informe o identificador da ligação."),
    startedAt === undefined ? erro("started_at", "Data de início inválida.") : null,
    endedAt === undefined ? erro("ended_at", "Data de fim inválida.") : null,
    durationSec === undefined ? erro("duration_sec", "Duração inválida. Use segundos, sem casas decimais.") : null,
    recordingUrl === undefined ? erro("recording_url", "Link da gravação inválido. Use http ou https.") : null,
    status ? null : erro("status", "Status inválido. Use answered ou missed."),
  ].filter((e): e is CampoComErro => e !== null);

  return finish(errors, () => ({
    callId: callId!,
    caller: readText(b.caller, 40),
    extension: readText(b.extension, 20),
    startedAt: startedAt ?? null,
    endedAt: endedAt ?? null,
    durationSec: durationSec ?? null,
    recordingUrl: recordingUrl ?? null,
    status: status!,
  }));
}

// ── Conclusão pelo atendente ──────────────────────────────────────────────────

export type Conclusao = { projectId: string; descricao: string; contact: CadastroDoEncerramento | null };

const CAMPOS_DO_CONTATO = ["contact_id", "name", "email", "phone", "entity_id", "type_id"] as const;

function readContato(valor: unknown): CadastroDoEncerramento | null {
  const c = asCorpo(valor);
  const contato = Object.fromEntries(
    CAMPOS_DO_CONTATO.filter((campo) => !isBlank(c[campo])).map((campo) => [campo, String(c[campo]).trim()])
  ) as CadastroDoEncerramento;
  return contato.contact_id || contato.name ? contato : null;
}

export function parseConclusao(body: unknown, contexto: { hasContato: boolean }): Resultado<Conclusao> {
  const b = asCorpo(body);
  const descricao = readText(b.descricao, 5000);
  const contact = readContato(b.contact);

  const errors = [
    isUuid(b.project_id) ? null : erro("project_id", "Escolha o sistema."),
    descricao ? null : erro("descricao", "Descreva o que o cliente pediu."),
    contexto.hasContato || contact ? null : erro("contact", "Escolha ou cadastre quem ligou."),
  ].filter((e): e is CampoComErro => e !== null);

  return finish(errors, () => ({ projectId: b.project_id as string, descricao: descricao!, contact }));
}

// ── Vínculo do chamado ────────────────────────────────────────────────────────

export const CHAMADO_KIND = { ISSUE: "issue", INTAKE: "intake" } as const;
export type ChamadoKind = (typeof CHAMADO_KIND)[keyof typeof CHAMADO_KIND];
const CHAMADO_KINDS = new Set<string>(Object.values(CHAMADO_KIND));

export type ChamadoVinculado = { kind: ChamadoKind; issueId: string };

export function parseChamado(body: unknown): Resultado<ChamadoVinculado> {
  const b = asCorpo(body);
  const errors = [
    CHAMADO_KINDS.has(String(b.kind)) ? null : erro("kind", "Tipo de chamado inválido."),
    isUuid(b.issue_id) ? null : erro("issue_id", "Chamado inválido."),
  ].filter((e): e is CampoComErro => e !== null);
  return finish(errors, () => ({ kind: b.kind as ChamadoKind, issueId: b.issue_id as string }));
}

// ── Ramais ────────────────────────────────────────────────────────────────────

export type Ramal = { extension: string; userId: string };

export function parseRamais(body: unknown, atendentes: ReadonlySet<string>): Resultado<Ramal[]> {
  const lista = asCorpo(body).ramais;
  if (!Array.isArray(lista)) return { ok: false, errors: [erro("ramais", "Envie a lista de ramais.")] };

  const ramais = lista.map((item) => {
    const r = asCorpo(item);
    return { extension: readText(r.extension, 20) ?? "", userId: String(r.user_id ?? "") };
  });
  const vistos = new Set<string>();
  const errors = ramais.flatMap(({ extension, userId }, i) => {
    const repetido = vistos.has(extension);
    vistos.add(extension);
    return [
      extension ? null : erro(`ramais[${i}].extension`, "Informe o ramal."),
      extension && repetido ? erro(`ramais[${i}].extension`, "Ramal repetido.") : null,
      atendentes.has(userId) ? null : erro(`ramais[${i}].user_id`, "Escolha alguém que atende no chat."),
    ].filter((e): e is CampoComErro => e !== null);
  });

  return finish(errors, () => ramais);
}
