/**
 * "Alterar sistema" do chamado: o servidor cancela o atual e abre o novo no
 * destino com tudo dele (ver apps/api-ts/src/modules/issue/alterar-sistema.*).
 */
import { API_BASE_URL } from "@plane/constants";
import type { TIssue } from "@plane/types";
import { APIService } from "@/services/api.service";

export type TChamadoNoNovoSistema = {
  id: string;
  project_id: string;
  sequence_id: number;
  project_identifier: string;
  issue: TIssue;
};

export class AlterarSistemaService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async alterarSistema(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    projectIdDestino: string
  ): Promise<TChamadoNoNovoSistema> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/alterar-sistema/`, {
      project_id_destino: projectIdDestino,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
