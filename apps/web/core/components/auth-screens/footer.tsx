/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Rodapé das telas de autenticação.
 *
 * A versão original trazia a prova social da Plane (Zerodha, Sony, Dolby,
 * Accenture) e "mais de 10.000 equipes" — clientes e números que não são nossos.
 * Ficou só a assinatura do produto.
 */
export function AuthFooter() {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-13 text-tertiary">Avião · Gestão de chamados e atendimento</span>
    </div>
  );
}
