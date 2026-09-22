/**
 * Regras puras do pós-atendimento: o que o formulário aceita (chamado × visita),
 * a verificação da Qualidade, a situação na fila, os filtros, a intercalação das
 * duas origens e a agregação do relatório de satisfação. Nada aqui toca o banco.
 */
import {
  CLASSIFICACAO,
  CLASSIFICACAO_LABELS,
  EXPECTATIVA,
  EXPECTATIVA_LABELS,
  MEIO_CONTATO,
  POS_ORIGEM,
  POS_SITUACAO,
  PROBLEMA_RESOLVIDO,
  SEM_RESPOSTA,
  isCodigoDe,
  type PosOrigem,
  type PosSituacao,
} from "@modules/pos-atendimento/pos-atendimento.codes";
import { inicioRecebido, vencimentoRecebido } from "@utils/prazo";

export type PosFieldError = { path: string; message: string };

/** O que o service grava, com os nomes do Prisma. */
export type PosData = {
  expectativa: number;
  classificacao: number;
  meioContato: number;
  observacao: string;
  problemaResolvido: string | null;
};

type ValidateOptions = { origem: PosOrigem; canVerify: boolean };

type Body = Record<string, unknown>;

type FieldReader = (body: Body, data: PosData, options: ValidateOptions) => PosFieldError | null;

const OBSERVACAO_MAXIMA = 20000;
const COMENTARIO_MAXIMO = 20000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O select manda texto ("3"); a API aceita o número ou o texto do número. */
const toCodigo = (valor: unknown): unknown =>
  typeof valor === "string" && /^\d+$/.test(valor) ? Number(valor) : valor;

const readExpectativa: FieldReader = (body, data) => {
  const codigo = toCodigo(body.expectativa);
  if (!isCodigoDe(EXPECTATIVA, codigo))
    return { path: "expectativa", message: "Informe se o atendimento atendeu a expectativa do cliente." };
  data.expectativa = codigo;
  return null;
};

const readClassificacao: FieldReader = (body, data) => {
  const codigo = toCodigo(body.classificacao);
  if (!isCodigoDe(CLASSIFICACAO, codigo))
    return { path: "classificacao", message: "Informe como o cliente classifica o atendimento." };
  data.classificacao = codigo;
  return null;
};

// MSN morreu; comunicador interno era só da Qualidade (`popFinalPos.php`), e quem
// verifica é quem faz o papel da Qualidade na matriz.
const MEIOS_NOVOS = new Set<number>([
  MEIO_CONTATO.TELEFONE,
  MEIO_CONTATO.EMAIL,
  MEIO_CONTATO.CHAT,
  MEIO_CONTATO.REMOTO,
]);
const MEIOS_DE_QUEM_VERIFICA = new Set<number>([...MEIOS_NOVOS, MEIO_CONTATO.COMUNICADOR_INTERNO]);

const readMeioContato: FieldReader = (body, data, { canVerify }) => {
  const codigo = toCodigo(body.meio_contato);
  const permitidos = canVerify ? MEIOS_DE_QUEM_VERIFICA : MEIOS_NOVOS;
  if (!isCodigoDe(MEIO_CONTATO, codigo)) return { path: "meio_contato", message: "Informe o meio de contato." };
  if (!permitidos.has(codigo)) return { path: "meio_contato", message: "Escolha outro meio de contato." };
  data.meioContato = codigo;
  return null;
};

const readObservacao: FieldReader = (body, data) => {
  const texto = typeof body.observacao === "string" ? body.observacao.trim() : "";
  if (!texto) return { path: "observacao", message: "Escreva a observação do contato." };
  if (texto.length > OBSERVACAO_MAXIMA) return { path: "observacao", message: "A observação está longa demais." };
  data.observacao = texto;
  return null;
};

const readProblemaResolvido: FieldReader = (body, data) => {
  if (!isCodigoDe(PROBLEMA_RESOLVIDO, body.problema_resolvido))
    return { path: "problema_resolvido", message: "Informe se o problema foi resolvido." };
  data.problemaResolvido = body.problema_resolvido;
  return null;
};

const ignoreProblemaResolvido: FieldReader = (_body, data) => {
  data.problemaResolvido = null;
  return null;
};

/** Leitores por origem, na ordem das mensagens de erro. Só a visita pergunta se o problema foi resolvido. */
const LEITORES_POR_ORIGEM: Record<PosOrigem, FieldReader[]> = {
  [POS_ORIGEM.CHAMADO]: [readExpectativa, readClassificacao, ignoreProblemaResolvido, readMeioContato, readObservacao],
  [POS_ORIGEM.VISITA]: [readExpectativa, readClassificacao, readProblemaResolvido, readMeioContato, readObservacao],
};

/** Valida o formulário e o traduz para o formato do banco. */
export function validatePosInput(body: Body, options: ValidateOptions): { data: PosData; errors: PosFieldError[] } {
  const data: PosData = { expectativa: 0, classificacao: 0, meioContato: 0, observacao: "", problemaResolvido: null };
  const errors = LEITORES_POR_ORIGEM[options.origem]
    .map((ler) => ler(body ?? {}, data, options))
    .filter((e): e is PosFieldError => e !== null);
  return { data, errors };
}

/** Comentário da verificação: opcional, como a "observação do setor Qualidade" do legado. */
export function validateVerifyInput(body: Body): { comment: string | null } {
  const texto = typeof body?.comment === "string" ? body.comment.trim().slice(0, COMENTARIO_MAXIMO) : "";
  return { comment: texto || null };
}

export const getSituacao = (pos: { verifiedAt: Date | null } | null): PosSituacao => {
  if (!pos) return POS_SITUACAO.PENDENTE_POS;
  return pos.verifiedAt ? POS_SITUACAO.VERIFICADO : POS_SITUACAO.PENDENTE_VERIFICACAO;
};

// ── Filtros da fila ──────────────────────────────────────────────────────────

export type FilaOrigem = PosOrigem | "all";

export type FilaFiltros = {
  situacao: PosSituacao;
  origem: FilaOrigem;
  projectId?: string;
  entityId?: string;
  responsavelId?: string;
  desde?: Date;
  ate?: Date;
};

const ORIGENS_DA_FILA = new Set<string>([POS_ORIGEM.CHAMADO, POS_ORIGEM.VISITA, "all"]);

export const isUuid = (valor: unknown): valor is string => typeof valor === "string" && UUID.test(valor);

const readUuid = (valor: unknown): string | undefined => (isUuid(valor) ? valor : undefined);

const readData = (valor: unknown, ler: (v: unknown) => Date | null): Date | undefined => ler(valor) ?? undefined;

const withoutVazios = <T extends Record<string, unknown>>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;

/** Lê os filtros da fila. Valor fora da tabela ou id malformado é ignorado, não vira 500. */
export function parseFilaFiltros(query: Record<string, unknown>): FilaFiltros {
  const situacao = isCodigoDe(POS_SITUACAO, query.situacao) ? query.situacao : POS_SITUACAO.PENDENTE_POS;
  const origem = ORIGENS_DA_FILA.has(String(query.origem)) ? (query.origem as FilaOrigem) : "all";
  return withoutVazios({
    situacao,
    origem,
    projectId: readUuid(query.project_id),
    entityId: readUuid(query.entity_id),
    responsavelId: readUuid(query.responsavel_id),
    desde: readData(query.desde, inicioRecebido),
    ate: readData(query.ate, vencimentoRecebido),
  });
}

/** Filtros do relatório: os mesmos da fila, menos situação e responsável. */
export type RelatorioFiltros = Omit<FilaFiltros, "situacao" | "responsavelId"> & { classificacao?: number | null };

/** `none` lista quem ficou sem nota (histórico do SAC); código fora da tabela é ignorado. */
const readClassificacaoDoFiltro = (valor: unknown): number | null | undefined => {
  if (valor === "none") return null;
  const codigo = toCodigo(valor);
  return isCodigoDe(CLASSIFICACAO, codigo) ? codigo : undefined;
};

export function parseRelatorioFiltros(query: Record<string, unknown>): RelatorioFiltros {
  const { origem, projectId, entityId, desde, ate } = parseFilaFiltros(query);
  const classificacao = readClassificacaoDoFiltro(query.classificacao);
  return withoutVazios({ origem, projectId, entityId, desde, ate, classificacao });
}

// ── Data de conclusão e intercalação ─────────────────────────────────────────

type ComConclusao = { completedAt?: Date | null; finishedAt?: Date | null; updatedAt: Date };

/**
 * Quando o atendimento terminou. `completedAt` só existe quando alguém o gravou
 * (o importador grava; mover o cartão nem sempre), então cai na última alteração.
 */
export const getConcluidoEm = (item: ComConclusao): Date => item.completedAt ?? item.finishedAt ?? item.updatedAt;

/**
 * Intercala duas listas já ordenadas do mais recente para o mais antigo e devolve
 * a página. Cada lista precisa trazer pelo menos `skip + take` itens.
 */
export function mergeByConcluidoEm<T extends { concluidoEm: Date }>(a: T[], b: T[], skip: number, take: number): T[] {
  const saida: T[] = [];
  let i = 0;
  let j = 0;
  while (saida.length < skip + take && (i < a.length || j < b.length)) {
    const isVezDoA = j >= b.length || (i < a.length && a[i].concluidoEm.getTime() >= b[j].concluidoEm.getTime());
    saida.push(isVezDoA ? a[i++] : b[j++]);
  }
  return saida.slice(skip, skip + take);
}

// ── Relatório de satisfação ──────────────────────────────────────────────────

type Referencia = { id: string; name: string };

export type LinhaDeSatisfacao = {
  classificacao: number | null;
  expectativa: number | null;
  sistemas: Referencia[];
  entidade: Referencia | null;
};

type Faixa = { codigo: number | null; label: string; total: number; percentual: number };

type Grupo = { id: string | null; name: string; total: number; notas: Record<string, number> };

const percentual = (parte: number, total: number) => (total ? Math.round((parte / total) * 1000) / 10 : 0);

const chaveDaNota = (codigo: number | null) => String(codigo ?? 0);

function buildFaixas(
  linhas: LinhaDeSatisfacao[],
  campo: "classificacao" | "expectativa",
  labels: Record<number, string>
): Faixa[] {
  const contagem = new Map<number | null, number>();
  linhas.forEach((l) => {
    const codigo = labels[l[campo] ?? -1] ? l[campo] : null;
    contagem.set(codigo, (contagem.get(codigo) ?? 0) + 1);
  });
  const conhecidas = Object.keys(labels)
    .map(Number)
    .toSorted((a, b) => b - a)
    .map((codigo) => ({ codigo, label: labels[codigo], total: contagem.get(codigo) ?? 0 }));
  const semResposta = contagem.get(null) ? [{ codigo: null, label: SEM_RESPOSTA, total: contagem.get(null)! }] : [];
  return [...conhecidas, ...semResposta].map((f) =>
    Object.assign(f, { percentual: percentual(f.total, linhas.length) })
  );
}

function buildGrupos(
  linhas: LinhaDeSatisfacao[],
  referenciasDe: (l: LinhaDeSatisfacao) => Referencia[],
  vazio: string
): Grupo[] {
  const grupos = new Map<string | null, Grupo>();
  linhas.forEach((l) => {
    const refs = referenciasDe(l);
    const alvos: { id: string | null; name: string }[] = refs.length ? refs : [{ id: null, name: vazio }];
    alvos.forEach((ref) => {
      const grupo = grupos.get(ref.id) ?? { id: ref.id, name: ref.name, total: 0, notas: {} };
      const nota = chaveDaNota(l.classificacao);
      grupo.total += 1;
      grupo.notas[nota] = (grupo.notas[nota] ?? 0) + 1;
      grupos.set(ref.id, grupo);
    });
  });
  return [...grupos.values()].toSorted((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/**
 * Distribuição das notas: no total, por sistema e por entidade. Visita com dois
 * sistemas conta nos dois, então a soma por sistema pode passar do total.
 */
export function buildSatisfacao(linhas: LinhaDeSatisfacao[]) {
  return {
    total: linhas.length,
    classificacao: buildFaixas(linhas, "classificacao", CLASSIFICACAO_LABELS),
    expectativa: buildFaixas(linhas, "expectativa", EXPECTATIVA_LABELS),
    por_sistema: buildGrupos(linhas, (l) => l.sistemas, "Sem sistema"),
    por_entidade: buildGrupos(linhas, (l) => (l.entidade ? [l.entidade] : []), "Sem entidade"),
  };
}

export type Satisfacao = ReturnType<typeof buildSatisfacao>;
