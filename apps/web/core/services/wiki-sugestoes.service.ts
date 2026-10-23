/**
 * Sugestões da wiki para o modal de solicitação.
 *
 * `GET  /api/workspaces/:slug/wiki/sugestoes/?q=&project_id=`  páginas parecidas
 * `POST /api/workspaces/:slug/wiki/sugestoes/resolver/`        o que fazer, pela IA
 */
import { API_BASE_URL } from "@plane/constants";
import type { TSugestaoDaWiki, TSugestaoDeSolucao } from "@/components/solicitacao/sugestoes-da-wiki";
import { APIService } from "@/services/api.service";

const CAMINHO = (workspaceSlug: string) => `/api/workspaces/${workspaceSlug}/wiki/sugestoes/`;

export class WikiSugestoesService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async listSugestoes(workspaceSlug: string, texto: string, projectId?: string): Promise<TSugestaoDaWiki[]> {
    return this.get(CAMINHO(workspaceSlug), { params: { q: texto, ...(projectId ? { project_id: projectId } : {}) } })
      .then((res) => res?.data ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async resolveSugestao(workspaceSlug: string, texto: string, paginaIds: string[]): Promise<TSugestaoDeSolucao> {
    return this.post(`${CAMINHO(workspaceSlug)}resolver/`, { texto, paginas: paginaIds })
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

const wikiSugestoesService = new WikiSugestoesService();
export default wikiSugestoesService;
