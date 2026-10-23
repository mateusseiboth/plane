/**
 * Sugestões da wiki para quem abre solicitação: as páginas parecidas com o
 * problema descrito e, quando há IA no servidor, o que fazer a partir delas.
 *
 * A IA é a mesma do módulo `ia-requisitos` (configuração do processo e fábrica
 * de provedores) e segue as regras dele: nunca derruba a tela (sem IA, com
 * erro ou lenta, a sugestão vem `null` com o motivo) e a saída do texto para
 * fora da aplicação fica na trilha LGPD, contada e não copiada.
 */
import { configIaRequisitos } from "@modules/ia-requisitos/config";
import { criarProvedor } from "@modules/ia-requisitos/provedores";
import type { ProvedorDeIa } from "@modules/ia-requisitos/tipos";
import {
  findPaginasDoContexto,
  findPaginasParecidas,
  recorteDaSolicitacao,
  type AlcanceDasPaginas,
  type PaginaDoContexto,
} from "@modules/wiki-sugestoes/wiki-sugestoes.dao";
import {
  buildConsultaDaWiki,
  buildEnderecoDaPagina,
  LIMITE_DE_PAGINAS_DA_WIKI,
  limitSugestao,
  MOTIVO_DA_SUGESTAO,
  type PedidoDeResolucao,
} from "@modules/wiki-sugestoes/wiki-sugestoes.rules";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import { EProjectAction, hasWorkspaceAction } from "@utils/permission-checks";

type Espaco = { id: string; slug: string };
type Solicitante = { id: string; email?: string | null };

export type SugestaoDaWiki = {
  id: string;
  name: string;
  project_id: string | null;
  trecho: string;
  url: string;
};

export type SugestaoDeSolucao = { sugestao: string } | { sugestao: null; motivo: string };

/**
 * As duas rotas exigem `intake.create`, então o recorte é sempre o de quem abre
 * solicitação: páginas públicas de qualquer sistema, sem vínculo.
 */
const readAlcance = async (workspaceId: string, userId: string): Promise<AlcanceDasPaginas> => ({
  workspaceId,
  userId,
  includeWiki: await hasWorkspaceAction(workspaceId, userId, EProjectAction.WIKI_VIEW),
});

/** Até 5 páginas parecidas com o texto; texto sem termo útil devolve lista vazia. */
export async function findSugestoesDaWiki(args: {
  espaco: Espaco;
  userId: string;
  texto: string;
  projectId: string | null;
}): Promise<SugestaoDaWiki[]> {
  const consulta = buildConsultaDaWiki(args.texto);
  if (!consulta) return [];

  const paginas = await findPaginasParecidas({
    alcance: await readAlcance(args.espaco.id, args.userId),
    recorte: recorteDaSolicitacao,
    consulta,
    projectIdPreferido: args.projectId,
    limite: LIMITE_DE_PAGINAS_DA_WIKI,
  });
  return paginas.map((pagina) => {
    const endereco = buildEnderecoDaPagina({
      slug: args.espaco.slug,
      pageId: pagina.id,
      projectIds: pagina.project_ids,
      projectIdPreferido: args.projectId,
    });
    return {
      id: pagina.id,
      name: pagina.name,
      project_id: endereco.project_id,
      trecho: pagina.trecho,
      url: endereco.url,
    };
  });
}

const withoutSugestao = (motivo: string): SugestaoDeSolucao => ({ sugestao: null, motivo });

/** O provedor configurado no servidor, ou `null` quando não há IA. */
const readProvedor = (): ProvedorDeIa | null => {
  const cfg = configIaRequisitos();
  return cfg.ligada ? criarProvedor(cfg) : null;
};

/** LGPD: o problema do cliente saiu para a IA. Registra quanto e para onde, não o conteúdo. */
const saveTrilhaDaSaida = (args: {
  espaco: Espaco;
  user: Solicitante;
  headers: Record<string, string | undefined>;
  provedor: ProvedorDeIa;
  texto: string;
  paginas: PaginaDoContexto[];
}) =>
  recordAudit({
    workspaceId: args.espaco.id,
    entity: AUDIT_ENTITIES.PAGE,
    entityId: args.paginas[0].id,
    action: AUDIT_ACTIONS.EXPORT,
    actor: args.user,
    headers: args.headers,
    metadata: {
      servico: "wiki-sugestoes",
      operacao: "resolucao",
      formato: args.provedor.formato,
      destino: configIaRequisitos().destino,
      caracteres_enviados: args.texto.length,
      paginas_enviadas: args.paginas.map((p) => p.id),
    },
  });

const askProvedor = async (provedor: ProvedorDeIa, texto: string, paginas: PaginaDoContexto[]) => {
  const sugestao = limitSugestao(
    await provedor.resolve({ texto, paginas: paginas.map((p) => ({ nome: p.name, trecho: p.trecho })) })
  );
  return sugestao ? { sugestao } : withoutSugestao(MOTIVO_DA_SUGESTAO.falhou);
};

/**
 * O que fazer com o problema, escrito pela IA a partir das páginas da wiki que
 * a pessoa enxerga. Sem texto, sem página visível ou sem IA, nada sai daqui.
 */
export async function resolveSugestaoDaWiki(args: {
  espaco: Espaco;
  user: Solicitante;
  headers: Record<string, string | undefined>;
  pedido: PedidoDeResolucao;
}): Promise<SugestaoDeSolucao> {
  const { espaco, user, headers, pedido } = args;
  if (!pedido.texto) return withoutSugestao(MOTIVO_DA_SUGESTAO.semTexto);

  const provedor = readProvedor();
  if (!provedor) return withoutSugestao(MOTIVO_DA_SUGESTAO.semIa);

  const paginas = await findPaginasDoContexto({
    alcance: await readAlcance(espaco.id, user.id),
    recorte: recorteDaSolicitacao,
    ids: pedido.paginaIds,
  });
  if (!paginas.length) return withoutSugestao(MOTIVO_DA_SUGESTAO.semPaginas);

  try {
    await saveTrilhaDaSaida({ espaco, user, headers, provedor, texto: pedido.texto, paginas });
    return await askProvedor(provedor, pedido.texto, paginas);
  } catch (e: any) {
    // Abrir a solicitação não pode esperar por uma falha nossa nem da IA.
    console.error("[wiki-sugestoes] sugestão abortada:", e?.message ?? e);
    return withoutSugestao(MOTIVO_DA_SUGESTAO.falhou);
  }
}
