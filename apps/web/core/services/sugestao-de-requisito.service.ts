/**
 * IA de levantamento de requisitos — contrato em
 * `.claude/CONTRATO_IA_REQUISITOS.md`.
 *
 * A chave da IA nunca chega ao navegador: quem fala com o modelo é o
 * `apps/api-ts`. Aqui só existe a chamada e a regra de ouro do recurso —
 * **falhou, calou**. Rota fora do ar, 404, tempo esgotado ou resposta
 * estranha devolvem a resposta neutra e a tela segue como se a IA não
 * existisse.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TCampoDeRequisito = "titulo" | "descricao" | "comentario";

/** Item do checklist de aceitação que o chamado ainda não atende. */
export type TItemFaltante = {
  bloco: string;
  item: string;
};

export type TSugestaoDeRequisito = {
  sugestao: string;
  faltando: TItemFaltante[];
};

export type TContextoDeRequisito = {
  projeto?: string;
  entidade?: string;
  titulo?: string;
  descricao?: string;
  comentarios?: string[];
  /**
   * Campos que na modal são SELETOR, não texto. Vão junto para o checklist não
   * cobrar da descrição o que a pessoa já escolheu no campo ao lado. Na criação
   * o chamado ainda não existe no banco, então é a tela quem os informa.
   */
  prioridade?: string;
  prazo?: string;
};

export type TPedidoDeSugestao = {
  campo: TCampoDeRequisito;
  /**
   * Um dos dois é obrigatório — é contra o projeto que a rota confere
   * permissão, e sem isso ela responde 400. Na abertura de chamado temos o
   * `project_id`; no comentário, o `issue_id` (o backend deduz o projeto).
   */
  project_id?: string;
  issue_id?: string;
  texto_atual: string;
  cursor: number;
  tipo?: string | null;
  entity_id?: string | null;
  /** O que a tela já sabe; o servidor usa como reserva. */
  contexto: TContextoDeRequisito;
};

/** Resposta neutra: nada de fantasma, nada de checklist. */
export const SEM_SUGESTAO: TSugestaoDeRequisito = { sugestao: "", faltando: [] };

/**
 * Teto de latência. O contrato dá 2 s ao modelo; passando disso o fantasma
 * chega depois do raciocínio de quem escreve e só atrapalha.
 */
// Medido no modelo local: título ~1,0 s, comentário ~1,5 s, descrição ~2,2 s
// (até 2,7 s), e o OCR do anexo soma antes disso. Com 2,5 s a descrição — que é
// a sugestão mais útil — se perdia na metade das vezes. Tem de ser maior que o
// teto do servidor, senão quem desiste é sempre o navegador.
const TEMPO_LIMITE_MS = 6000;

const lerTexto = (valor: unknown): string => (typeof valor === "string" ? valor : "");

// A grafia oficial da resposta é `suggestion`/`missing`, como o resto da API do
// Plane; `sugestao`/`faltando` são do serviço de IA, que é outra fronteira. O
// backend ainda devolve os dois pares, então lemos os dois — o de fora primeiro.
const lerSugestao = (dados: any): string => lerTexto(dados?.suggestion ?? dados?.sugestao);

const lerFaltando = (dados: any): TItemFaltante[] => {
  const bruto = dados?.missing ?? dados?.faltando;
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((linha: any) => ({
      bloco: lerTexto(linha?.block ?? linha?.bloco),
      item: lerTexto(linha?.item),
    }))
    .filter((linha: TItemFaltante) => linha.item.length > 0);
};

const normalizar = (dados: any): TSugestaoDeRequisito => ({
  sugestao: lerSugestao(dados),
  faltando: lerFaltando(dados),
});

export class SugestaoDeRequisitoService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async sugerir(workspaceSlug: string, pedido: TPedidoDeSugestao): Promise<TSugestaoDeRequisito> {
    return this.post(`/api/workspaces/${workspaceSlug}/ia/sugestao-de-requisito/`, pedido, {
      timeout: TEMPO_LIMITE_MS,
    })
      .then((res) => normalizar(res?.data))
      .catch(() => SEM_SUGESTAO);
  }
}

const sugestaoDeRequisitoService = new SugestaoDeRequisitoService();
export default sugestaoDeRequisitoService;
