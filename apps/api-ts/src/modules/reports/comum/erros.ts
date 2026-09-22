/** Erros tipados dos relatórios: o `errorHandler` da API lê o `status`. */
export class RelatorioError extends Error {
  constructor(
    message: string,
    readonly status = 422
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ParametroDoRelatorioInvalidoError extends RelatorioError {
  constructor(message: string) {
    super(message, 400);
  }
}

/** Valida um parâmetro de lista fechada; ausente vale o padrão. */
export function requireOpcao<T extends string>(valor: unknown, opcoes: readonly T[], padrao: T, mensagem: string): T {
  if (valor === undefined || valor === null || valor === "") return padrao;
  if (opcoes.includes(valor as T)) return valor as T;
  throw new ParametroDoRelatorioInvalidoError(mensagem);
}
