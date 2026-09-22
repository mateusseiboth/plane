/**
 * Formato de e-mail, em um lugar só. Quem valida e-mail no api-ts chama daqui:
 * duas expressões diferentes aceitam endereços diferentes, e a divergência só
 * aparece no cadastro que ninguém abriu ainda.
 *
 * Propositalmente frouxa: recusa o que claramente não é endereço (sem arroba,
 * sem domínio, com espaço ou separador de lista). Quem diz se o endereço existe
 * é o envio, não a expressão.
 */
const EMAIL = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

export const isEmailValido = (valor: string): boolean => EMAIL.test(valor.trim());
