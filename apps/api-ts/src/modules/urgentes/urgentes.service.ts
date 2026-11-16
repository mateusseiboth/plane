/**
 * A faixa de URGENTES do topo: todo urgente em aberto do espaço, com o setor em
 * que está (ver setor-do-chamado.rules). O setor é o que diz ao atendimento com
 * quem está o pedido do cliente.
 */
import {
  findFuncaoDosMembros,
  findFuncoesDoEspaco,
  findTransicoesPermitidas,
  findUrgentesAbertos,
} from "@modules/urgentes/urgentes.dao";
import {
  buildDonosPorEtapa,
  buildSetorDoChamado,
  findSetorDaTriagem,
  type ContextoDoSetor,
  type FuncaoDoEspaco,
} from "@modules/urgentes/setor-do-chamado.rules";

type Urgente = Awaited<ReturnType<typeof findUrgentesAbertos>>[number];

const readPermissoes = (valor: unknown): string[] =>
  Array.isArray(valor) ? valor.filter((p): p is string => typeof p === "string") : [];

const buildSetoresDosResponsaveis = (urgente: Urgente, setorPorPessoa: Map<string, string>) =>
  urgente.assignees.map((a) => setorPorPessoa.get(a.assigneeId)).filter((setor): setor is string => !!setor);

const serializeUrgente = (urgente: Urgente, setor: string | null) => ({
  id: urgente.id,
  name: urgente.name,
  priority: urgente.priority,
  sequence_id: urgente.sequenceId,
  legacy_ticket_number: urgente.legacyTicketNumber ?? null,
  state: urgente.state ? { name: urgente.state.name, group: urgente.state.group, color: urgente.state.color } : null,
  project: urgente.project
    ? { id: urgente.project.id, identifier: urgente.project.identifier, name: urgente.project.name }
    : null,
  assignee_ids: urgente.assignees.map((a) => a.assigneeId),
  setor,
  updated_at: urgente.updatedAt?.toISOString(),
});

export async function listUrgentes(workspaceId: string) {
  const [urgentes, funcoesBrutas, transicoes] = await Promise.all([
    findUrgentesAbertos(workspaceId),
    findFuncoesDoEspaco(workspaceId),
    findTransicoesPermitidas(workspaceId),
  ]);
  const funcoes: FuncaoDoEspaco[] = funcoesBrutas.map((f) => ({ ...f, permissions: readPermissoes(f.permissions) }));
  const nomeDaFuncao = new Map(funcoes.map((f) => [f.id, f.name]));
  const pessoas = [...new Set(urgentes.flatMap((u) => u.assignees.map((a) => a.assigneeId)))];
  const setorPorPessoa = new Map(
    (await findFuncaoDosMembros(workspaceId, pessoas)).map((m) => [
      m.memberId,
      nomeDaFuncao.get(m.workflowRoleId!) ?? "",
    ])
  );
  const contexto: ContextoDoSetor = {
    donosPorEtapa: buildDonosPorEtapa(transicoes, funcoes),
    setorDaTriagem: findSetorDaTriagem(funcoes),
  };
  return urgentes.map((urgente) =>
    serializeUrgente(
      urgente,
      buildSetorDoChamado(
        {
          etapa: urgente.state?.name ?? "",
          grupo: urgente.state?.group ?? "",
          setoresDosResponsaveis: buildSetoresDosResponsaveis(urgente, setorPorPessoa),
        },
        contexto
      )
    )
  );
}
