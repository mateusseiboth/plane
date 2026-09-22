/**
 * Regras puras da tela do pós-atendimento. Os códigos são os do SAC e os mesmos
 * da API (`pos-atendimento.codes.ts`); a API confere tudo de novo.
 */
import type { TPosFiltros, TPosForm, TPosOrigem, TPosSituacao } from "@/components/pos-atendimento/types";

/** Ações da matriz que a tela consulta com `can(...)`. */
export const POS_ACTIONS = {
  RECORD: "posatendimento.record",
  VERIFY: "posatendimento.verify",
  REPORT: "report.view",
} as const;

type TOpcao = { value: string; label: string };

export const EXPECTATIVA_OPTIONS: TOpcao[] = [
  { value: "4", label: "Sim" },
  { value: "3", label: "Parcialmente" },
  { value: "2", label: "Não" },
  { value: "1", label: "Não era o que precisava" },
];

export const CLASSIFICACAO_OPTIONS: TOpcao[] = [
  { value: "3", label: "Ótimo" },
  { value: "2", label: "Bom" },
  { value: "1", label: "Ruim" },
];

export const PROBLEMA_RESOLVIDO_OPTIONS: TOpcao[] = [
  { value: "sim", label: "Sim" },
  { value: "parcial", label: "Parcialmente" },
  { value: "nao", label: "Não" },
];

const MEIOS_DE_CONTATO: TOpcao[] = [
  { value: "1", label: "Telefone" },
  { value: "2", label: "E-mail" },
  { value: "4", label: "Chat" },
  { value: "5", label: "Remoto" },
];

const COMUNICADOR_INTERNO: TOpcao = { value: "6", label: "Comunicador interno" };

/** No legado só a Qualidade registrava pelo comunicador interno; aqui, quem verifica. */
export const getMeioContatoOptions = (canVerify: boolean): TOpcao[] =>
  canVerify ? [...MEIOS_DE_CONTATO, COMUNICADOR_INTERNO] : MEIOS_DE_CONTATO;

export const POS_FORM_VAZIO: TPosForm = {
  expectativa: "",
  classificacao: "",
  problema_resolvido: "",
  meio_contato: "",
  observacao: "",
};

const toCodigo = (valor: string): number | null => (valor ? Number(valor) : null);

/** Só a visita pergunta se o problema foi resolvido. */
const EXTRA_POR_ORIGEM: Record<TPosOrigem, (form: TPosForm) => Record<string, unknown>> = {
  issue: () => ({}),
  visit: (form) => ({ problema_resolvido: form.problema_resolvido || null }),
};

export const buildPosPayload = (form: TPosForm, origem: TPosOrigem) => ({
  expectativa: toCodigo(form.expectativa),
  classificacao: toCodigo(form.classificacao),
  meio_contato: toCodigo(form.meio_contato),
  observacao: form.observacao.trim(),
  ...EXTRA_POR_ORIGEM[origem](form),
});

export const SITUACAO_TABS: { key: TPosSituacao; label: string }[] = [
  { key: "pending", label: "Pendentes de pós-atendimento" },
  { key: "to_verify", label: "Pendentes de verificação" },
  { key: "verified", label: "Verificados" },
];

export const ORIGEM_OPTIONS: { value: TPosFiltros["origem"]; label: string }[] = [
  { value: "all", label: "Chamados e visitas" },
  { value: "issue", label: "Chamados" },
  { value: "visit", label: "Visitas" },
];

export const POS_FILTROS_INICIAIS: TPosFiltros = {
  situacao: "pending",
  origem: "all",
  project_id: null,
  entity_id: null,
  responsavel_id: null,
  desde: "",
  ate: "",
};

const FILTROS_DA_FILA: (keyof TPosFiltros)[] = [
  "situacao",
  "origem",
  "project_id",
  "entity_id",
  "responsavel_id",
  "desde",
  "ate",
];

const FILTROS_DO_RELATORIO: (keyof TPosFiltros)[] = ["origem", "project_id", "entity_id", "desde", "ate"];

const pickPreenchidos = (filtros: TPosFiltros, chaves: (keyof TPosFiltros)[]): Record<string, string> =>
  Object.fromEntries(chaves.filter((chave) => !!filtros[chave]).map((chave) => [chave, String(filtros[chave])]));

/** Cursor no formato da API (`limite:página:0`). */
export const buildPosFilaParams = (filtros: TPosFiltros, pagina: number, porPagina: number) => ({
  ...pickPreenchidos(filtros, FILTROS_DA_FILA),
  per_page: String(porPagina),
  cursor: `${porPagina}:${pagina}:0`,
});

export const buildSatisfacaoParams = (filtros: TPosFiltros) => pickPreenchidos(filtros, FILTROS_DO_RELATORIO);

type TEtapa = { id: string; group: string; sequence: number };

/** Etapa para onde "Concluir" leva: a primeira do grupo concluído (padrão: Concluído). */
export const findCompletedStateId = (estados: TEtapa[]): string | null =>
  estados
    .filter((e) => e.group === "completed")
    .reduce<TEtapa | null>((primeira, e) => (!primeira || e.sequence < primeira.sequence ? e : primeira), null)?.id ??
  null;

const LINK_POR_ORIGEM: Record<TPosOrigem, (slug: string, item: { id: string; project_id: string | null }) => string> = {
  issue: (slug, item) => `/${slug}/projects/${item.project_id}/issues/${item.id}`,
  visit: (slug, item) => `/${slug}/visits/${item.id}`,
};

export const getAlvoLink = (slug: string, item: { origem: TPosOrigem; id: string; project_id: string | null }) =>
  LINK_POR_ORIGEM[item.origem](slug, item);

const ENCERRADOS = new Set(["completed", "cancelled"]);

/** O atalho só faz sentido enquanto o chamado ainda não foi encerrado. */
export const isConcluirComPosVisivel = ({ stateGroup, canRecord }: { stateGroup?: string; canRecord: boolean }) =>
  canRecord && !!stateGroup && !ENCERRADOS.has(stateGroup);

export const formatData = (valor?: string | null) => (valor ? new Date(valor).toLocaleDateString("pt-BR") : "");
