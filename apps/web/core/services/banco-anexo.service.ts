/**
 * Banco anexado no texto: busca dos backups para anexar e preparação do
 * download, sempre pelo Plane (ver apps/api-ts/src/modules/banco-anexo). O
 * Plane pede ao plugin de backups em nome de quem vê o chamado.
 */
import { API_BASE_URL } from "@plane/constants";
import type { TArquivoDeBanco, TPreparacao } from "@/components/banco-anexo/banco-anexo";
import { APIService } from "@/services/api.service";

export type TNivelDaBusca = "meses" | "sistemas" | "entidades" | "arquivos";

export type TMesDeBanco = { mes: string; arquivos: number };
export type TSistemaDeBanco = { system_id: string; system_name: string | null; arquivos: number };
export type TEntidadeDeBanco = { entity_code: string; entity_name: string | null; arquivos: number };

type TRespostaDaBusca<T> = { data: T[] };

const rethrow = (err: { response?: { data?: unknown } }) => {
  throw err?.response?.data ?? err;
};

export class BancoAnexoService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private listNivel<T>(slug: string, nivel: TNivelDaBusca, params: Record<string, string | undefined>) {
    return this.get(`/api/workspaces/${slug}/bancos/${nivel}/`, { params })
      .then((res) => (res?.data as TRespostaDaBusca<T>)?.data ?? [])
      .catch(rethrow);
  }

  listMeses = (slug: string) => this.listNivel<TMesDeBanco>(slug, "meses", {});
  listSistemas = (slug: string, mes: string) => this.listNivel<TSistemaDeBanco>(slug, "sistemas", { mes });
  listEntidades = (slug: string, mes: string, systemId: string) =>
    this.listNivel<TEntidadeDeBanco>(slug, "entidades", { mes, system_id: systemId });
  listArquivos = (slug: string, mes: string, systemId: string, entityCode: string) =>
    this.listNivel<TArquivoDeBanco>(slug, "arquivos", {
      mes,
      system_id: systemId,
      entity_code: entityCode,
      limit: "50",
    });

  createPreparacao(slug: string, projectId: string, envio: string): Promise<TPreparacao> {
    return this.post(`/api/workspaces/${slug}/projects/${projectId}/bancos/${envio}/preparar/`, {})
      .then((res) => res?.data as TPreparacao)
      .catch(rethrow);
  }

  readPreparacao(slug: string, projectId: string, id: string): Promise<TPreparacao> {
    return this.get(`/api/workspaces/${slug}/projects/${projectId}/bancos/preparar/${id}/`)
      .then((res) => res?.data as TPreparacao)
      .catch(rethrow);
  }
}

export const bancoAnexoService = new BancoAnexoService();
