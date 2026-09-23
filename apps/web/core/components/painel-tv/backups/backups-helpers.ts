/**
 * Regras do painel de backups: os tipos que a rota devolve e tudo que a barra
 * de filtros faz com eles (busca por entidade, sistema, situação e ordenação).
 *
 * Puro de propósito: nada de React e nada de rede, para o teste rodar sem
 * navegador. A tela só monta o resultado.
 *
 * Os filtros vivem na URL porque o painel é compartilhado por link: quem abre
 * o endereço vê exatamente a mesma lista de quem o mandou.
 */

export type TBackupEnviado = {
  sistema: number;
  sistema_nome: string;
  enviado_em: string;
  tamanho: string;
  corrompido: number;
  envio_ftp: boolean;
  erro_backup: boolean;
  erro_restore: boolean;
  ok: boolean;
};

export type TEntidadeSemBackup = {
  id: string;
  codigo: number | null;
  nome: string;
  cidade: string | null;
  uf: string | null;
  expira_em: string | null;
  ultimo_em: string | null;
  dias: number | null;
};

export type TEntidadeComBackup = {
  id: string;
  codigo: number | null;
  nome: string;
  cidade: string | null;
  uf: string | null;
  expira_em: string | null;
  backups: TBackupEnviado[];
  com_problema: number;
};

export type TContadoresDoBackup = {
  entidades_atrasadas: number;
  entidades_com_backup: number;
  backups_recebidos: number;
  maior_atraso_dias: number;
  com_problema: number;
  /** Entidades ativas que nunca enviaram backup: não é atraso, é quem não faz. */
  nao_fazem_backup: number;
};

export type TPainelDeBackups = {
  gerado_em: string;
  uf: string | null;
  ufs: string[];
  dias: number;
  sem_backup: TEntidadeSemBackup[];
  enviados: TEntidadeComBackup[];
  contadores: TContadoresDoBackup;
};

/** Um envio do histórico de uma entidade × sistema (rota `/backups/historico/`). */
export type TEnvioDoHistorico = {
  id: string;
  sistema: number;
  sistema_nome: string;
  enviado_em: string;
  tamanho_bytes: number;
  tamanho: string;
  arquivo: string | null;
  origem: string | null;
  ip_externo: string | null;
  versao: string | null;
  corrompido: number;
  envio_ftp: boolean;
  erro_backup: boolean;
  erro_restore: boolean;
  ok: boolean;
};

export type THistoricoDeBackups = {
  gerado_em: string;
  dias: number;
  sistema: number | null;
  entidade: { id: string; codigo: number | null; nome: string; cidade: string | null; uf: string | null };
  envios: TEnvioDoHistorico[];
  total: number;
};

/** Os quatro sistemas que fazem backup no relatório legado. */
export const SISTEMAS_DO_BACKUP = [
  { codigo: 1, nome: "Contabilidade" },
  { codigo: 3, nome: "ARH" },
  { codigo: 4, nome: "SIART" },
  { codigo: 8, nome: "Integração" },
] as const;

const CODIGOS_DE_SISTEMA = new Set<number>(SISTEMAS_DO_BACKUP.map((s) => s.codigo));

export const SITUACOES_DO_BACKUP = ["em-dia", "atrasado", "nunca"] as const;
export type SituacaoDoBackup = (typeof SITUACOES_DO_BACKUP)[number];

export const ROTULO_DA_SITUACAO: Record<SituacaoDoBackup, string> = {
  "em-dia": "Em dia",
  atrasado: "Atrasado",
  nunca: "Nunca enviou",
};

export const isSituacaoDoBackup = (valor: unknown): valor is SituacaoDoBackup =>
  SITUACOES_DO_BACKUP.includes(valor as SituacaoDoBackup);

export const ORDENS_DO_BACKUP = ["atraso", "entidade", "problema"] as const;
export type OrdemDoBackup = (typeof ORDENS_DO_BACKUP)[number];

export const ROTULO_DA_ORDEM: Record<OrdemDoBackup, string> = {
  atraso: "Mais atrasado primeiro",
  entidade: "Entidade (A a Z)",
  problema: "Com problema primeiro",
};

const isOrdemDoBackup = (valor: unknown): valor is OrdemDoBackup => ORDENS_DO_BACKUP.includes(valor as OrdemDoBackup);

export type FiltrosDoBackup = {
  /** Busca rápida: casa com o nome ou com o código da entidade. */
  entidade: string;
  sistema: number | null;
  situacao: SituacaoDoBackup | null;
  ordem: OrdemDoBackup;
};

export const FILTROS_PADRAO: FiltrosDoBackup = { entidade: "", sistema: null, situacao: null, ordem: "atraso" };

const readSistema = (valor: string | null): number | null => {
  const codigo = Number(valor);
  return valor !== null && CODIGOS_DE_SISTEMA.has(codigo) ? codigo : null;
};

export function readFiltrosDaUrl(busca: string): FiltrosDoBackup {
  const parametros = new URLSearchParams(busca);
  const situacao = parametros.get("situacao");
  const ordem = parametros.get("ordem");
  return {
    entidade: parametros.get("entidade")?.trim() ?? "",
    sistema: readSistema(parametros.get("sistema")),
    situacao: isSituacaoDoBackup(situacao) ? situacao : null,
    ordem: isOrdemDoBackup(ordem) ? ordem : FILTROS_PADRAO.ordem,
  };
}

/**
 * A URL com os filtros aplicados, guardando o que já estava lá (a chave da TV,
 * a UF, o som). Filtro no padrão SAI do endereço: link curto é link que se lê.
 */
export function buildBuscaDosFiltros(
  busca: string,
  filtros: Partial<FiltrosDoBackup>,
  dias: number | null,
  interativo = true
): string {
  const parametros = new URLSearchParams(busca);
  const completos = { ...readFiltrosDaUrl(busca), ...filtros };
  const escrever = (nome: string, valor: string | null) =>
    valor ? parametros.set(nome, valor) : parametros.delete(nome);

  escrever("entidade", completos.entidade.trim() || null);
  escrever("sistema", completos.sistema === null ? null : String(completos.sistema));
  escrever("situacao", completos.situacao);
  escrever("ordem", completos.ordem === FILTROS_PADRAO.ordem ? null : completos.ordem);
  escrever("dias", dias === null ? null : String(dias));
  escrever("interativo", interativo ? "1" : null);

  return parametros.toString();
}

/** Compara texto sem acento e sem caixa: quem busca "navirai" quer Naviraí. */
export const normalizeTexto = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Sem envio no período: já teve backup algum dia, ou nunca teve nenhum. */
export const readSituacaoDaEntidade = ({
  dias,
  enviou,
}: {
  dias: number | null;
  enviou: boolean;
}): SituacaoDoBackup => {
  if (enviou) return "em-dia";
  return dias === null ? "nunca" : "atrasado";
};

const casaComABusca = (entidade: { nome: string; codigo: number | null }, termo: string): boolean => {
  const procurado = normalizeTexto(termo);
  if (!procurado) return true;
  return normalizeTexto(entidade.nome).includes(procurado) || String(entidade.codigo ?? "").includes(procurado);
};

const ATRASO_DESCONHECIDO = Number.MAX_SAFE_INTEGER;

const porAtraso = (a: TEntidadeSemBackup, b: TEntidadeSemBackup) =>
  (b.dias ?? ATRASO_DESCONHECIDO) - (a.dias ?? ATRASO_DESCONHECIDO);

const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, "pt-BR");

const porProblema = (a: TEntidadeComBackup, b: TEntidadeComBackup) => b.com_problema - a.com_problema || porNome(a, b);

/** Cada ordenação é uma entrada do mapa, nunca um `if` por botão. */
const ORDENACAO: Record<
  OrdemDoBackup,
  {
    semBackup: (a: TEntidadeSemBackup, b: TEntidadeSemBackup) => number;
    enviados: (a: TEntidadeComBackup, b: TEntidadeComBackup) => number;
  }
> = {
  atraso: { semBackup: porAtraso, enviados: porProblema },
  entidade: { semBackup: porNome, enviados: porNome },
  problema: { semBackup: porAtraso, enviados: porProblema },
};

/** A situação escolhida diz qual lista sobrevive; sem filtro, as duas ficam. */
const ACEITA_SEM_BACKUP: Record<SituacaoDoBackup, (entidade: TEntidadeSemBackup) => boolean> = {
  "em-dia": () => false,
  atrasado: (entidade) => entidade.dias !== null,
  nunca: (entidade) => entidade.dias === null,
};

const buildContadores = (
  semBackup: TEntidadeSemBackup[],
  enviados: TEntidadeComBackup[],
  naoFazemBackup: number
): TContadoresDoBackup => {
  const recebidos = enviados.flatMap((e) => e.backups);
  return {
    entidades_atrasadas: semBackup.length,
    entidades_com_backup: enviados.length,
    backups_recebidos: recebidos.length,
    maior_atraso_dias: semBackup.reduce<number>((maior, e) => Math.max(maior, e.dias ?? 0), 0),
    com_problema: recebidos.filter((b) => !b.ok).length,
    nao_fazem_backup: naoFazemBackup,
  };
};

/**
 * O painel já filtrado e ordenado, com os contadores refeitos: o número no
 * alto tem de contar o que está na tela, senão o filtro vira mentira.
 *
 * Quem está sem backup nenhum continua aparecendo com o filtro de sistema
 * ligado: falta o backup do sistema escolhido também.
 */
export function filterPainelDeBackups(painel: TPainelDeBackups, filtros: FiltrosDoBackup): TPainelDeBackups {
  const aceitaSituacao = filtros.situacao ? ACEITA_SEM_BACKUP[filtros.situacao] : () => true;
  const ordenacao = ORDENACAO[filtros.ordem];

  const semBackup = painel.sem_backup
    .filter((entidade) => casaComABusca(entidade, filtros.entidade) && aceitaSituacao(entidade))
    // O lib do TypeScript do web não tem `toSorted`; o array é novo (saiu do filter).
    // oxlint-disable-next-line unicorn/no-array-sort
    .sort(ordenacao.semBackup);

  const enviados =
    filtros.situacao && filtros.situacao !== "em-dia"
      ? []
      : painel.enviados
          .filter((entidade) => casaComABusca(entidade, filtros.entidade))
          // Cópia de propósito: a entidade tem de ficar com os backups do sistema
          // escolhido sem mexer no que o SWR guardou.
          // oxlint-disable-next-line oxc/no-map-spread
          .map((entidade) => {
            const backups =
              filtros.sistema === null
                ? entidade.backups
                : entidade.backups.filter((b) => b.sistema === filtros.sistema);
            return { ...entidade, backups, com_problema: backups.filter((b) => !b.ok).length };
          })
          .filter((entidade) => entidade.backups.length > 0)
          // oxlint-disable-next-line unicorn/no-array-sort
          .sort(ordenacao.enviados);

  return {
    ...painel,
    sem_backup: semBackup,
    enviados,
    contadores: buildContadores(semBackup, enviados, painel.contadores.nao_fazem_backup ?? 0),
  };
}
