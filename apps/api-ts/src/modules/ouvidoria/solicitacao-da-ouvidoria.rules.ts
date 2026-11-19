/**
 * Solicitação criada a partir da ouvidoria (testes da nova intranet 3,
 * 19/11/2026), sem banco: o texto que a solicitação leva, quem pode ser o
 * atendente e como o processo aparece na ouvidoria.
 */
import { OUVIDORIA_KIND_LABEL, type OuvidoriaKind } from "@modules/ouvidoria/ouvidoria.rules";
import { escapeHtml } from "@utils/email-template";
import { createFieldError } from "@utils/field-error";
import { readSituacao } from "@utils/situacao-da-solicitacao";

type Ouvidoria = { kind: string; name: string; phone: string | null; message: string; protocol: string | null };

const rotuloDoTipo = (kind: string) => OUVIDORIA_KIND_LABEL[kind as OuvidoriaKind] ?? kind;

export const buildTituloDaOuvidoria = (o: Ouvidoria, titulo?: unknown): string => {
  const digitado = typeof titulo === "string" ? titulo.trim() : "";
  return (digitado || `${rotuloDoTipo(o.kind)} da ouvidoria: ${o.name}`).slice(0, 255);
};

/** O relato da ouvidoria, escapado: veio de fora (robô do chat). */
export const buildDescricaoDaOuvidoria = (o: Ouvidoria): string => {
  const quem = [o.name, o.phone].filter(Boolean).join(", ");
  const protocolo = o.protocol ? ` Protocolo ${escapeHtml(o.protocol)}.` : "";
  return [
    `<p><strong>${escapeHtml(rotuloDoTipo(o.kind))} da ouvidoria.</strong> ${escapeHtml(quem)}.${protocolo}</p>`,
    `<p>${escapeHtml(o.message).replace(/\n/g, "<br />")}</p>`,
  ].join("");
};

export const MENSAGEM_ATENDENTE_INVALIDO = "Escolha alguém do Atendimento (quem abre solicitações).";
export const MENSAGEM_JA_TEM_SOLICITACAO = "Esta ouvidoria já tem uma solicitação.";

export const requireAtendente = (podeAbrirSolicitacao: boolean): void => {
  if (podeAbrirSolicitacao) return;
  throw createFieldError("atendente_id", MENSAGEM_ATENDENTE_INVALIDO);
};

/** A situação na língua da ouvidoria, do mesmo corte das abas de Solicitações. */
const ROTULO_DA_SITUACAO: Record<string, string> = {
  "-3": "No atendimento",
  "-2": "Pendente",
  "-1": "Recusada",
  "0": "Adiada",
  "1": "Aceita",
  "2": "Duplicada",
  "3": "Atendida",
  concluido: "Concluída",
};

/** O que cada atividade do chamado conta no processo. Atividade que não está aqui não aparece. */
const EVENTOS_DO_PROCESSO: Record<string, (a: Atividade) => string> = {
  issue: () => "Solicitação criada",
  solicitacao_encaminhada: () => "Encaminhada para a triagem",
  state: (a) => `Etapa: ${a.newValue ?? ""}`.trim(),
  solicitacao_atendida: () => "Atendida",
};

type Atividade = { field: string | null; newValue: string | null; createdAt: Date };

export type SolicitacaoDaOuvidoria = {
  id: string;
  name: string;
  projectId: string;
  sequenceId: number;
  project: { identifier: string; name: string } | null;
  state: { group: string; name: string } | null;
  assignees: { assigneeId: string }[];
  intakeIssues: { status: number }[];
  activities: Atividade[];
};

export const serializeSolicitacaoDaOuvidoria = (s: SolicitacaoDaOuvidoria) => {
  const status = s.intakeIssues[0]?.status ?? -2;
  // A encerrada no atendimento é atendida sem sair da triagem: "concluido" aqui seria chamado concluído.
  const chave = s.state?.group === "triage" ? String(status) : readSituacao(status, s.state?.group ?? null);
  return {
    issue_id: s.id,
    project_id: s.projectId,
    numero: `${s.project?.name ?? ""} · ${s.project?.identifier ?? ""}-${s.sequenceId}`,
    titulo: s.name,
    situacao: ROTULO_DA_SITUACAO[chave] ?? chave,
    etapa: s.state?.name ?? null,
    atendente: s.assignees[0]?.assigneeId ?? null,
    processo: s.activities
      .filter((a) => a.field && EVENTOS_DO_PROCESSO[a.field])
      .map((a) => ({ evento: EVENTOS_DO_PROCESSO[a.field as string](a), em: a.createdAt.toISOString() })),
  };
};
