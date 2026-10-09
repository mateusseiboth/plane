/**
 * Formato do `referencia.json`, a referência do SDK gerada do código por
 * `scripts/gerar-referencia.ts`. A página de desenvolvedores do web lê este
 * arquivo; mudar o formato aqui pede mudar a página junto.
 */

export type TParametroDaReferencia = { nome: string; tipo: string; opcional: boolean; descricao: string };

export type TFuncaoDaReferencia = {
  nome: string;
  descricao: string;
  assinatura: string;
  parametros: TParametroDaReferencia[];
  retorno: { tipo: string; descricao: string };
  exemplo: string;
  /** Permissão do manifesto que a chamada exige; vazio quando não exige nenhuma. */
  permissao: string;
};

export type TApiDaReferencia = {
  nome: string;
  descricao: string;
  permissao: string;
  metodos: TFuncaoDaReferencia[];
};

export type TCampoDaReferencia = { nome: string; tipo: string; obrigatorio: boolean; descricao: string };

export type TTipoDaReferencia = {
  nome: string;
  descricao: string;
  /** `interface X<T>` ou `type X = ...`. */
  definicao: string;
  campos: TCampoDaReferencia[];
  /** Valores aceitos, quando o tipo é uma união de literais. */
  valores: string[];
};

export type TConstanteDaReferencia = {
  nome: string;
  descricao: string;
  campos: TCampoDaReferencia[];
  valor: unknown;
};

export type TReferencia = {
  pacote: {
    nome: string;
    versao: string;
    descricao: string;
    /** URL git do repositório (campo `repository.url` do package.json). */
    repositorio: string;
    /** Pasta do pacote dentro do repositório. */
    diretorio: string;
  };
  /** Todos os exports públicos do pacote, em ordem alfabética. */
  exports: string[];
  funcoes: TFuncaoDaReferencia[];
  hooks: TFuncaoDaReferencia[];
  apis: TApiDaReferencia[];
  tipos: TTipoDaReferencia[];
  constantes: TConstanteDaReferencia[];
  manifesto: { descricao: string; campos: TCampoDaReferencia[]; exemplo: string };
  permissoes: Array<{ chave: string; libera: string; usadaPor: string[] }>;
  cicloDeVida: Array<{ etapa: string; descricao: string }>;
  eventos: Array<{ nome: string; origem: string; payload: string; descricao: string }>;
  erros: Array<{ status: number; quando: string }>;
  limites: Array<{ nome: string; valor: number | string; descricao: string }>;
};
