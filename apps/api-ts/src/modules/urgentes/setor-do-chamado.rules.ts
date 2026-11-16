/**
 * Em que setor o chamado está. No legado isso era uma coluna (`chamados_setor`);
 * aqui sai da matriz de Funções, para que mudar as regras pela tela mude o que
 * a pessoa vê, sem lista fixa de setor no código:
 *
 *   - na triagem, o setor que tria (`intake.review`). Admin e Gestor também
 *     triam, então vale o MAIS ESPECÍFICO: o de menor nível;
 *   - nas outras etapas, o setor do responsável, quando ele é dono da etapa
 *     (pode sair dela). O atendente que abriu segue como responsável depois do
 *     aceite e não pode fazer o chamado parecer estar no Atendimento;
 *   - sem responsável dono, os donos da etapa.
 */

export type FuncaoDoEspaco = { id: string; name: string; level: number; permissions: string[] };
export type TransicaoPermitida = { fromStateName: string; roleId: string };
export type DonosPorEtapa = Map<string, string[]>;

export type ChamadoNoSetor = { etapa: string; grupo: string; setoresDosResponsaveis: string[] };
export type ContextoDoSetor = { donosPorEtapa: DonosPorEtapa; setorDaTriagem: string | null };

const ACAO_DE_TRIAR = "intake.review";

const withoutRepetidos = (nomes: string[]) => [...new Set(nomes)];

const joinSetores = (nomes: string[]) => (nomes.length ? withoutRepetidos(nomes).join(" / ") : null);

/** A função mais específica que tria: a de menor nível com `intake.review`. */
export const findSetorDaTriagem = (funcoes: FuncaoDoEspaco[]): string | null =>
  funcoes.filter((funcao) => funcao.permissions.includes(ACAO_DE_TRIAR)).toSorted((a, b) => a.level - b.level)[0]
    ?.name ?? null;

/** Etapa → nomes das funções que podem sair dela, na ordem de nível. */
export const buildDonosPorEtapa = (transicoes: TransicaoPermitida[], funcoes: FuncaoDoEspaco[]): DonosPorEtapa => {
  const porId = new Map(funcoes.map((funcao) => [funcao.id, funcao]));
  const donos = new Map<string, FuncaoDoEspaco[]>();
  for (const { fromStateName, roleId } of transicoes) {
    const funcao = porId.get(roleId);
    if (!fromStateName || !funcao) continue;
    donos.set(fromStateName, [...(donos.get(fromStateName) ?? []), funcao]);
  }
  return new Map(
    [...donos].map(([etapa, lista]) => [
      etapa,
      withoutRepetidos(lista.toSorted((a, b) => a.level - b.level).map((f) => f.name)),
    ])
  );
};

const GRUPO_DA_TRIAGEM = "triage";

/** O setor em que o chamado está, ou `null` quando a matriz não diz. */
export const buildSetorDoChamado = (chamado: ChamadoNoSetor, contexto: ContextoDoSetor): string | null => {
  if (chamado.grupo === GRUPO_DA_TRIAGEM) return contexto.setorDaTriagem;
  const donos = contexto.donosPorEtapa.get(chamado.etapa) ?? [];
  const responsaveisDonos = chamado.setoresDosResponsaveis.filter((setor) => donos.includes(setor));
  if (responsaveisDonos.length) return joinSetores(responsaveisDonos);
  return joinSetores(donos.length ? donos : chamado.setoresDosResponsaveis);
};
