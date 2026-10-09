/**
 * O que o atendimento mostra para cada pessoa, pelas ações do chat na matriz
 * (`useMyWorkspaceActions(slug).can`). São as mesmas chaves que o módulo do chat
 * registra no catálogo do api-ts (`apps/api-ts/src/utils/acoes-do-chat.ts`) e
 * que o chat-backend confere em cada rota. A tela só esconde; quem barra é o
 * servidor.
 */

export const ACAO_DO_CHAT = {
  ATENDER: "chat.atender",
  PAUSAR: "chat.pausar",
  ENCERRAR: "chat.encerrar",
  ABRIR_CHAMADO: "chat.abrir_chamado",
  TRANSFERIR: "chat.transferir",
  VER_TODAS: "chat.ver_todas",
  VER_FILA: "chat.ver_fila",
  RELATORIOS: "chat.relatorios",
  VER_AVALIACAO: "chat.ver_avaliacao",
  DISPARO: "chat.disparo",
  CONFIGURAR: "chat.configurar",
  FRASES_DO_ESPACO: "chat.frases_do_espaco",
} as const;

type Can = (acao: string) => boolean;

export function buildPermissoesDoAtendimento(can: Can) {
  return {
    canTransferir: can(ACAO_DO_CHAT.TRANSFERIR),
    canPausar: can(ACAO_DO_CHAT.PAUSAR),
    canEncerrar: can(ACAO_DO_CHAT.ENCERRAR),
    canAbrirChamado: can(ACAO_DO_CHAT.ABRIR_CHAMADO),
    // Gerenciador de conversas, original de mensagem apagada e versões editadas.
    canVerTodas: can(ACAO_DO_CHAT.VER_TODAS),
    // Abas "Na fila" e "Bot" da lista.
    canVerFila: can(ACAO_DO_CHAT.VER_FILA),
    // Painel do atendimento (relatórios, monitor, avaliações, prazos, ligações).
    canVerRelatorios: can(ACAO_DO_CHAT.RELATORIOS),
    // Bloco "Avaliação" da conversa. Ação própria: às vezes o atendente não deve
    // ver a nota que recebeu, para não descontar no cliente depois.
    canVerAvaliacao: can(ACAO_DO_CHAT.VER_AVALIACAO),
    hasConfiguracao: can(ACAO_DO_CHAT.CONFIGURAR) || can(ACAO_DO_CHAT.FRASES_DO_ESPACO),
  };
}

export type PermissoesDoAtendimento = ReturnType<typeof buildPermissoesDoAtendimento>;

/** Abas da configuração do chat, na ordem da tela, com a ação que cada uma pede. */
export const ABAS_DA_CONFIGURACAO = [
  { key: "messages", label: "Mensagens", acao: ACAO_DO_CHAT.CONFIGURAR },
  { key: "menu", label: "Menu", acao: ACAO_DO_CHAT.CONFIGURAR },
  { key: "queues", label: "Filas", acao: ACAO_DO_CHAT.CONFIGURAR },
  { key: "flows", label: "Fluxos", acao: ACAO_DO_CHAT.CONFIGURAR },
  { key: "schedules", label: "Horários", acao: ACAO_DO_CHAT.CONFIGURAR },
  { key: "encerramento", label: "Encerramento", acao: ACAO_DO_CHAT.CONFIGURAR },
  { key: "frases", label: "Frases", acao: ACAO_DO_CHAT.FRASES_DO_ESPACO },
  { key: "attendants", label: "Atendentes", acao: ACAO_DO_CHAT.CONFIGURAR },
  { key: "provider", label: "WhatsApp (Z-API)", acao: ACAO_DO_CHAT.CONFIGURAR },
  { key: "telefonia", label: "Telefonia", acao: ACAO_DO_CHAT.CONFIGURAR },
] as const;

export type AbaDaConfiguracao = (typeof ABAS_DA_CONFIGURACAO)[number]["key"];

export const buildAbasDaConfiguracao = (can: Can) => ABAS_DA_CONFIGURACAO.filter((aba) => can(aba.acao));
