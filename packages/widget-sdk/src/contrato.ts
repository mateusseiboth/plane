/**
 * Contrato do widget com a plataforma: permissões, limites do envio, ciclo de
 * vida, eventos e erros do gateway. É dado puro (sem import) para o gerador
 * da referência (`scripts/gerar-referencia.ts`) e para o teste do api-ts que
 * confere se a validação do servidor continua igual ao que está escrito aqui.
 */

/**
 * Permissões que um widget pode pedir no `manifest.json`, com o que cada uma
 * libera. Pedido fora desta lista recusa o pacote no envio. O gateway responde
 * 403 para a chamada de uma API cuja permissão o manifesto não declarou.
 */
export const WIDGET_PERMISSIONS = {
  "worker-items.read": "Listar e ler chamados (workerItemsApi, useWorkerItems, useWorkerItem).",
  "intakes.read": "Listar e ler solicitações da triagem (intakesApi, useIntakes, useIntake).",
  "actions.read": "Listar chamados na visão resumida de ações (actionsApi, useActions, useAction).",
  "stats.read": "Ler totais e estatísticas por período e por entidade (statsApi, useStats).",
  "users.read": "Ler a pessoa logada e os membros do espaço (usersApi, useUsers, useCurrentUser).",
  "entities.read": "Listar e ler entidades, os clientes atendidos (entitiesApi, useEntities, useEntity).",
} as const;

/** Uma das chaves de `WIDGET_PERMISSIONS`. */
export type WidgetPermission = keyof typeof WIDGET_PERMISSIONS;

/**
 * Limites do envio de um pacote. Os tamanhos são os padrões do servidor e
 * podem ser trocados pela instância (variáveis `WIDGET_MAX_ZIP_SIZE` e
 * `WIDGET_MAX_BUNDLE_SIZE`).
 */
export const WIDGET_LIMITS = {
  /** Tamanho máximo do `.zip` enviado, em bytes (10 MB). */
  zipMaxBytes: 10 * 1024 * 1024,
  /** Tamanho máximo do arquivo de entrada (`entry`) dentro do zip, em bytes (5 MB). */
  bundleMaxBytes: 5 * 1024 * 1024,
  /** Formato aceito para `version`: semver `major.minor.patch`, só números. */
  versionPattern: "^\\d+\\.\\d+\\.\\d+$",
  /** Tamanho máximo de `title`, em caracteres. O excedente é cortado. */
  titleMaxLength: 80,
  /** Tamanho máximo de `name` e `author`, em caracteres. O excedente é cortado. */
  nameMaxLength: 255,
  /** Envios por minuto por pessoa (global e "meu widget" somados). Acima disso: 429. */
  uploadsPerMinute: 5,
  /** Itens por página nas listagens do gateway: padrão. */
  pageSizeDefault: 20,
  /** Itens por página nas listagens do gateway: máximo aceito em `limit`. */
  pageSizeMax: 100,
} as const;

/** Etapas da vida de um widget na home, na ordem em que acontecem. */
export const WIDGET_LIFECYCLE = [
  {
    stage: "envio",
    description:
      "O zip passa pela validação do manifesto e dos limites. O widget entra ativo: global (enviado na administração) ou meu (enviado pela própria pessoa, só na home dela).",
  },
  {
    stage: "carregar",
    description:
      "A home busca o widget, chama initializeSDK com o id dele e o espaço aberto, e importa o arquivo de entrada como módulo ES. react, react-dom, react/jsx-runtime e @mateusseiboth/widgets-aviao são entregues pela própria plataforma.",
  },
  {
    stage: "montar",
    description:
      "O export default do módulo é renderizado dentro do cartão, com as props de WidgetHomeProps (size). Falha ao carregar ou erro na renderização mostra um aviso no lugar do widget, sem derrubar a home.",
  },
  {
    stage: "atualizar",
    description:
      "Quando a pessoa muda o tamanho do cartão, o componente recebe o novo size. Trocar a ordem dos cartões não recarrega o pacote.",
  },
  {
    stage: "desmontar",
    description:
      "Ocultar o widget em Gerenciar widgets ou sair da home desmonta o componente. Limpe timers e assinaturas no retorno do useEffect.",
  },
] as const;

/** Eventos que o SDK dispara para a plataforma (em `window` e por `postMessage` para a janela pai). */
export const WIDGET_EVENTS = [
  {
    name: "widget:notification",
    origin: "notificationsApi",
    payload: "{ type: 'success' | 'error' | 'warning' | 'info', message: string }",
    description: "Pede um aviso (toast) à plataforma.",
  },
  {
    name: "widget:ui",
    origin: "uiApi",
    payload:
      "{ source: 'widget-sdk', event: 'modal:open' | 'modal:close' | 'drawer:open' | 'drawer:close' | 'confirm:open', config?: ModalConfig | DrawerConfig | ConfirmConfig }",
    description: "Pede à plataforma para abrir ou fechar um modal, uma gaveta ou uma confirmação.",
  },
] as const;

/** Respostas de erro do gateway (`/api/v1/widget-sdk/*`) e do envio de pacote. O corpo é `{ detail }`. */
export const GATEWAY_ERRORS = [
  { status: 400, when: "Faltou o cabeçalho X-Widget-Id (o SDK manda sozinho depois do initializeSDK)." },
  { status: 400, when: "Faltou o workspace_slug numa rota de dados (o SDK manda o espaço aberto)." },
  { status: 400, when: "stats.period sem start_date ou end_date." },
  { status: 400, when: "Envio: zip inválido, manifesto inválido, arquivo de entrada ausente ou acima do limite." },
  { status: 401, when: "Sessão expirada ou ausente." },
  { status: 403, when: "Widget inexistente, inativo ou privado de outra pessoa." },
  { status: 403, when: "O manifesto não declarou a permissão da API chamada." },
  { status: 403, when: "A pessoa não participa do espaço informado." },
  { status: 404, when: "Registro não encontrado ou fora dos sistemas que a pessoa enxerga." },
  { status: 409, when: "Envio: o mesmo nome e versão já existem no mesmo escopo." },
  { status: 429, when: "Envio: mais de 5 pacotes por minuto." },
] as const;
