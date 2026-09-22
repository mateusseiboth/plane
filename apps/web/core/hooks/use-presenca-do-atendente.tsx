/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Presença do atendente no chat, do login até a saída.
 *
 * Antes a pessoa só ficava online depois de abrir a tela do chat pelo menos uma
 * vez, e quem nunca abria simplesmente não existia para a fila: o atendimento
 * ficava parado esperando alguém que estava ali o tempo todo. Agora a conexão
 * nasce junto com o espaço de trabalho, para todo mundo que pode atender.
 *
 * Ficar online tem um preço: a fila passa a entregar conversa para quem não está
 * olhando o chat. Por isso o mesmo canal que dá a presença também traz o aviso,
 * com som, recado do navegador e um atalho para a tela.
 *
 * Quem não quer receber continua com as saídas de sempre, que são do SERVIDOR e
 * valem igual aqui: o status invisível do atendente e o horário de atendimento
 * do espaço. Esta conexão só informa que a pessoa está presente.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// hooks
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
// components
import { notifyDesktop, playAlert } from "@/components/chat/avisos-do-chat";
import { abrirConexaoDoAtendente, type ConexaoDoAtendente } from "@/components/chat/conexao-do-atendente";
import { avisoDoEvento, isTelaDoChat, shouldConnectPresenca } from "@/components/chat/regras-de-presenca";
// services
import { ChatService } from "@/services/chat.service";

const chatService = new ChatService();

/** O aviso fica na tela até ser fechado: atendimento não pode passar batido. */
const AVISO_NAO_SOME_SOZINHO = 0;

export function usePresencaDoAtendente(workspaceSlug: string | undefined) {
  const pathname = usePathname();
  const slug = workspaceSlug ?? "";

  // Mesma ação que o chat-backend exige para entregar o ticket do WebSocket
  // (`CHAT_ACTION.ATENDER` em `src/permissoes.ts`). Perguntar pelo número do
  // papel aqui ignoraria a função configurada e as exceções por pessoa.
  const { can } = useMyWorkspaceActions(slug || undefined);
  const podeAtender = can("chat.atender");
  const [config, setConfig] = useState<{ api_url: string; ws_url: string; enabled: boolean } | null>(null);

  // A rota muda o tempo todo; a conexão não pode cair a cada navegação, então o
  // tratador lê a rota atual por referência.
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Configuração do chat do espaço. Espaço sem chat não abre conexão nenhuma.
  useEffect(() => {
    if (!slug || !podeAtender) {
      setConfig(null);
      return;
    }
    let valido = true;
    void (async () => {
      try {
        const cfg = await chatService.getConfig(slug);
        if (valido) setConfig(cfg);
      } catch {
        // Chat fora do ar não pode impedir o resto do sistema de abrir.
        if (valido) setConfig(null);
      }
    })();
    return () => {
      valido = false;
    };
  }, [slug, podeAtender]);

  useEffect(() => {
    if (!shouldConnectPresenca({ slug, chatHabilitado: !!config?.enabled, podeAtender })) return;
    if (!config) return;

    const conexao: ConexaoDoAtendente = abrirConexaoDoAtendente({
      apiUrl: config.api_url,
      wsUrl: config.ws_url,
      workspaceSlug: slug,
      onEvento: (evento) => {
        const aviso = avisoDoEvento(evento, { naTelaDoChat: isTelaDoChat(pathnameRef.current, slug) });
        if (!aviso) return;
        playAlert();
        notifyDesktop(aviso.titulo, aviso.corpo, aviso.chave);
        setToast({
          id: aviso.chave,
          type: TOAST_TYPE.INFO,
          title: aviso.titulo,
          message: aviso.corpo,
          timeout: AVISO_NAO_SOME_SOZINHO,
          actionItems: (
            <Link href={`/${slug}/chat/`} className="text-body-xs-medium text-primary underline">
              Abrir o chat
            </Link>
          ),
        });
      },
    });

    return () => conexao.fechar();
  }, [slug, podeAtender, config]);
}
