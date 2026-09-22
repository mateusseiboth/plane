/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * A conexão do atendente com o chat, num lugar só.
 *
 * Este código morava dentro da tela do chat. Agora o sistema inteiro mantém a
 * presença aberta (quem entra no Plane já fica online para a fila), e as duas
 * pontas precisam falar o MESMO protocolo: mesmo ticket, mesma resposta ao ping
 * e a mesma reconexão. Duas cópias divergiriam na primeira correção, e a que
 * divergisse deixaria o atendente offline sem ninguém perceber.
 */

import { delayDaReconexao } from "@/components/chat/regras-de-presenca";

export type EstadoDaConexao = "conectando" | "conectado" | "reconectando";

export type OpcoesDaConexao = {
  /** Base REST do chat, de onde sai o ticket. */
  apiUrl: string;
  /** Endereço do WebSocket do chat. */
  wsUrl: string;
  workspaceSlug: string;
  /** Chegou um evento do servidor (o ping é respondido aqui e não chega). */
  onEvento: (evento: any) => void;
  /** A conexão abriu ou reabriu. É a hora de reassinar o que estava aberto. */
  onAbriu?: (enviar: (payload: unknown) => void) => void;
  onEstado?: (estado: EstadoDaConexao) => void;
};

export type ConexaoDoAtendente = {
  enviar: (payload: unknown) => void;
  fechar: () => void;
};

/**
 * Bilhete curto para o WebSocket.
 *
 * O cookie do Plane resolve no REST, mas não dá para contar com ele chegando ao
 * upgrade do WebSocket do Bun (proxy no meio, cookie de outro domínio). O REST
 * troca o cookie por um ticket e o ticket vai na URL.
 */
export async function findTicketDoChat(apiUrl: string, workspaceSlug: string): Promise<string | null> {
  try {
    const resposta = await fetch(`${apiUrl}/workspaces/${encodeURIComponent(workspaceSlug)}/ws-ticket/`, {
      credentials: "include",
    });
    if (!resposta.ok) return null;
    const dados = await resposta.json();
    return dados.ticket ?? null;
  } catch {
    return null;
  }
}

/** Fechamento normal: pedido por quem abriu, não é queda. Não reconecta. */
const FECHAMENTO_NORMAL = 1000;

export function abrirConexaoDoAtendente(opcoes: OpcoesDaConexao): ConexaoDoAtendente {
  let socket: WebSocket | null = null;
  let parado = false;
  let tentativa = 0;
  let agendamento: ReturnType<typeof setTimeout> | null = null;

  const enviar = (payload: unknown) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  };

  const conectar = async () => {
    if (parado) return;
    opcoes.onEstado?.(tentativa === 0 ? "conectando" : "reconectando");
    const ticket = await findTicketDoChat(opcoes.apiUrl, opcoes.workspaceSlug);
    if (parado) return;

    const endereco =
      `${opcoes.wsUrl}?workspace=${encodeURIComponent(opcoes.workspaceSlug)}` +
      (ticket ? `&ticket=${encodeURIComponent(ticket)}` : "");

    socket = new WebSocket(endereco);

    socket.addEventListener("open", () => {
      tentativa = 0;
      opcoes.onEstado?.("conectado");
      opcoes.onAbriu?.(enviar);
    });

    socket.addEventListener("message", (evento) => {
      const mensagem = JSON.parse(evento.data);
      // O servidor derruba quem não responde ao ping: sem isto a presença cai
      // sozinha a cada rodada do heartbeat.
      if (mensagem.type === "ping") return enviar({ type: "pong" });
      opcoes.onEvento(mensagem);
    });

    socket.addEventListener("close", (evento) => {
      if (parado || evento.code === FECHAMENTO_NORMAL) return;
      tentativa += 1;
      opcoes.onEstado?.("reconectando");
      agendamento = setTimeout(() => void conectar(), delayDaReconexao(tentativa));
    });
  };

  void conectar();

  return {
    enviar,
    fechar: () => {
      parado = true;
      if (agendamento) clearTimeout(agendamento);
      socket?.close(FECHAMENTO_NORMAL, "encerrado");
      socket = null;
    },
  };
}
