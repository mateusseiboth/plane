/**
 * Pedido assinado ao backend de um plugin (G3): o mesmo envelope do proxy
 * `ALL /plugin-sdk/backend/*`, para o servidor do Plane chamar o plugin em nome
 * de alguém. O plugin confere a assinatura e confia nos cabeçalhos de
 * identidade e permissão; o navegador nunca vê a URL nem o segredo.
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import { readBridgeSecret } from "@modules/plugin-sdk-gateway/bridge-secret";

export type PedidoAoPlugin = {
  plugin: { id: string; manifest: unknown };
  user: { id: string; displayName?: string | null; email?: string | null };
  workspaceId: string | null;
  method: string;
  subPath: string;
  query?: Record<string, unknown>;
  body?: Buffer;
  contentType?: string | null;
  perms: string[];
  correlationId?: string | null;
};

export type RespostaDoPlugin =
  | { ok: true; resposta: Response; correlationId: string }
  | { ok: false; status: number; detail: string };

const SEM_BACKEND = { ok: false, status: 400, detail: "O plugin não possui backend configurado." } as const;
const SEM_SEGREDO = {
  ok: false,
  status: 503,
  detail: "A integração deste plugin está indisponível. Avise o administrador do sistema.",
} as const;
const INACESSIVEL = { ok: false, status: 502, detail: "Backend do plugin inacessível." } as const;

const readBaseUrl = (manifest: unknown): string | undefined =>
  (manifest as { backend?: { baseUrl?: string } } | null)?.backend?.baseUrl;

export async function sendAoBackendDoPlugin(pedido: PedidoAoPlugin): Promise<RespostaDoPlugin> {
  const baseUrl = readBaseUrl(pedido.plugin.manifest);
  if (!baseUrl) return SEM_BACKEND;
  const bridgeSecret = readBridgeSecret();
  if (!bridgeSecret) {
    console.error(
      "[plugin-sdk] PLUGIN_BRIDGE_SECRET não configurado: o proxy para o backend do plugin está desligado."
    );
    return SEM_SEGREDO;
  }

  const url = new URL(baseUrl + pedido.subPath);
  for (const [k, v] of Object.entries(pedido.query ?? {})) if (v != null) url.searchParams.set(k, String(v));

  const method = pedido.method.toUpperCase();
  const ts = Date.now().toString();
  const bodyHash = createHash("sha256")
    .update(pedido.body ?? Buffer.alloc(0))
    .digest("hex");
  const pluginKey = createHmac("sha256", bridgeSecret).update(pedido.plugin.id).digest("hex");
  const sigBase = [method, pedido.subPath, pedido.user.id, pedido.workspaceId ?? "", ts, bodyHash].join("|");
  const signature = createHmac("sha256", pluginKey).update(sigBase).digest("hex");
  const correlationId = pedido.correlationId ?? randomUUID();

  const headers: Record<string, string> = {
    "X-Plugin-Id": pedido.plugin.id,
    "X-Plugin-User": pedido.user.id,
    "X-Plugin-User-Name": pedido.user.displayName ?? "",
    "X-Plugin-User-Email": pedido.user.email ?? "",
    "X-Plugin-Workspace": pedido.workspaceId ?? "",
    "X-Plugin-Perms": pedido.perms.join(","),
    "X-Plugin-Timestamp": ts,
    "X-Plugin-Signature": signature,
    "X-Correlation-Id": correlationId,
  };
  if (pedido.contentType && pedido.body) headers["content-type"] = pedido.contentType;

  try {
    const resposta = await fetch(url.toString(), {
      method,
      headers,
      body: pedido.body ? new Uint8Array(pedido.body) : undefined,
    });
    return { ok: true, resposta, correlationId };
  } catch {
    return INACESSIVEL;
  }
}
