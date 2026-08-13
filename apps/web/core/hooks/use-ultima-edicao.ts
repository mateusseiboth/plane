/**
 * Última vez que alguém mexeu no chamado — e quem foi.
 *
 * O dono do produto liberou a edição de título e descrição com a condição de
 * ficar marcado que houve edição e por quem. A linha "Última edição por Fulano
 * há N dias" saía do histórico de versões, que só conhece a descrição: quando
 * não havia versão nenhuma, ela caía no criador e na data de criação e
 * anunciava como "última edição" algo que nunca foi editado.
 *
 * A verdade está na trilha de atividades, onde o servidor registra `name` a
 * cada troca de título e `description` a cada sessão de edição do corpo.
 */
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";

export type TEdicaoRegistrada = {
  /** Quando o chamado foi editado pela última vez. */
  at: Date;
  /** Quem editou; indefinido quando o usuário não está mais no espaço. */
  byDisplayName: string | undefined;
};

/** Campos da trilha que contam como "editaram o chamado". */
const CAMPOS_DE_EDICAO = new Set(["name", "description"]);

export const useUltimaEdicao = (issueId: string | undefined): TEdicaoRegistrada | undefined => {
  const {
    activity: { getActivitiesByIssueId, getActivityById },
  } = useIssueDetail();
  const { getUserDetails } = useMember();

  if (!issueId) return undefined;

  // A trilha chega em ordem cronológica: a edição mais recente é a primeira que
  // aparece de trás para frente.
  const atividades = getActivitiesByIssueId(issueId) ?? [];
  for (let i = atividades.length - 1; i >= 0; i--) {
    const atividade = getActivityById(atividades[i]);
    if (!atividade?.field || !CAMPOS_DE_EDICAO.has(atividade.field) || !atividade.created_at) continue;
    return {
      at: new Date(atividade.created_at),
      byDisplayName: getUserDetails(atividade.actor)?.display_name,
    };
  }

  return undefined;
};
