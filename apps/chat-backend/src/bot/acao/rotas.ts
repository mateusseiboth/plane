/**
 * Catálogo dos destinos do passo "ação", para a tela de fluxos do robô montar
 * o passo (destino, parâmetros e as perguntas de cada campo). Quem configura
 * o robô é `chat.administrar`.
 */
import { Elysia } from "elysia";
import { authorizeChat, isNegado } from "@/acesso";
import type { Destino } from "@/bot/acao/tipos";
import { DESTINOS_DO_ROBO } from "@/bot/engine";
import { CHAT_ACTION } from "@/permissoes";

export const serializeDestino = (d: Destino) => ({
  key: d.key,
  label: d.label,
  params: d.params,
  campos: d.campos.map((c) => ({ key: c.key, label: c.label, prompt: c.prompt, kind: c.kind })),
});

export const destinosModule = new Elysia().get(
  "/workspaces/:slug/config/bot/destinos/",
  async ({ params: { slug }, headers, set }) => {
    const acesso = await authorizeChat(slug, headers, CHAT_ACTION.ADMINISTRAR);
    if (isNegado(acesso)) {
      set.status = acesso.status;
      return acesso.body;
    }
    return Object.values(DESTINOS_DO_ROBO).map(serializeDestino);
  }
);
