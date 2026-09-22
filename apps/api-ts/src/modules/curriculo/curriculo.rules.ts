/**
 * Regras puras dos currículos: o PDF aceito, os dados que o robô manda, os
 * filtros da tela, as marcações de lido e entrevistado e o prazo de guarda da
 * LGPD. Nada aqui toca o banco nem o storage.
 */
import type { Prisma } from "@prisma/client";
import { isEmailValido } from "@utils/email-valido";
import type { FieldErrorItem } from "@utils/field-error";

export const RETENCAO_PADRAO_DIAS = 365;
const RETENCAO_MINIMA = 30;
const RETENCAO_MAXIMA = 3650;
const TAMANHO_MAXIMO = 10 * 1024 * 1024;
const DIA_MS = 24 * 60 * 60 * 1000;

const NAO_E_PDF = "O arquivo enviado não é um PDF. Envie o currículo em PDF.";

/**
 * Confere o tipo declarado E a assinatura `%PDF-` do conteúdo: o tipo sozinho
 * é o que o remetente diz, e qualquer executável pode chegar dizendo ser PDF.
 */
export async function validatePdf(arquivo: Blob | null | undefined): Promise<FieldErrorItem[]> {
  if (!arquivo || !arquivo.size) return [{ path: "file", message: "Envie o currículo em PDF." }];
  const assinatura = new TextDecoder().decode(await arquivo.slice(0, 5).arrayBuffer());
  if (!arquivo.type.startsWith("application/pdf") || assinatura !== "%PDF-")
    return [{ path: "file", message: NAO_E_PDF }];
  if (arquivo.size > TAMANHO_MAXIMO) return [{ path: "file", message: "O PDF pode ter até 10 MB." }];
  return [];
}

/** De onde o currículo veio. Objeto `as const` no lugar de enum. */
export const CURRICULO_ORIGEM = { CHAT: "chat", SITE: "site" } as const;
export type CurriculoOrigem = (typeof CURRICULO_ORIGEM)[keyof typeof CURRICULO_ORIGEM];

export type CurriculoData = {
  name: string;
  position: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  message: string | null;
  chatSessionId: string | null;
  source: CurriculoOrigem;
  consentAt: Date | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");
const optionalText = (valor: unknown, max: number) => text(valor).slice(0, max) || null;

const OBRIGATORIOS: Array<[path: string, message: string]> = [
  ["name", "Informe o nome."],
  ["position", "Informe a vaga de interesse."],
];

export function validateCurriculoInput(body: Record<string, unknown>): {
  data: CurriculoData;
  errors: FieldErrorItem[];
} {
  const errors = OBRIGATORIOS.filter(([path]) => !text(body[path])).map(([path, message]) => ({ path, message }));
  const sessao = text(body.chat_session_id);
  return {
    errors,
    data: {
      name: text(body.name).slice(0, 120),
      position: text(body.position).slice(0, 120),
      phone: optionalText(body.phone, 30),
      email: null,
      city: null,
      message: optionalText(body.message, 2000),
      chatSessionId: UUID.test(sessao) ? sessao : null,
      source: CURRICULO_ORIGEM.CHAT,
      consentAt: null,
    },
  };
}

/** Campo isca: invisível na tela, preenchido só por robô de formulário. */
export const ISCA = "sobrenome";

export const isRoboNaIsca = (body: Record<string, unknown>): boolean => !!text(body[ISCA]);

const ACEITES = new Set(["true", "on", "1", "sim"]);

const isAceiteLgpd = (valor: unknown) => valor === true || ACEITES.has(text(valor).toLowerCase());

const onlyDigitos = (valor: string) => valor.replace(/\D/g, "");

/** Campo do formulário público → como recusá-lo. A ordem é a das mensagens. */
const CAMPOS_DO_SITE: Array<[path: string, message: string, isValido: (valor: string) => boolean]> = [
  ["name", "Informe seu nome.", (valor) => !!valor],
  ["email", "Informe um e-mail válido.", (valor) => isEmailValido(valor)],
  ["phone", "Informe o telefone com DDD.", (valor) => onlyDigitos(valor).length >= 10],
  ["position", "Informe a vaga de interesse.", (valor) => !!valor],
  ["city", "Informe a cidade onde mora.", (valor) => !!valor],
];

/**
 * Inscrição da página pública: mesmos campos do robô mais e-mail, cidade e o
 * aceite da LGPD, que é obrigatório (sem ele não se guarda dado de ninguém).
 */
export function validateInscricaoDoSite(
  body: Record<string, unknown>,
  agora: Date
): { data: CurriculoData; errors: FieldErrorItem[] } {
  const errors = CAMPOS_DO_SITE.filter(([path, , isValido]) => !isValido(text(body[path]))).map(([path, message]) => ({
    path,
    message,
  }));
  const isAceito = isAceiteLgpd(body.aceite_lgpd);
  if (!isAceito) errors.push({ path: "aceite_lgpd", message: "É preciso aceitar a guarda dos seus dados." });
  return {
    errors,
    data: {
      name: text(body.name).slice(0, 120),
      position: text(body.position).slice(0, 120),
      phone: optionalText(body.phone, 30),
      email: text(body.email).toLowerCase().slice(0, 200) || null,
      city: optionalText(body.city, 120),
      message: optionalText(body.message, 2000),
      chatSessionId: null,
      source: CURRICULO_ORIGEM.SITE,
      consentAt: isAceito ? agora : null,
    },
  };
}

const FILTRO_SIM_NAO = (campo: "readAt" | "interviewedAt"): Record<string, Prisma.CurriculoWhereInput> => ({
  true: { [campo]: { not: null } },
  false: { [campo]: null },
});

export function buildCurriculoWhere(workspaceId: string, query: Record<string, unknown>): Prisma.CurriculoWhereInput {
  const vaga = text(query.position);
  return {
    workspaceId,
    ...(vaga ? { position: { contains: vaga, mode: "insensitive" as const } } : {}),
    ...FILTRO_SIM_NAO("readAt")[String(query.read)],
    ...FILTRO_SIM_NAO("interviewedAt")[String(query.interviewed)],
  };
}

type Marcacao = Partial<{
  readAt: Date | null;
  readById: string | null;
  interviewedAt: Date | null;
  interviewedById: string | null;
}>;

const MARCACOES: Array<[campo: string, quando: "readAt" | "interviewedAt", quem: "readById" | "interviewedById"]> = [
  ["is_read", "readAt", "readById"],
  ["is_interviewed", "interviewedAt", "interviewedById"],
];

/** `is_read`/`is_interviewed` true grava quem e quando; false limpa os dois. */
export function buildMarcacao(body: Record<string, unknown>, userId: string, agora: Date): Marcacao {
  return Object.fromEntries(
    MARCACOES.filter(([campo]) => typeof body[campo] === "boolean").flatMap(([campo, quando, quem]) => {
      const isMarcado = body[campo] === true;
      return [
        [quando, isMarcado ? agora : null],
        [quem, isMarcado ? userId : null],
      ];
    })
  );
}

export const isVencido = (recebidoEm: Date, retencaoDias: number, agora: Date): boolean =>
  agora.getTime() - recebidoEm.getTime() > retencaoDias * DIA_MS;

export const inicioDaRetencao = (retencaoDias: number, agora: Date) =>
  new Date(agora.getTime() - retencaoDias * DIA_MS);

export function validateRetencao(valor: unknown): FieldErrorItem[] {
  const dias = Number(valor);
  if (Number.isInteger(dias) && dias >= RETENCAO_MINIMA && dias <= RETENCAO_MAXIMA) return [];
  return [{ path: "retention_days", message: `Informe um prazo entre ${RETENCAO_MINIMA} e ${RETENCAO_MAXIMA} dias.` }];
}
