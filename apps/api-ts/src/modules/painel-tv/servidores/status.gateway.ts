/**
 * Fonte de status de servidor que fala com o gateway dos bservers (qsSocket).
 *
 * **A conexão é do SERVIDOR, não do navegador.** O painel de TV abre sem login
 * do Plane; se a página falasse com o gateway, o token administrativo estaria
 * no HTML de uma tela sem dono. Então o api-ts consulta o gateway com a
 * credencial dele e entrega o resultado já digerido na rota do painel, que a
 * chave de painel autentica.
 *
 * É HTTP, não WebSocket: o gateway aceita as MESMAS ações administrativas nas
 * duas portas (`GET /admin/<acao>` com `x-admin-token`), e uma consulta a cada
 * 20 s não justifica manter um socket vivo dentro da API.
 *
 * Gateway fora do ar = nenhuma entidade recebe cor, e o mapa segue de pé.
 */

import { readEntidadesLegado } from "@modules/painel-tv/mapa/dados";
import type { EntidadeParaBackup } from "@modules/painel-tv/backups/fonte";
import {
  FONTE_DE_STATUS_VAZIA,
  buildStatusDasEntidades,
  type ConexaoDoGateway,
  type FonteDeStatusDeServidor,
  type StatusDoServidor,
} from "@modules/painel-tv/servidores/status";

const CACHE_MS = 20_000;
const TIMEOUT_MS = 8_000;
const LIMITE_DE_CONEXOES = 5000;

type Opcoes = {
  url: string;
  token: string;
  buscar?: typeof fetch;
  agora?: () => Date;
};

type RespostaDoGateway = { ok?: boolean; data?: { clients?: ConexaoDoGateway[] } };

export function createFonteGatewayDeStatus({
  url,
  token,
  buscar = fetch,
  agora = () => new Date(),
}: Opcoes): FonteDeStatusDeServidor {
  const base = url.replace(/\/$/, "");
  let cache: { em: number; conexoes: Promise<ConexaoDoGateway[]> } | null = null;

  const consultar = async (): Promise<ConexaoDoGateway[]> => {
    const resposta = await buscar(`${base}/admin/clients.list?limit=${LIMITE_DE_CONEXOES}`, {
      headers: { "x-admin-token": token },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resposta.ok) throw new Error(`gateway respondeu ${resposta.status}`);
    const corpo = (await resposta.json()) as RespostaDoGateway;
    return corpo.data?.clients ?? [];
  };

  const conexoes = (): Promise<ConexaoDoGateway[]> => {
    const instante = agora().getTime();
    if (!cache || instante - cache.em > CACHE_MS) cache = { em: instante, conexoes: consultar() };
    return cache.conexoes;
  };

  return {
    async findStatus(entidades: EntidadeParaBackup[]): Promise<StatusDoServidor[]> {
      const legado = readEntidadesLegado();
      const sacPorLegado = new Map(Object.entries(legado).map(([id, e]) => [Number(id), e.sac]));
      return buildStatusDasEntidades({ conexoes: await conexoes(), entidades, sacPorLegado });
    },
  };
}

/**
 * Gateway de PRODUÇÃO, sempre — inclusive em homologação. Os bservers de
 * verdade só se conectam a ele; apontar a homologação para o gateway local
 * deixaria o mapa inteiro sem status de servidor. A variável existe para trocar
 * o endereço sem mexer no código, não para escolher ambiente.
 */
export const GATEWAY_PADRAO = "https://gwsocket.qualitysistemas.inf.br";

/**
 * Qual fonte vale neste ambiente. Sem `GATEWAY_ADMIN_TOKEN`, a vazia — o
 * endereço tem padrão, a credencial não. Falha de rede também: o mapa desenha
 * sem a cor de status.
 */
export function createFonteDeStatusDeServidor(
  env: Record<string, string | undefined> = process.env
): FonteDeStatusDeServidor {
  const url = env.GATEWAY_ADMIN_URL?.trim() || GATEWAY_PADRAO;
  const token = env.GATEWAY_ADMIN_TOKEN?.trim();
  if (!token) return FONTE_DE_STATUS_VAZIA;
  const fonte = createFonteGatewayDeStatus({ url, token });
  return {
    findStatus: (entidades, instante) =>
      fonte.findStatus(entidades, instante).catch((erro) => {
        console.error("[painel-tv] gateway dos servidores indisponível:", erro?.message ?? erro);
        return [];
      }),
  };
}
