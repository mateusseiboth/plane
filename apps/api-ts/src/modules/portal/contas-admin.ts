/**
 * Regras da administração das contas do portal, sem banco: leitura do
 * formulário, senha provisória e a escolha entre link por e-mail e senha
 * provisória. A gravação mora em `contas-admin.service.ts`.
 */

import { randomInt } from "crypto";
import type { FieldErrorItem } from "@utils/field-error";
import { normalizeEmail } from "@modules/portal/conta";
import { buildErrosDeCampo } from "@modules/portal/regras-do-cliente";

export const SENHA_MINIMA = 8;
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContaPayload = {
  name?: string;
  email?: string;
  password?: string;
  entityId?: string | null;
  isActive?: boolean;
  projectIds?: string[];
};

type Corpo = Record<string, unknown>;

/** Um leitor por campo: devolve o valor lido ou a mensagem de erro do campo. */
type Leitura = { valor: unknown } | { erro: string };

const LEITORES: Record<keyof ContaPayload, { campo: string; ler: (valor: unknown) => Leitura }> = {
  name: {
    campo: "name",
    ler: (valor) => {
      const nome = String(valor ?? "").trim();
      return nome ? { valor: nome } : { erro: "Informe o nome." };
    },
  },
  email: {
    campo: "email",
    ler: (valor) => {
      const email = normalizeEmail(valor);
      return EMAIL_VALIDO.test(email) ? { valor: email } : { erro: "Informe um e-mail válido." };
    },
  },
  password: {
    campo: "password",
    ler: (valor) => {
      const senha = String(valor ?? "");
      return senha.length >= SENHA_MINIMA
        ? { valor: senha }
        : { erro: `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.` };
    },
  },
  entityId: { campo: "entity_id", ler: (valor) => ({ valor: typeof valor === "string" && valor ? valor : null }) },
  isActive: { campo: "is_active", ler: (valor) => ({ valor: Boolean(valor) }) },
  projectIds: {
    campo: "project_ids",
    ler: (valor) =>
      Array.isArray(valor)
        ? { valor: valor.filter((id): id is string => typeof id === "string" && Boolean(id)) }
        : { erro: "Escolha os sistemas na lista." },
  },
};

/** Na criação estes campos são obrigatórios; na edição, só valem se vierem. */
const OBRIGATORIOS_NA_CRIACAO: ReadonlySet<keyof ContaPayload> = new Set(["name", "email", "password"]);

/** Senha vazia na edição quer dizer "não trocar", não "senha curta". */
const isAusente = (chave: keyof ContaPayload, valor: unknown, criando: boolean) =>
  valor === undefined || (chave === "password" && !criando && !valor);

/**
 * Lê o formulário da conta. Erro volta com o `path` do campo, todos de uma vez.
 * `criando` exige nome, e-mail e senha.
 */
export function readContaPayload(corpo: Corpo, criando: boolean): ContaPayload {
  const payload: Record<string, unknown> = {};
  const errors: FieldErrorItem[] = [];
  const chaves = Object.keys(LEITORES) as (keyof ContaPayload)[];
  for (const chave of chaves) {
    const { campo, ler } = LEITORES[chave];
    const bruto = corpo[campo];
    const obrigatorio = criando && OBRIGATORIOS_NA_CRIACAO.has(chave);
    if (isAusente(chave, bruto, criando) && !obrigatorio) continue;
    const leitura = ler(bruto);
    if ("erro" in leitura) errors.push({ path: campo, message: leitura.erro });
    if ("valor" in leitura) payload[chave] = leitura.valor;
  }
  if (errors.length) throw buildErrosDeCampo(errors);
  return withSistemasPadrao(payload as ContaPayload, criando);
}

/** Conta nova nasce sem sistema liberado quando o formulário não mandou a lista. */
const withSistemasPadrao = (payload: ContaPayload, criando: boolean): ContaPayload =>
  criando ? { entityId: null, projectIds: [], ...payload } : payload;

// ── Redefinir senha ──────────────────────────────────────────────────────────

/** Sem 0/O, 1/l/I: a senha provisória costuma ser ditada por telefone. */
const ALFABETO = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TAMANHO_DA_PROVISORIA = 12;

export function buildSenhaProvisoria(): string {
  return Array.from({ length: TAMANHO_DA_PROVISORIA }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
}

export const MODOS_DE_REDEFINICAO = ["email", "provisoria"] as const;
export type ModoDeRedefinicao = (typeof MODOS_DE_REDEFINICAO)[number];

/**
 * Link por e-mail quando há SMTP; senha provisória quando não há, ou quando o
 * administrador pede (cliente sem acesso ao e-mail cadastrado).
 */
export function pickModoDeRedefinicao(pedido: unknown, emailLigado: boolean): ModoDeRedefinicao {
  const modo = MODOS_DE_REDEFINICAO.find((m) => m === pedido) ?? (emailLigado ? "email" : "provisoria");
  if (modo === "email" && !emailLigado) {
    throw buildErrosDeCampo([
      { path: "modo", message: "O envio de e-mail não está configurado. Gere uma senha provisória." },
    ]);
  }
  return modo;
}
