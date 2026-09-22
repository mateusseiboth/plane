/**
 * Cliente das rotas internas do api-ts (`/api/internal/chat/...`), com
 * autenticação de serviço: `X-Service-Token` = `CHAT_SERVICE_TOKEN`, o mesmo
 * segredo configurado no api-ts. Fala direto com o container
 * (`API_TS_INTERNAL_URL`), sem passar pelo proxy público.
 *
 * Nunca lança: rede fora do ar vira `status: 0`, e o destino decide o que
 * dizer ao cliente.
 */

export type RespostaDaApi = { status: number; body: unknown };

export type ApiTsClient = {
  postJson: (slug: string, caminho: string, body: unknown) => Promise<RespostaDaApi>;
  postForm: (slug: string, caminho: string, form: FormData) => Promise<RespostaDaApi>;
};

type Config = { baseUrl: string; token: string; fetch?: typeof fetch };

export function createApiTsClient({ baseUrl, token, fetch: doFetch = fetch }: Config): ApiTsClient {
  const base = baseUrl.replace(/\/$/, "");

  const post = async (slug: string, caminho: string, init: RequestInit): Promise<RespostaDaApi> => {
    try {
      const res = await doFetch(`${base}/api/internal/chat/workspaces/${encodeURIComponent(slug)}${caminho}`, {
        method: "POST",
        ...init,
        headers: { "X-Service-Token": token, ...init.headers },
        signal: AbortSignal.timeout(15_000),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    } catch (e) {
      console.error("[robo] api-ts fora do ar:", e);
      return { status: 0, body: null };
    }
  };

  return {
    postJson: (slug, caminho, body) =>
      post(slug, caminho, { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    postForm: (slug, caminho, form) => post(slug, caminho, { body: form }),
  };
}

export const apiTsClient = createApiTsClient({
  baseUrl: process.env.API_TS_INTERNAL_URL || "http://api-ts:8001",
  token: process.env.CHAT_SERVICE_TOKEN ?? "",
});
