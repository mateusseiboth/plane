/**
 * Sugestões da wiki da Quality para quem abre solicitação: as páginas
 * parecidas com o problema descrito e o que fazer, respondido pela IA da
 * Quality (`clientes/ia-da-quality.ts`).
 *
 * Nunca derruba a tela: serviço fora do ar, com erro ou lento vira lista vazia
 * ou sugestão `null` com o motivo. A saída do relato do cliente para a IA
 * (`resolver/`) fica na trilha LGPD, contada e não copiada.
 */
import {
  askIaDaQuality,
  findDocumentoDaWiki,
  listDocumentosDaWiki,
  readConfigDaIaDaQuality,
  readDestino,
  searchWiki,
  type ConfigDaIaDaQuality,
} from "@modules/wiki-sugestoes/clientes/ia-da-quality";
import { findSistemaDaBusca } from "@modules/wiki-sugestoes/sistema-da-busca.dao";
import {
  buildConsultaDaWiki,
  buildPerguntaDeResolucao,
  buildReadUrlDaPagina,
  LIMITE_DE_PAGINAS_DA_WIKI,
  mapSugestaoDaWiki,
  MOTIVO_DA_SUGESTAO,
  prioritizePaginasDoSistema,
  readIdsPorCaminho,
  readPaginasDaBusca,
  readRespostaDaIa,
  type PaginaDaIaDaQuality,
  type PedidoDeResolucao,
  type RespostaDaIa,
  type SugestaoDaWiki,
} from "@modules/wiki-sugestoes/wiki-sugestoes.rules";
import { isUuid } from "@modules/pos-atendimento/pos-atendimento.rules";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";

type Espaco = { id: string; slug: string };
type Solicitante = { id: string; email?: string | null };
type Cabecalhos = Record<string, string | undefined>;

export type SugestaoDeSolucao = RespostaDaIa | { sugestao: null; motivo: string };

/** LGPD: o relato do cliente saiu para a IA da Quality. Registra quanto e para onde, não o conteúdo. */
const saveTrilhaDaSaida = (args: {
  espaco: Espaco;
  user: Solicitante;
  headers: Cabecalhos;
  config: ConfigDaIaDaQuality;
  paginaId: string | undefined;
  metadata: Record<string, unknown>;
}) =>
  recordAudit({
    workspaceId: args.espaco.id,
    entity: AUDIT_ENTITIES.PAGE,
    entityId: args.paginaId ?? args.espaco.id,
    action: AUDIT_ACTIONS.EXPORT,
    actor: args.user,
    headers: args.headers,
    metadata: { servico: "wiki-sugestoes", destino: readDestino(args.config), ...args.metadata },
  });

/** O sistema escolhido, quando é um sistema vivo do espaço. */
const readSistema = (espaco: Espaco, projectId: string) =>
  isUuid(projectId) ? findSistemaDaBusca(espaco.id, projectId) : Promise.resolve(null);

/** O resumo da busca quase sempre vem vazio: o trecho sai do conteúdo da página. */
const readConteudo = async (config: ConfigDaIaDaQuality, pagina: PaginaDaIaDaQuality) =>
  pagina.summary ? "" : ((await findDocumentoDaWiki(config, pagina.id))?.content ?? "");

/** Até 5 páginas da wiki da Quality parecidas com o texto; sem termo útil, lista vazia sem chamar o serviço. */
export async function findSugestoesDaWiki(args: {
  espaco: Espaco;
  texto: string;
  projectId: string;
}): Promise<SugestaoDaWiki[]> {
  const consulta = buildConsultaDaWiki(args.texto);
  if (!consulta) return [];

  // Sem trilha LGPD aqui: saem só os termos (até 8), e cada pausa na digitação
  // é uma busca. A trilha fica no `resolver/`, onde o relato inteiro sai.
  const config = readConfigDaIaDaQuality();
  const [corpo, sistema] = await Promise.all([searchWiki(config, consulta), readSistema(args.espaco, args.projectId)]);
  const paginas = prioritizePaginasDoSistema(readPaginasDaBusca(corpo), sistema).slice(0, LIMITE_DE_PAGINAS_DA_WIKI);
  const conteudos = await Promise.all(paginas.map((pagina) => readConteudo(config, pagina)));
  return paginas.map((pagina, i) => mapSugestaoDaWiki(pagina, config.urlDoInforme, conteudos[i]));
}

const withoutSugestao = (motivo: string): SugestaoDeSolucao => ({ sugestao: null, motivo });

/** Os títulos das páginas escolhidas, para citar na pergunta; a que não volta fica de fora. */
const readTitulos = async (config: ConfigDaIaDaQuality, ids: string[]) => {
  const documentos = await Promise.all(ids.map((id) => findDocumentoDaWiki(config, id)));
  return documentos.map((documento) => documento?.title ?? "").filter(Boolean);
};

/** O que fazer com o problema, respondido pela IA da Quality com a base de conhecimento da wiki. */
export async function resolveSugestaoDaWiki(args: {
  espaco: Espaco;
  user: Solicitante;
  headers: Cabecalhos;
  pedido: PedidoDeResolucao;
}): Promise<SugestaoDeSolucao> {
  const { pedido } = args;
  if (!pedido.texto) return withoutSugestao(MOTIVO_DA_SUGESTAO.semTexto);

  const config = readConfigDaIaDaQuality();
  const titulos = await readTitulos(config, pedido.paginaIds);
  await saveTrilhaDaSaida({
    ...args,
    config,
    paginaId: pedido.paginaIds[0],
    metadata: {
      operacao: "resolucao",
      caracteres_enviados: pedido.texto.length,
      paginas_enviadas: pedido.paginaIds,
    },
  });
  // A IA cita as páginas só pelo caminho; a lista de documentos dá o id que o informe abre.
  const [corpo, documentos] = await Promise.all([
    askIaDaQuality(config, buildPerguntaDeResolucao(pedido.texto, titulos)),
    listDocumentosDaWiki(config),
  ]);
  const resposta = readRespostaDaIa(corpo, buildReadUrlDaPagina(config, readIdsPorCaminho(documentos)));
  return resposta ?? withoutSugestao(MOTIVO_DA_SUGESTAO.semIa);
}
