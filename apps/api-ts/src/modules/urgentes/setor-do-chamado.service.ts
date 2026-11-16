/**
 * O setor em que cada chamado está, lido da matriz de Funções do espaço (ver
 * setor-do-chamado.rules). Fonte única da faixa de urgentes e da lista de
 * solicitações.
 */
import { findFuncaoDosMembros, findFuncoesDoEspaco, findTransicoesPermitidas } from "@modules/urgentes/urgentes.dao";
import {
  buildDonosPorEtapa,
  buildSetorDoChamado,
  findSetorDaTriagem,
  type FuncaoDoEspaco,
} from "@modules/urgentes/setor-do-chamado.rules";

export type ChamadoParaSetor = {
  id: string;
  state: { name: string; group: string } | null;
  assigneeIds: string[];
};

const readPermissoes = (valor: unknown): string[] =>
  Array.isArray(valor) ? valor.filter((p): p is string => typeof p === "string") : [];

/** Chamado → setor (ou `null` quando a matriz não diz). */
export async function findSetoresDosChamados(
  workspaceId: string,
  chamados: ChamadoParaSetor[]
): Promise<Map<string, string | null>> {
  const pessoas = [...new Set(chamados.flatMap((c) => c.assigneeIds))];
  const [funcoesBrutas, transicoes, funcaoDosMembros] = await Promise.all([
    findFuncoesDoEspaco(workspaceId),
    findTransicoesPermitidas(workspaceId),
    findFuncaoDosMembros(workspaceId, pessoas),
  ]);
  const funcoes: FuncaoDoEspaco[] = funcoesBrutas.map((f) => ({
    id: f.id,
    name: f.name,
    level: f.level,
    permissions: readPermissoes(f.permissions),
  }));
  const nomeDaFuncao = new Map(funcoes.map((f) => [f.id, f.name]));
  const setorPorPessoa = new Map(
    funcaoDosMembros.map((m) => [m.memberId, nomeDaFuncao.get(m.workflowRoleId ?? "") ?? ""])
  );
  const contexto = {
    donosPorEtapa: buildDonosPorEtapa(transicoes, funcoes),
    setorDaTriagem: findSetorDaTriagem(funcoes),
  };
  return new Map(
    chamados.map((chamado) => [
      chamado.id,
      buildSetorDoChamado(
        {
          etapa: chamado.state?.name ?? "",
          grupo: chamado.state?.group ?? "",
          setoresDosResponsaveis: chamado.assigneeIds.map((id) => setorPorPessoa.get(id) ?? "").filter(Boolean),
        },
        contexto
      ),
    ])
  );
}
