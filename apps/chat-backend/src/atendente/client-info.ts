/**
 * Dados técnicos do cliente mandados pelo sistema que embute o widget
 * (versão, computador, navegador, sistema operacional, resolução e motivo).
 * Chegam por query string (`?versao=`, `?info={...}`) ou no corpo do
 * `POST /sessions/` e ficam em `chat_sessions.client_info`.
 *
 * Só as chaves conhecidas entram: o widget é público, e o que ele manda é texto
 * de terceiro exibido ao atendente.
 */

const ALIASES = {
  versao: ["versao", "version", "app_version"],
  computador: ["computador", "computer", "hostname"],
  navegador: ["navegador", "browser"],
  so: ["so", "os"],
  resolucao: ["resolucao", "resolution"],
  motivo: ["motivo", "reason"],
} as const;

export type CampoDoCliente = keyof typeof ALIASES;
export type ClientInfo = Partial<Record<CampoDoCliente, string>>;

const LIMITE_DO_VALOR = 500;

function safeJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function readObjeto(raw: unknown): Record<string, unknown> {
  const valor = typeof raw === "string" ? safeJson(raw) : raw;
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}

const readValor = (valor: unknown): string | null => {
  if (valor === null || valor === undefined || typeof valor === "object") return null;
  const texto = String(valor).trim();
  return texto ? texto.slice(0, LIMITE_DO_VALOR) : null;
};

export function parseClientInfo(raw: unknown): ClientInfo {
  const objeto = readObjeto(raw);
  const pares = Object.entries(ALIASES)
    .map(([campo, nomes]) => [campo, nomes.map((n) => readValor(objeto[n])).find(Boolean) ?? null] as const)
    .filter(([, valor]) => valor !== null);
  return Object.fromEntries(pares) as ClientInfo;
}

/** Conversa retomada: o que veio agora completa (e atualiza) o que já estava gravado. */
export const mergeClientInfo = (atual: unknown, novo: ClientInfo): ClientInfo => ({
  ...parseClientInfo(atual),
  ...novo,
});
