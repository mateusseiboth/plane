/**
 * Banco anexado no texto, sem banco de dados: o número do backup (o `envio` do
 * plugin de backups) e a marca que o bloco deixa no HTML do chamado ou do
 * comentário (`<banco-anexo data-envio="…">`, ver packages/editor).
 */
import { createFieldError } from "@utils/field-error";

/** O plugin que guarda os backups dos clientes. */
export const SLUG_DO_PLUGIN_DE_BACKUPS = "backup-manager";

/**
 * O Plane pede o link em nome de quem vê o chamado (decisão de 19/11/2026):
 * a permissão vai junto, porque a pessoa não precisa ter a do plugin.
 */
export const PERMISSOES_DO_DOWNLOAD = ["backup-manager.view", "backup-manager.download"];

export const MENSAGEM_NAO_ANEXADO = "Este banco não está anexado neste sistema.";
export const MENSAGEM_SEM_PLUGIN = "O gerenciador de backups não está ativo. Avise o administrador.";

/** Os níveis da busca do seletor de banco, na ordem das pastas do servidor: mês › sistema › entidade › arquivos. */
export const NIVEIS_DA_BUSCA: Record<string, { caminho: string; parametros: readonly string[] }> = {
  meses: { caminho: "/v1/bancos/meses", parametros: [] },
  sistemas: { caminho: "/v1/bancos/sistemas", parametros: ["mes"] },
  entidades: { caminho: "/v1/bancos/entidades", parametros: ["system_id", "mes"] },
  arquivos: { caminho: "/v1/bancos", parametros: ["entity_code", "system_id", "mes", "search", "page", "limit"] },
};

/** Só os parâmetros que o nível conhece seguem para o plugin. */
export const pickParametros = (nivel: { parametros: readonly string[] }, query: Record<string, unknown>) =>
  Object.fromEntries(nivel.parametros.filter((p) => query[p] != null && query[p] !== "").map((p) => [p, query[p]]));

/**
 * Só os bancos recentes (pedido de 19/11/2026): o mês atual e o anterior, no
 * mesmo ano. Em janeiro, só janeiro. Ninguém precisa anexar o histórico todo.
 */
const FUSO = process.env.TZ_PADRAO ?? "America/Campo_Grande";

const readAnoMes = (data: Date): { ano: number; mes: number } => {
  const [ano, mes] = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit" })
    .format(data)
    .split("-")
    .map(Number);
  return { ano, mes };
};

const formatAnoMes = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, "0")}`;

export const readMesesPermitidos = (hoje: Date): string[] => {
  const { ano, mes } = readAnoMes(hoje);
  return mes > 1 ? [formatAnoMes(ano, mes), formatAnoMes(ano, mes - 1)] : [formatAnoMes(ano, mes)];
};

export const isMesPermitido = (mes: string, hoje: Date): boolean => readMesesPermitidos(hoje).includes(mes);

export const MENSAGEM_MES_ANTIGO = "Só dá para anexar bancos deste mês e do anterior.";

export const filterMesesRecentes = <T extends { mes?: unknown }>(corpo: { data?: T[] }, hoje: Date) => ({
  ...corpo,
  data: (corpo.data ?? []).filter((linha) => isMesPermitido(String(linha.mes), hoje)),
});

type CorpoDasEntidades = { data?: Array<{ entity_code?: string | number | null } & Record<string, unknown>> };

/** O plugin só sabe o código do SAC; o nome que a tela mostra é o do cadastro do Plane. */
export const addNomesDasEntidades = (corpo: CorpoDasEntidades, nomes: Map<string, string>): CorpoDasEntidades => ({
  ...corpo,
  data: (corpo.data ?? []).map((linha) => ({ ...linha, entity_name: nomes.get(String(linha.entity_code)) ?? null })),
});

export const readEnvio = (valor: string): string => {
  if (/^\d{1,12}$/.test(valor)) return valor;
  throw createFieldError("envio", "Banco inválido.");
};

/** O pedaço do HTML que prova que o banco foi anexado. */
export const buildMarcaDoEnvio = (envio: string): string => `data-envio="${envio}"`;
