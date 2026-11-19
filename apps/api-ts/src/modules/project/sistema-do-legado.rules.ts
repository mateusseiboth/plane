/**
 * Como um sistema do legado (`quality_site.sistemas`) vira sistema no Plane.
 * Regras puras: quem aplica é `scripts/migrate-sac.ts` (importação) e
 * `scripts/ajustar-sistemas-do-legado.ts` (acerto do que já foi importado).
 */

export type SistemaDoLegado = {
  sistemas_id: number;
  sistemas_nome: string | null;
  sistemas_apelido: string | null;
  categoria: number | null;
};

/** Categoria 3 = sistema web. A intranet mostra "(WEB)"; aqui vai no nome. */
const CATEGORIA_WEB = 3;
const TAMANHO_DO_NOME = 255;
const DIZ_WEB = /\bweb\b/i;
/** Observação final entre parênteses: "GED (descontinuado)". */
const OBSERVACAO_FINAL = /^(.*?)\s*(\([^()]*\))$/;

/**
 * Sistemas que a intranet esconde no seletor de sistema (lista fixa em
 * funcoesAjaxTickets.php e funcoesAjaxChatCliente.php). No legado todos estão
 * com status 1; estes são os que não atendem mais. No Plane são arquivados.
 */
const SISTEMAS_INATIVOS_NO_LEGADO: ReadonlySet<number> = new Set([65, 12, 70, 55, 21, 22, 24, 103, 104, 105]);

export const isSistemaInativoNoLegado = (sistemasId: number): boolean => SISTEMAS_INATIVOS_NO_LEGADO.has(sistemasId);

const addIndicadorWeb = (nome: string): string => {
  if (DIZ_WEB.test(nome)) return nome;
  const comObservacao = OBSERVACAO_FINAL.exec(nome);
  if (!comObservacao) return `${nome} Web`;
  return `${comObservacao[1]} Web ${comObservacao[2]}`;
};

export const buildNomeDoSistema = (sistema: SistemaDoLegado): string => {
  const nome = (sistema.sistemas_apelido || sistema.sistemas_nome || `Sistema ${sistema.sistemas_id}`).trim();
  const comIndicador = sistema.categoria === CATEGORIA_WEB ? addIndicadorWeb(nome) : nome;
  return comIndicador.slice(0, TAMANHO_DO_NOME);
};

type SistemaNoPlane = { name: string; archivedAt: Date | null };
export type AjusteDoSistema = { name?: string; archivedAt?: Date };

/** O nome que a importação antiga gravava (sem o indicador web). */
const readNomeImportado = (sistema: SistemaDoLegado): string => buildNomeDoSistema({ ...sistema, categoria: null });

/**
 * O que muda num sistema já importado. Só renomeia quem ainda tem o nome da
 * importação: nome trocado à mão no Plane fica. Só arquiva, nunca desarquiva:
 * reativar um sistema é decisão de quem administra.
 */
export const buildAjusteDoSistema = (
  projeto: SistemaNoPlane,
  sistema: SistemaDoLegado,
  agora: Date
): AjusteDoSistema => {
  const nome = buildNomeDoSistema(sistema);
  // A importação antiga não tirava o espaço do fim ("Licitação ").
  const renomear = projeto.name !== nome && projeto.name.trim() === readNomeImportado(sistema);
  const arquivar = projeto.archivedAt === null && isSistemaInativoNoLegado(sistema.sistemas_id);
  return {
    ...(renomear ? { name: nome } : {}),
    ...(arquivar ? { archivedAt: agora } : {}),
  };
};
