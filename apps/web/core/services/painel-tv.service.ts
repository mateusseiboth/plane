/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Painéis de TV: os dados que a tela de parede lê e a gestão das chaves.
 *
 * São DOIS clientes de propósito:
 *  - os dados do painel vão por `fetch`, porque a página roda SEM login e o
 *    cliente axios do produto manda quem toma 401 para a tela de entrar — numa
 *    TV isso viraria um login piscando na parede;
 *  - a gestão (Configurações) usa o `APIService` de sempre, que já leva a
 *    sessão e trata o 401 como o resto do produto.
 *
 * Backend: apps/api-ts/src/modules/painel-tv.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

const CABECALHO_DA_CHAVE = "X-Panel-Key";

const baseDoPainel = (workspaceSlug: string) => `${API_BASE_URL}/api/tv/${encodeURIComponent(workspaceSlug)}`;

export type ErroDoPainel = { status: number; detail: string };

const lerErro = async (resposta: Response): Promise<ErroDoPainel> => {
  const corpo = (await resposta.json().catch(() => null)) as { detail?: string } | null;
  return { status: resposta.status, detail: corpo?.detail ?? "Não foi possível carregar o painel." };
};

type Consulta = Record<string, string | number | null | undefined>;

/** Uma leitura do painel. A chave vai no cabeçalho; sem chave vale a sessão. */
export async function loadPainel<T>(
  workspaceSlug: string,
  caminho: string,
  opcoes: { chave?: string | null; params?: Consulta } = {}
): Promise<T> {
  const url = new URL(`${baseDoPainel(workspaceSlug)}${caminho}`, window.location.origin);
  for (const [nome, valor] of Object.entries(opcoes.params ?? {})) {
    if (valor !== null && valor !== undefined && valor !== "") url.searchParams.set(nome, String(valor));
  }
  const resposta = await fetch(url.toString(), {
    credentials: "include",
    headers: opcoes.chave ? { [CABECALHO_DA_CHAVE]: opcoes.chave } : {},
  });
  if (!resposta.ok) throw await lerErro(resposta);
  return (await resposta.json()) as T;
}

/**
 * Fluxo de eventos do espaço (SSE). É lido por `fetch` — e não por
 * `EventSource` — porque só assim a chave viaja no CABEÇALHO: no `EventSource`
 * ela teria de ir na URL, e URL entra em log de proxy e em histórico.
 */
export function openStreamDoPainel(workspaceSlug: string, chave: string | null, aoMudar: () => void): () => void {
  const controle = new AbortController();

  const ouvir = async () => {
    const resposta = await fetch(`${baseDoPainel(workspaceSlug)}/stream/`, {
      credentials: "include",
      signal: controle.signal,
      headers: chave ? { [CABECALHO_DA_CHAVE]: chave } : {},
    });
    if (!resposta.ok || !resposta.body) throw await lerErro(resposta);
    const leitor = resposta.body.getReader();
    const decodificador = new TextDecoder();
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await leitor.read();
      if (done) return;
      // Cada evento é uma linha `data: {...}`; o conteúdo não importa, só o aviso.
      if (decodificador.decode(value, { stream: true }).includes("data:")) aoMudar();
    }
  };

  const reconectar = () => {
    if (controle.signal.aborted) return;
    void ouvir()
      .catch(() => undefined)
      .finally(() => {
        // A TV fica ligada o dia inteiro: queda de rede não pode deixar a tela parada.
        if (!controle.signal.aborted) setTimeout(reconectar, 5_000);
      });
  };
  reconectar();

  return () => controle.abort();
}

/**
 * O plugin de backup instalado no espaço, se houver. Vai por `fetch` cru de
 * propósito: o cliente axios do produto manda quem toma 401 para a tela de
 * entrar, e o painel também roda sem sessão nenhuma. Sem plugin (ou sem
 * permissão de ler a lista) o atalho simplesmente não aparece.
 */
export type TPluginDeBackup = { slug: string; name: string };

export async function findPluginDeBackup(): Promise<TPluginDeBackup | null> {
  try {
    const resposta = await fetch(new URL(`${API_BASE_URL}/api/v1/plugins/active`, window.location.origin).toString(), {
      credentials: "include",
    });
    if (!resposta.ok) return null;
    const corpo = (await resposta.json()) as { results?: TPluginDeBackup[] };
    return (corpo.results ?? []).find((p) => p.slug.includes("backup")) ?? null;
  } catch {
    return null;
  }
}

export type TChaveDePainel = {
  id: string;
  name: string;
  scopes: string[];
  is_active: boolean;
  last_four: string;
  last_used_at: string | null;
  created_at: string;
  created_by_id: string | null;
  revoked_at: string | null;
};

export type TChaveCriada = TChaveDePainel & { key: string };

export type TColunaDoPainel = {
  chave: string;
  rotulo: string;
  cor: string;
  etapas: string[];
  responsavel?: "com" | "sem";
  concluidoEmDias?: number;
  noTotal?: boolean;
};

export type TColunasDoPainel = {
  painel: string;
  columns: TColunaDoPainel[];
  is_default: boolean;
  etapas_do_espaco: string[];
};

const rethrow = (erro: any) => {
  throw erro?.response?.data ?? erro;
};

export class PaineisDeTvService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string) {
    return `/api/workspaces/${workspaceSlug}/tv-panels`;
  }

  async chaves(workspaceSlug: string): Promise<TChaveDePainel[]> {
    return this.get(`${this.base(workspaceSlug)}/keys/`)
      .then((res) => (res?.data?.results ?? []) as TChaveDePainel[])
      .catch(rethrow);
  }

  async criarChave(workspaceSlug: string, dados: { name: string; scopes: string[] }): Promise<TChaveCriada> {
    return this.post(`${this.base(workspaceSlug)}/keys/`, dados)
      .then((res) => res?.data as TChaveCriada)
      .catch(rethrow);
  }

  async revogarChave(workspaceSlug: string, id: string): Promise<TChaveDePainel> {
    return this.post(`${this.base(workspaceSlug)}/keys/${id}/revoke/`, {})
      .then((res) => res?.data as TChaveDePainel)
      .catch(rethrow);
  }

  async colunas(workspaceSlug: string, painel: string): Promise<TColunasDoPainel> {
    return this.get(`${this.base(workspaceSlug)}/columns/${painel}/`)
      .then((res) => res?.data as TColunasDoPainel)
      .catch(rethrow);
  }

  async salvarColunas(workspaceSlug: string, painel: string, columns: TColunaDoPainel[]): Promise<TColunasDoPainel> {
    return this.put(`${this.base(workspaceSlug)}/columns/${painel}/`, { columns })
      .then((res) => res?.data as TColunasDoPainel)
      .catch(rethrow);
  }

  async restaurarColunas(workspaceSlug: string, painel: string): Promise<TColunasDoPainel> {
    return this.delete(`${this.base(workspaceSlug)}/columns/${painel}/`)
      .then((res) => res?.data as TColunasDoPainel)
      .catch(rethrow);
  }
}

const paineisDeTvService = new PaineisDeTvService();
export default paineisDeTvService;
