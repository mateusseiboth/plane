/**
 * Tabelas de código do pós-atendimento. Os números são os do SAC legado
 * (`posatendimento_tipo`, `_solucao`, `_satisfacao`) e vão assim para o banco:
 * o histórico importado e o registro novo se leem com a mesma tabela.
 */

/** `posatendimento_tipo`. MSN só existe no histórico. */
export const MEIO_CONTATO = {
  TELEFONE: 1,
  EMAIL: 2,
  MSN: 3,
  CHAT: 4,
  REMOTO: 5,
  COMUNICADOR_INTERNO: 6,
} as const;
export type MeioContato = (typeof MEIO_CONTATO)[keyof typeof MEIO_CONTATO];

/** `posatendimento_solucao`: "este chamado atendeu as expectativas do cliente?" */
export const EXPECTATIVA = { SIM: 4, PARCIALMENTE: 3, NAO: 2, NAO_ERA_O_QUE_PRECISAVA: 1 } as const;
export type Expectativa = (typeof EXPECTATIVA)[keyof typeof EXPECTATIVA];

/** `posatendimento_satisfacao`: "como o cliente classifica este atendimento?" */
export const CLASSIFICACAO = { OTIMO: 3, BOM: 2, RUIM: 1 } as const;
export type Classificacao = (typeof CLASSIFICACAO)[keyof typeof CLASSIFICACAO];

/** Campo novo (não existe no legado), só da visita. */
export const PROBLEMA_RESOLVIDO = { SIM: "sim", PARCIAL: "parcial", NAO: "nao" } as const;
export type ProblemaResolvido = (typeof PROBLEMA_RESOLVIDO)[keyof typeof PROBLEMA_RESOLVIDO];

export const POS_ORIGEM = { CHAMADO: "issue", VISITA: "visit" } as const;
export type PosOrigem = (typeof POS_ORIGEM)[keyof typeof POS_ORIGEM];

/** As três situações da fila legada (`sac_posAtendimento.php`). */
export const POS_SITUACAO = {
  PENDENTE_POS: "pending",
  PENDENTE_VERIFICACAO: "to_verify",
  VERIFICADO: "verified",
} as const;
export type PosSituacao = (typeof POS_SITUACAO)[keyof typeof POS_SITUACAO];

export const MEIO_CONTATO_LABELS: Record<MeioContato, string> = {
  1: "Telefone",
  2: "E-mail",
  3: "MSN",
  4: "Chat",
  5: "Remoto",
  6: "Comunicador interno",
};

export const EXPECTATIVA_LABELS: Record<Expectativa, string> = {
  4: "Sim",
  3: "Parcialmente",
  2: "Não",
  1: "Não era o que precisava",
};

export const CLASSIFICACAO_LABELS: Record<Classificacao, string> = { 3: "Ótimo", 2: "Bom", 1: "Ruim" };

export const PROBLEMA_RESOLVIDO_LABELS: Record<ProblemaResolvido, string> = {
  sim: "Sim",
  parcial: "Parcialmente",
  nao: "Não",
};

export const POS_SITUACAO_LABELS: Record<PosSituacao, string> = {
  pending: "Pendente de pós-atendimento",
  to_verify: "Pendente de verificação",
  verified: "Verificado",
};

export const SEM_RESPOSTA = "Não informado";

/** Valor que chega de fora só é do tipo depois de passar por aqui. */
export const isCodigoDe = <T extends Record<string, string | number>>(tabela: T, valor: unknown): valor is T[keyof T] =>
  Object.values(tabela).includes(valor as string | number);

const labelOf =
  <K extends string | number>(labels: Record<K, string>) =>
  (codigo: unknown): string =>
    labels[codigo as K] ?? SEM_RESPOSTA;

export const getMeioContatoLabel = labelOf(MEIO_CONTATO_LABELS);
export const getExpectativaLabel = labelOf(EXPECTATIVA_LABELS);
export const getClassificacaoLabel = labelOf(CLASSIFICACAO_LABELS);
export const getProblemaResolvidoLabel = labelOf(PROBLEMA_RESOLVIDO_LABELS);
