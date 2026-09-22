// Campos de perfil que vieram da intranet (telefone, celular, aniversário e
// apelido): leitura do corpo com validação que volta para o campo.

import { createFieldError } from "@utils/field-error";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const TEXT_LIMITS: Record<string, [string, number]> = {
  phone: ["phone", 30],
  mobile_phone: ["mobilePhone", 30],
  nickname: ["nickname", 60],
};

function readLimitedText(path: string, value: unknown, max: number): string | null {
  const text = String(value ?? "").trim();
  if (text.length > max) throw createFieldError(path, `Use até ${max} caracteres.`);
  return text || null;
}

/** Data do calendário (sem hora). Recusa 31/02 e datas no futuro. */
export function readBirthDate(value: unknown): Date | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const match = DATE_RE.exec(text);
  const date = match ? new Date(`${text}T00:00:00Z`) : null;
  const isSameDay = date?.toISOString().slice(0, 10) === text;
  if (!date || !isSameDay) throw createFieldError("birth_date", "Informe uma data válida.");
  if (date.getTime() > Date.now()) throw createFieldError("birth_date", "A data não pode estar no futuro.");
  return date;
}

export function readProfileData(body: any): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [input, [column, max]] of Object.entries(TEXT_LIMITS)) {
    if (body[input] !== undefined) data[column] = readLimitedText(input, body[input], max);
  }
  if (body.birth_date !== undefined) data.birthDate = readBirthDate(body.birth_date);
  return data;
}

export function buildProfileDto(u: any) {
  return {
    phone: u.phone ?? null,
    mobile_phone: u.mobilePhone ?? null,
    // O tipo IUser do frontend já tinha `mobile_number`; os dois apontam para o mesmo dado.
    mobile_number: u.mobilePhone ?? null,
    birth_date: u.birthDate ? new Date(u.birthDate).toISOString().slice(0, 10) : null,
    nickname: u.nickname ?? null,
  };
}
