// Ações do módulo de atendimento (chat) na matriz de permissões.
//
// O chat registra AQUI as próprias ações, e `ACTION_CATALOG` as incorpora: a
// tela de Funções mostra uma caixa por ação, e o admin escolhe quais funções
// transferem, encerram, veem a fila etc. O chat-backend (outro container, sem
// este código) repete as chaves em `apps/chat-backend/src/permissoes.ts`; o teste
// `tests/permissoes-do-chat.test.ts` de lá reprova se as listas divergirem.
//
// `chat.gerenciar` e `chat.administrar` eram as ações grossas de antes. A
// migração `20261009120000_acoes_finas_do_chat` converteu o que estava gravado:
// quem atendia ganhou pausar, encerrar e abrir chamado; quem gerenciava,
// transferir, relatórios e ver todas; quem administrava, todas.
//
// Os padrões reproduzem o corte de antes, para nada mudar em silêncio.
// Só importa TIPO: o catálogo importa este arquivo, e o chat-backend importa o
// catálogo nos testes (alias `@utils` de lá aponta para cá).

import type { ActionDef } from "@utils/permissions";

export const GRUPO_DO_CHAT = "Atendimento (chat)";

const QUEM_ATENDE = ["atendimento", "qualidade", "ti", "member", "gestor_projeto"] as const;
const MEMBRO_E_GESTOR = ["member", "gestor_projeto"] as const;
const GESTOR = ["gestor_projeto"] as const;
const SO_ADMIN = [] as const;

const G = GRUPO_DO_CHAT;

// Um item por ação, na ordem em que a tela de Funções desenha.
export const ACOES_DO_CHAT = {
  CHAT_ATENDER: {
    key: "chat.atender",
    label: "Atender no chat",
    description: "Conectar ao atendimento, assumir conversas e responder.",
    group: G,
    scope: "workspace",
    roles: QUEM_ATENDE,
  },
  CHAT_PAUSAR: {
    key: "chat.pausar",
    label: "Pausar atendimentos",
    description: "Pausar e retomar a conversa e o alerta de cliente sem resposta.",
    group: G,
    scope: "workspace",
    roles: QUEM_ATENDE,
  },
  CHAT_ENCERRAR: {
    key: "chat.encerrar",
    label: "Encerrar atendimentos",
    description: "Encerrar a conversa com a classificação do atendimento.",
    group: G,
    scope: "workspace",
    roles: QUEM_ATENDE,
  },
  CHAT_ABRIR_CHAMADO: {
    key: "chat.abrir_chamado",
    label: "Abrir chamado pela conversa",
    description: "Criar o chamado com a conversa e os arquivos anexados.",
    group: G,
    scope: "workspace",
    roles: QUEM_ATENDE,
  },
  CHAT_TRANSFERIR: {
    key: "chat.transferir",
    label: "Transferir atendimentos",
    description: "Passar a conversa para outro atendente.",
    group: G,
    scope: "workspace",
    roles: MEMBRO_E_GESTOR,
  },
  CHAT_VER_TODAS: {
    key: "chat.ver_todas",
    label: "Ver conversas de outros atendentes",
    description: "Inclui as encerradas, o gerenciador de conversas e as ligações dos outros.",
    group: G,
    scope: "workspace",
    roles: MEMBRO_E_GESTOR,
  },
  CHAT_VER_FILA: {
    key: "chat.ver_fila",
    label: "Ver a fila e o robô",
    description: "Mostra as conversas que esperam atendente ou estão com o robô.",
    group: G,
    scope: "workspace",
    roles: SO_ADMIN,
  },
  CHAT_RELATORIOS: {
    key: "chat.relatorios",
    label: "Ver relatórios do chat",
    description: "Painel, monitor ao vivo, avaliações por atendente, prazos e ligações.",
    group: G,
    scope: "workspace",
    roles: MEMBRO_E_GESTOR,
  },
  CHAT_DISPARO: {
    key: "chat.disparo",
    label: "Disparar mensagens em massa",
    description: "Enviar a mesma mensagem para uma lista de contatos.",
    group: G,
    scope: "workspace",
    roles: GESTOR,
  },
  CHAT_CONFIGURAR: {
    key: "chat.configurar",
    label: "Configurar o chat",
    description: "Fila, robô, horários, atendentes, WhatsApp, telefonia e a avaliação do cliente.",
    group: G,
    scope: "workspace",
    roles: SO_ADMIN,
  },
  CHAT_FRASES_DO_ESPACO: {
    key: "chat.frases_do_espaco",
    label: "Editar as frases prontas do espaço",
    description: "Criar, alterar e apagar as frases que todos os atendentes usam.",
    group: G,
    scope: "workspace",
    roles: SO_ADMIN,
  },
} as const satisfies Record<string, ActionDef & { description: string }>;
