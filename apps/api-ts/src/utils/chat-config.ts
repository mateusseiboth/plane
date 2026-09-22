/**
 * Configuração do chat, guardada em `Instance.configurations.chat`.
 *
 * Fonte única da leitura: a tela de Configurações e a página de Links úteis
 * precisam da mesma resposta para "o atendimento por chat está ligado?".
 */
import prisma from "@db";

export type TChatConfig = { enabled: boolean; api_url: string; ws_url: string };

export async function readChatConfig(): Promise<TChatConfig> {
  const instance = await prisma.instance.findFirst({ select: { configurations: true } });
  const cfg = ((instance?.configurations as any)?.chat ?? {}) as Record<string, unknown>;
  return {
    enabled: Boolean(cfg.enabled),
    api_url: (cfg.api_url as string) ?? "",
    ws_url: (cfg.ws_url as string) ?? "",
  };
}
