// Erro de validação ligado a um campo. O tratador global transforma em
// `{ detail, errors: [{ path, message }] }`, e a tela injeta a mensagem no campo
// com `setError(path, ...)` além do aviso.

export type HttpError = { status: number; message: string; path?: string };

export type ErrorBody = { detail: string; errors?: { path: string; message: string }[] };

export function createFieldError(path: string, message: string): HttpError {
  return { status: 400, message, path };
}

export function buildErrorBody(error: HttpError): ErrorBody {
  if (!error.path) return { detail: error.message };
  return { detail: error.message, errors: [{ path: error.path, message: error.message }] };
}
