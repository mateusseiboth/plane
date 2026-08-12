/**
 * Configuração da IA de requisitos por espaço de trabalho — chave
 * `ia_requisitos` da tabela `WorkspaceSetting`. Contrato em
 * `.claude/CONTRATO_IA_REQUISITOS.md`.
 *
 * Duas frentes usam este arquivo: quem **consome** o recurso (texto fantasma,
 * análise ao salvar) e a tela de configurações do espaço, que também **grava**.
 *
 * A leitura rejeita quando o servidor não responde, e é de propósito: quem
 * consome cai no padrão do contrato pelo hook (`useConfiguracaoDeIa`, que
 * devolve `configuracao` já com o padrão), e quem administra precisa da
 * diferença entre "está assim" e "não consegui ler" — senão a tela mostra os
 * padrões como se fossem o que está gravado e o próximo salvar apaga o que
 * havia.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

/**
 * - `avisar` — mostra a análise e deixa salvar assim mesmo (o padrão).
 * - `exigir` — abaixo do mínimo o salvar fica bloqueado.
 * - `silencioso` — analisa e guarda, sem interromper.
 */
export type TModoDeAnalise = "avisar" | "exigir" | "silencioso";

export type TConfiguracaoDeIa = {
  /** O texto fantasma enquanto digita. */
  fantasma_ativo: boolean;
  /** A análise ao salvar. */
  analise_ativa: boolean;
  analise_em_comentarios: boolean;
  modo: TModoDeAnalise;
  /** Só usado no modo `exigir`. */
  minimo_aceitacao: number;
  /** O medidor de % na modal. */
  mostrar_indicador: boolean;
};

/** O que o servidor devolve: a configuração do espaço mais o estado do serviço. */
export type TConfiguracaoDeIaLida = TConfiguracaoDeIa & {
  /**
   * `false` quando o servidor está sem provedor de IA configurado. As opções
   * continuam gravando, mas nenhuma delas produz efeito nesse estado — a tela
   * de configurações avisa antes que alguém procure o efeito.
   */
  ia_disponivel: boolean;
};

export const CONFIGURACAO_DE_IA_PADRAO: TConfiguracaoDeIa = {
  fantasma_ativo: true,
  analise_ativa: true,
  analise_em_comentarios: true,
  modo: "avisar",
  minimo_aceitacao: 70,
  mostrar_indicador: true,
};

export const MODOS_DE_ANALISE: TModoDeAnalise[] = ["avisar", "exigir", "silencioso"];

export const MINIMO_ACEITACAO_MINIMO = 0;
export const MINIMO_ACEITACAO_MAXIMO = 100;

const MODOS = MODOS_DE_ANALISE;

const lerBooleano = (valor: unknown, padrao: boolean): boolean => (typeof valor === "boolean" ? valor : padrao);

/** Modo desconhecido vira `avisar`: o modo que nunca atrapalha ninguém. */
const lerModo = (valor: unknown): TModoDeAnalise =>
  MODOS.find((modo) => modo === valor) ?? CONFIGURACAO_DE_IA_PADRAO.modo;

const lerMinimo = (valor: unknown): number => {
  const bruto = Number(valor);
  if (!Number.isFinite(bruto)) return CONFIGURACAO_DE_IA_PADRAO.minimo_aceitacao;
  return Math.min(Math.max(Math.round(bruto), MINIMO_ACEITACAO_MINIMO), MINIMO_ACEITACAO_MAXIMO);
};

const normalizar = (dados: any): TConfiguracaoDeIa => ({
  fantasma_ativo: lerBooleano(dados?.fantasma_ativo, CONFIGURACAO_DE_IA_PADRAO.fantasma_ativo),
  analise_ativa: lerBooleano(dados?.analise_ativa, CONFIGURACAO_DE_IA_PADRAO.analise_ativa),
  analise_em_comentarios: lerBooleano(
    dados?.analise_em_comentarios,
    CONFIGURACAO_DE_IA_PADRAO.analise_em_comentarios
  ),
  modo: lerModo(dados?.modo),
  minimo_aceitacao: lerMinimo(dados?.minimo_aceitacao),
  mostrar_indicador: lerBooleano(dados?.mostrar_indicador, CONFIGURACAO_DE_IA_PADRAO.mostrar_indicador),
});

/**
 * Na dúvida, a IA está disponível: dizer "não há IA configurada" sem certeza
 * assusta à toa, e o caminho de quem consome já degrada sozinho.
 */
const normalizarLida = (dados: any): TConfiguracaoDeIaLida => ({
  ...normalizar(dados),
  ia_disponivel: lerBooleano(dados?.ia_disponivel, true),
});

/** Caminho único do recurso: se o backend renomear, muda só aqui. */
const CAMINHO = (workspaceSlug: string) => `/api/workspaces/${workspaceSlug}/ia/configuracao/`;

export class ConfiguracaoDeIaService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** Leitura para qualquer membro do espaço. */
  async ler(workspaceSlug: string): Promise<TConfiguracaoDeIaLida> {
    return this.get(CAMINHO(workspaceSlug))
      .then((res) => normalizarLida(res?.data))
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Escrita parcial — só administrador do espaço. O servidor mescla com o gravado. */
  async salvar(workspaceSlug: string, valores: Partial<TConfiguracaoDeIa>): Promise<TConfiguracaoDeIaLida> {
    return this.patch(CAMINHO(workspaceSlug), valores)
      .then((res) => normalizarLida(res?.data))
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

const configuracaoDeIaService = new ConfiguracaoDeIaService();
export default configuracaoDeIaService;
