/**
 * Regras puras do mural de recados: validação do que chega na criação e na
 * edição, vigência, período do histórico e ordem da seção da home. Nada aqui
 * toca o banco; o service orquestra e o DAO consulta.
 */
import { inicioRecebido, vencimentoRecebido } from "@utils/prazo";

export type MuralFieldError = { path: string; message: string };

/** O que o service grava, já com os nomes do Prisma. */
export type RecadoData = Partial<{
  title: string;
  descriptionHtml: string;
  descriptionStripped: string;
  isPinned: boolean;
  isRequired: boolean;
  isActive: boolean;
  expiresAt: Date | null;
  attachmentId: string | null;
}>;

type ValidateOptions = { partial: boolean; now: Date };

const TITULO_MAXIMO = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Imagem colada no editor não tem texto, mas é conteúdo: um recado só com o
// cartaz do evento é recado válido.
const MIDIA = /<(img|image-component)\b/i;

export const stripHtml = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const hasOwn = (body: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(body, key);

type FieldReader = (valor: unknown, data: RecadoData, now: Date) => MuralFieldError | null;

const readTitle: FieldReader = (valor, data) => {
  const title = typeof valor === "string" ? valor.trim() : "";
  if (!title) return { path: "title", message: "Informe o título do recado." };
  if (title.length > TITULO_MAXIMO) return { path: "title", message: "Use no máximo 200 caracteres no título." };
  data.title = title;
  return null;
};

const readDescription: FieldReader = (valor, data) => {
  const html = typeof valor === "string" ? valor : "";
  const texto = stripHtml(html);
  if (!texto && !MIDIA.test(html)) return { path: "description_html", message: "Escreva o recado." };
  data.descriptionHtml = html;
  data.descriptionStripped = texto;
  return null;
};

const readExpiresAt: FieldReader = (valor, data, now) => {
  if (valor === null || valor === undefined || valor === "") {
    data.expiresAt = null;
    return null;
  }
  const instante = vencimentoRecebido(valor);
  if (!instante) return { path: "expires_at", message: "Data de validade inválida." };
  if (instante.getTime() <= now.getTime())
    return { path: "expires_at", message: "A validade precisa ser uma data futura." };
  data.expiresAt = instante;
  return null;
};

const readAttachment: FieldReader = (valor, data) => {
  if (valor === null || valor === undefined || valor === "") {
    data.attachmentId = null;
    return null;
  }
  if (typeof valor !== "string" || !UUID.test(valor)) return { path: "attachment_id", message: "Anexo inválido." };
  data.attachmentId = valor;
  return null;
};

const readFlag =
  (campo: "isPinned" | "isRequired" | "isActive"): FieldReader =>
  (valor, data) => {
    data[campo] = valor === true;
    return null;
  };

/** Campo do corpo → leitor. A ordem é a ordem das mensagens de erro. */
const LEITORES: Record<string, FieldReader> = {
  title: readTitle,
  description_html: readDescription,
  expires_at: readExpiresAt,
  attachment_id: readAttachment,
  is_pinned: readFlag("isPinned"),
  is_required: readFlag("isRequired"),
  is_active: readFlag("isActive"),
};

// Na criação, título e texto são lidos mesmo ausentes, para a falta virar erro no campo.
const OBRIGATORIOS_NA_CRIACAO = new Set(["title", "description_html"]);

/**
 * Valida o corpo do recado e o traduz para o formato do banco. Na edição
 * (`partial`) só o que veio no corpo é lido; `null` limpa validade e anexo.
 */
export function validateRecadoInput(
  body: Record<string, unknown>,
  { partial, now }: ValidateOptions
): { data: RecadoData; errors: MuralFieldError[] } {
  const data: RecadoData = {};
  const isLido = (campo: string) => hasOwn(body, campo) || (!partial && OBRIGATORIOS_NA_CRIACAO.has(campo));
  const errors = Object.entries(LEITORES)
    .filter(([campo]) => isLido(campo))
    .map(([campo, ler]) => ler(body[campo], data, now))
    .filter((e): e is MuralFieldError => e !== null);
  return { data, errors };
}

/** Recado que ainda vale para a home e para o aviso de entrada. */
export const isRecadoVigente = (r: { isActive: boolean; expiresAt: Date | null }, now: Date): boolean =>
  r.isActive && (!r.expiresAt || r.expiresAt.getTime() > now.getTime());

/** Filtro de `publishedAt` do histórico. Data pura cobre o dia inteiro no fuso do escritório. */
export function buildPeriodoDoMural(query: { desde?: unknown; ate?: unknown }): { gte?: Date; lte?: Date } | undefined {
  const gte = query.desde ? inicioRecebido(query.desde) : null;
  const lte = query.ate ? vencimentoRecebido(query.ate) : null;
  const periodo = { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
  return Object.keys(periodo).length ? periodo : undefined;
}

type RecadoDaHome = { isPinned: boolean; isRead: boolean; publishedAt: Date };

const pesoNaHome = (r: RecadoDaHome) => (r.isRead ? 0 : 2) + (r.isPinned ? 1 : 0);

const isSempreVisivel = (r: RecadoDaHome) => !r.isRead || r.isPinned;

/**
 * Seção da home: TODO não lido e TODO fixado aparecem; dos lidos comuns só os
 * `lidosComuns` mais novos, para a seção não virar o histórico inteiro.
 */
export function selectRecadosDaHome<T extends RecadoDaHome>(recados: T[], lidosComuns: number): T[] {
  const ordenados = recados.toSorted(
    (a, b) => pesoNaHome(b) - pesoNaHome(a) || b.publishedAt.getTime() - a.publishedAt.getTime()
  );
  const comuns = new Set(ordenados.filter((r) => !isSempreVisivel(r)).slice(0, lidosComuns));
  return ordenados.filter((r) => isSempreVisivel(r) || comuns.has(r));
}
