/**
 * Contrato do pós-atendimento (apps/api-ts/src/modules/pos-atendimento). Um tipo
 * só para tela, serviço e impressão.
 */

export type TPosOrigem = "issue" | "visit";
export type TPosSituacao = "pending" | "to_verify" | "verified";
export type TProblemaResolvido = "sim" | "parcial" | "nao";

export type TPosPessoa = { id: string; display_name: string };

export type TPosAtendimento = {
  id: string;
  origem: TPosOrigem;
  issue_id: string | null;
  visit_id: string | null;
  expectativa: number | null;
  expectativa_label: string;
  classificacao: number | null;
  classificacao_label: string;
  problema_resolvido: TProblemaResolvido | null;
  problema_resolvido_label: string | null;
  meio_contato: number | null;
  meio_contato_label: string;
  observacao: string;
  recorded_by: TPosPessoa | null;
  recorded_at: string;
  verified_by: TPosPessoa | null;
  verified_at: string | null;
  verification_comment: string | null;
  situacao: TPosSituacao;
  situacao_label: string;
  is_legacy: boolean;
};

export type TPosFilaItem = {
  origem: TPosOrigem;
  id: string;
  code: string;
  ticket_number: string | null;
  title: string;
  project_id: string | null;
  sequence_id: number | null;
  sistemas: { id: string; name: string; identifier: string }[];
  entity: { id: string; name: string } | null;
  responsaveis: TPosPessoa[];
  concluded_at: string;
  situacao: TPosSituacao;
  situacao_label: string;
  pos: TPosAtendimento | null;
};

export type TPosPagina = {
  results: TPosFilaItem[];
  total_count: number;
  next_page_results: boolean;
  prev_page_results: boolean;
};

export type TPosPainel = { concluido: boolean; pos: TPosAtendimento | null };

export type TPosFiltros = {
  situacao: TPosSituacao;
  origem: TPosOrigem | "all";
  project_id: string | null;
  entity_id: string | null;
  responsavel_id: string | null;
  desde: string;
  ate: string;
};

export type TPosForm = {
  expectativa: string;
  classificacao: string;
  problema_resolvido: string;
  meio_contato: string;
  observacao: string;
};

type TFaixa = { codigo: number | null; label: string; total: number; percentual: number };
type TGrupo = { id: string | null; name: string; total: number; notas: Record<string, number> };

export type TSatisfacao = {
  total: number;
  classificacao: TFaixa[];
  expectativa: TFaixa[];
  por_sistema: TGrupo[];
  por_entidade: TGrupo[];
};

export type TPosApiError = { detail?: string; errors?: { path: string; message: string }[] };
