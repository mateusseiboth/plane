// Erro de validação ligado a um campo. O tratador global transforma em
// `{ detail, errors: [{ path, message }] }`, e a tela injeta a mensagem no campo
// com `setError(path, ...)` além do aviso.

export type FieldErrorItem = { path: string; message: string };

// `errors` cobre a recusa com vários campos de uma vez (ex.: encerrar a visita
// sem resumo e sem conclusão); `path` cobre o caso de um campo só.
export type HttpError = { status: number; message: string; path?: string; errors?: FieldErrorItem[] };

export type ErrorBody = { detail: string; errors?: FieldErrorItem[] };

export function createFieldError(path: string, message: string): HttpError {
  return { status: 400, message, path };
}

export function buildErrorBody(error: HttpError): ErrorBody {
  if (Array.isArray(error.errors)) return { detail: error.message, errors: error.errors };
  if (!error.path) return { detail: error.message };
  return { detail: error.message, errors: [{ path: error.path, message: error.message }] };
}
