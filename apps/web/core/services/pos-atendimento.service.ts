/**
 * Pós-atendimento (`/workspaces/:slug/pos-atendimento/`). Contrato em
 * apps/api-ts/src/modules/pos-atendimento e `.claude/pos-atendimento.md`. Erros de
 * escrita sobem com o corpo da API (`{detail, errors}`) para a tela pôr cada um no campo.
 */
import { API_BASE_URL } from "@plane/constants";
import type {
  TPosAtendimento,
  TPosOrigem,
  TPosPagina,
  TPosPainel,
  TSatisfacao,
} from "@/components/pos-atendimento/types";
import { APIService } from "@/services/api.service";

const rethrow = (error: any) => {
  throw error?.response?.data ?? error;
};

/** Segmento da rota por origem. */
const SEGMENTO: Record<TPosOrigem, string> = { issue: "issues", visit: "visits" };

export class PosAtendimentoService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private url(slug: string, sufixo = "") {
    return `/api/workspaces/${slug}/pos-atendimento/${sufixo}`;
  }

  async list(slug: string, params: Record<string, string>): Promise<TPosPagina> {
    return this.get(this.url(slug), { params })
      .then((r) => r?.data)
      .catch(rethrow);
  }

  async painel(slug: string, origem: TPosOrigem, alvoId: string): Promise<TPosPainel> {
    return this.get(this.url(slug, `${SEGMENTO[origem]}/${alvoId}/`))
      .then((r) => r?.data)
      .catch(rethrow);
  }

  async record(
    slug: string,
    origem: TPosOrigem,
    alvoId: string,
    data: Record<string, unknown>
  ): Promise<TPosAtendimento> {
    return this.post(this.url(slug, `${SEGMENTO[origem]}/${alvoId}/`), data)
      .then((r) => r?.data)
      .catch(rethrow);
  }

  async verify(slug: string, posId: string, comment: string): Promise<TPosAtendimento> {
    return this.post(this.url(slug, `${posId}/verify/`), { comment })
      .then((r) => r?.data)
      .catch(rethrow);
  }

  async satisfacao(slug: string, params: Record<string, string>): Promise<TSatisfacao> {
    return this.get(this.url(slug, "report/"), { params })
      .then((r) => r?.data)
      .catch(rethrow);
  }

  async satisfacaoItens(slug: string, params: Record<string, string>): Promise<TPosPagina> {
    return this.get(this.url(slug, "report/items/"), { params })
      .then((r) => r?.data)
      .catch(rethrow);
  }
}

export const posAtendimentoService = new PosAtendimentoService();
