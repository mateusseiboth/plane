/**
 * Colunas do painel de TV do TI e da Qualidade (`intranet/painel/painel_ti*.php`
 * e `painel_qld.php` do SAC).
 *
 * A coluna é DADO, não fluxo: cada uma diz as etapas que recolhe, se quer
 * chamado com ou sem responsável e, quando é coluna de entrega, quantos dias
 * para trás ela olha. Trocar o mapeamento do painel é editar essa lista — no
 * código (`COLUNAS_PADRAO`) ou na configuração do espaço (`panel_settings`).
 *
 * Puro: quem busca os chamados é o DAO, quem grava a configuração é o service.
 */

export const PAINEIS_DO_QUADRO = ["ti", "qualidade"] as const;
export type PainelDoQuadro = (typeof PAINEIS_DO_QUADRO)[number];

export const isPainelDoQuadro = (valor: unknown): valor is PainelDoQuadro =>
  PAINEIS_DO_QUADRO.includes(valor as PainelDoQuadro);

/**
 * Cor da coluna pelo NOME; a tela traduz para os tons validados do tema escuro
 * (paleta categórica da referência de dataviz, conferida para daltonismo).
 * "cinza" é o neutro: coluna sem identidade própria, como "Pendente".
 */
export const CORES_DA_COLUNA = ["laranja", "ouro", "verde", "azul", "roxo", "rosa", "cinza"] as const;
export type CorDaColuna = (typeof CORES_DA_COLUNA)[number];

export type RegraDaColuna = {
  chave: string;
  rotulo: string;
  cor: CorDaColuna;
  /** Nomes das etapas que a coluna recolhe. */
  etapas: string[];
  /** `com` só chamado com responsável, `sem` só o que ninguém pegou. */
  responsavel?: "com" | "sem";
  /** Coluna de entrega: só o que foi concluído nos últimos N dias. */
  concluidoEmDias?: number;
  /** `false` tira a coluna do total e do percentual (o legado não soma Homologado). */
  noTotal?: boolean;
};

export type ChamadoDoQuadro = {
  id: string;
  etapa: string | null;
  grupo: string | null;
  prioridade: string;
  temResponsavel: boolean;
  concluidoEm: Date | null;
};

const DIA_MS = 86_400_000;

/**
 * Mapeamento padrão. TI: sem responsável é Pendente, com responsável e ainda
 * não iniciado é Atribuído, "Concluído" é o que o TI terminou e está em
 * homologação, "Enviado" é o que já foi entregue ao cliente.
 */
export const COLUNAS_PADRAO: Record<PainelDoQuadro, RegraDaColuna[]> = {
  ti: [
    { chave: "pendente", rotulo: "Pendente", cor: "cinza", etapas: ["Pendências", "A Fazer"], responsavel: "sem" },
    { chave: "atribuido", rotulo: "Atribuído", cor: "azul", etapas: ["Pendências", "A Fazer"], responsavel: "com" },
    { chave: "em_desenvolvimento", rotulo: "Em desenvolvimento", cor: "roxo", etapas: ["Em Desenvolvimento"] },
    { chave: "concluido", rotulo: "Concluído", cor: "ouro", etapas: ["Em Teste"] },
    { chave: "enviado", rotulo: "Enviado", cor: "verde", etapas: ["Concluído"], concluidoEmDias: 30, noTotal: false },
  ],
  qualidade: [
    { chave: "verificar", rotulo: "Verificar", cor: "laranja", etapas: ["Triagem"] },
    { chave: "analisar", rotulo: "Analisar", cor: "ouro", etapas: ["Em Análise"] },
    { chave: "homologar", rotulo: "Homologar", cor: "verde", etapas: ["Em Teste"] },
    {
      chave: "homologado",
      rotulo: "Homologado",
      cor: "azul",
      etapas: ["Concluído"],
      concluidoEmDias: 7,
      noTotal: false,
    },
  ],
};

const isDentroDaJanela = (concluidoEm: Date | null, dias: number, agora: Date) =>
  concluidoEm !== null && agora.getTime() - concluidoEm.getTime() <= dias * DIA_MS;

const isDaColuna = (regra: RegraDaColuna, chamado: ChamadoDoQuadro, agora: Date): boolean => {
  if (!regra.etapas.includes(chamado.etapa ?? "")) return false;
  if (regra.responsavel && (regra.responsavel === "com") !== chamado.temResponsavel) return false;
  if (regra.concluidoEmDias === undefined) return true;
  return isDentroDaJanela(chamado.concluidoEm, regra.concluidoEmDias, agora);
};

const isNoTotal = (regra: RegraDaColuna) => regra.noTotal !== false;

const percentualDe = (parte: number, total: number) => (total ? Math.round((parte / total) * 1000) / 10 : 0);

/**
 * Cada chamado entra em UMA coluna: a primeira que o quer. Assim o total do
 * painel é a soma das colunas, como o cabeçalho "(11/134)" do legado promete.
 */
export function buildQuadro<T extends ChamadoDoQuadro>(colunas: RegraDaColuna[], chamados: T[], agora: Date) {
  const escolhidos = chamados.map((chamado) => ({
    chamado,
    regra: colunas.find((regra) => isDaColuna(regra, chamado, agora)),
  }));
  const daColuna = (regra: RegraDaColuna) => escolhidos.filter((e) => e.regra === regra).map((e) => e.chamado);
  const total = escolhidos.filter((e) => e.regra && isNoTotal(e.regra)).length;

  return {
    total,
    colunas: colunas.map((regra) => {
      const lista = daColuna(regra);
      return {
        chave: regra.chave,
        rotulo: regra.rotulo,
        cor: regra.cor,
        total: lista.length,
        percentual: isNoTotal(regra) ? percentualDe(lista.length, total) : null,
        chamados: lista,
      };
    }),
    urgentes: escolhidos
      .filter((e) => e.regra && isNoTotal(e.regra) && e.chamado.prioridade === "urgent")
      .map((e) => e.chamado),
  };
}

/** O que o DAO precisa buscar: as etapas das colunas e a data-limite dos concluídos. */
export function buildFiltroDoQuadro(colunas: RegraDaColuna[], agora: Date) {
  const janelas = colunas.map((c) => c.concluidoEmDias).filter((d): d is number => d !== undefined);
  const maiorJanela = janelas.length ? Math.max(...janelas) : null;
  return {
    etapas: [...new Set(colunas.flatMap((c) => c.etapas))],
    concluidosDesde: maiorJanela === null ? null : new Date(agora.getTime() - maiorJanela * DIA_MS),
  };
}

export type ErroDeCampo = { path: string; message: string };

const CORES = new Set<string>(CORES_DA_COLUNA);

const readEtapas = (valor: unknown): string[] =>
  Array.isArray(valor) ? valor.map((v) => String(v).trim()).filter(Boolean) : [];

const readDias = (valor: unknown): number | undefined => {
  const dias = Number(valor);
  return Number.isFinite(dias) && dias > 0 ? Math.floor(dias) : undefined;
};

function parseColuna(bruta: Record<string, unknown>, indice: number): { coluna?: RegraDaColuna; erros: ErroDeCampo[] } {
  const prefixo = `columns[${indice}]`;
  const erros: ErroDeCampo[] = [];
  const chave = String(bruta.chave ?? "").trim();
  const rotulo = String(bruta.rotulo ?? "").trim();
  const cor = String(bruta.cor ?? "").trim();
  const etapas = readEtapas(bruta.etapas);
  const responsavel = bruta.responsavel === undefined || bruta.responsavel === null ? "" : String(bruta.responsavel);

  if (!chave) erros.push({ path: `${prefixo}.chave`, message: "Informe a chave da coluna." });
  if (!rotulo) erros.push({ path: `${prefixo}.rotulo`, message: "Informe o nome da coluna." });
  if (!CORES.has(cor)) erros.push({ path: `${prefixo}.cor`, message: `Cor desconhecida: ${cor || "(vazia)"}.` });
  if (!etapas.length) erros.push({ path: `${prefixo}.etapas`, message: "Escolha ao menos uma etapa." });
  if (responsavel && responsavel !== "com" && responsavel !== "sem") {
    erros.push({ path: `${prefixo}.responsavel`, message: "Use com, sem ou deixe em branco." });
  }
  if (erros.length) return { erros };

  const dias = readDias(bruta.concluido_em_dias ?? bruta.concluidoEmDias);
  return {
    erros,
    coluna: {
      chave,
      rotulo,
      cor: cor as CorDaColuna,
      etapas,
      ...(responsavel ? { responsavel: responsavel as "com" | "sem" } : {}),
      ...(dias === undefined ? {} : { concluidoEmDias: dias }),
      ...((bruta.no_total ?? bruta.noTotal) === false ? { noTotal: false } : {}),
    },
  };
}

/** Configuração vinda da tela. Uma recusa por campo, com o índice da coluna. */
export function parseColunasDoPainel(valor: unknown): { colunas: RegraDaColuna[]; erros: ErroDeCampo[] } {
  if (!Array.isArray(valor) || !valor.length) {
    return { colunas: [], erros: [{ path: "columns", message: "Escolha ao menos uma coluna." }] };
  }
  const analisadas = valor.map((bruta, i) => parseColuna((bruta ?? {}) as Record<string, unknown>, i));
  return {
    colunas: analisadas.map((a) => a.coluna).filter((c): c is RegraDaColuna => !!c),
    erros: analisadas.flatMap((a) => a.erros),
  };
}

/**
 * Colunas que valem para o painel: as gravadas pelo espaço ou, sem elas (ou com
 * configuração que não passa na validação), o padrão do código. O painel nunca
 * fica em branco por causa de uma configuração estragada.
 */
export function readColunasDoPainel(painel: PainelDoQuadro, gravadas: unknown): RegraDaColuna[] {
  const { colunas, erros } = parseColunasDoPainel(gravadas);
  return erros.length ? COLUNAS_PADRAO[painel] : colunas;
}
