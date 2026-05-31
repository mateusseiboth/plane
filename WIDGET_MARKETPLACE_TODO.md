# Widget Marketplace — Plano de Implementação

> Arquivo sincronizado com o rastreamento interno do assistente.
> Cada etapa deve ser marcada com `[x]` ao ser concluída.

---

## Fase 1 — Backend: Banco de Dados e Módulo Core

### 1.1 Prisma Schema

- [ ] **1.1.1** Adicionar model `Widget` ao `schema.prisma`
  - Campos: `id`, `name`, `description`, `version`, `author`, `entryFile`, `manifest` (Json), `permissions` (String[]), `status` (enum), `storageKey`, `createdById`, `createdAt`, `updatedAt`, `deletedAt`
  - Enum `WidgetStatus`: `ACTIVE`, `INACTIVE`, `PENDING_APPROVAL`, `ARCHIVED`
  - Relação com `User` (createdBy)
- [ ] **1.1.2** Adicionar model `WidgetVersion` ao `schema.prisma`
  - Campos: `id`, `widgetId`, `version`, `storageKey`, `manifest` (Json), `changelog`, `createdAt`
  - Relação com `Widget`
- [ ] **1.1.3** Executar `bunx prisma migrate dev` e gerar client

---

### 1.2 Módulo Widget — Armazenamento de Assets

- [ ] **1.2.1** Criar utilitário `widget-storage.ts` em `apps/api-ts/src/utils/`
  - Suporte a storage local (disco), MinIO e S3 via variável de ambiente `WIDGET_STORAGE_DRIVER`
  - Interface comum: `put(key, buffer)`, `get(key)`, `delete(key)`, `getUrl(key)`
- [ ] **1.2.2** Criar utilitário `widget-zip.ts` em `apps/api-ts/src/utils/`
  - `extractZip(buffer)` → retorna `{ manifest, entryBuffer }`
  - Validar presença de `manifest.json` e do arquivo entry
  - Validar tamanho máximo do ZIP (env `WIDGET_MAX_ZIP_SIZE`, padrão 10 MB)
  - Validar tamanho máximo do bundle JS (env `WIDGET_MAX_BUNDLE_SIZE`, padrão 5 MB)
- [ ] **1.2.3** Criar utilitário `widget-manifest.ts` em `apps/api-ts/src/utils/`
  - Validar campos obrigatórios: `name`, `version`, `author`, `entry`, `permissions`
  - Validar formato de versão semver (`major.minor.patch`)
  - Validar que permissões pertencem à lista branca definida

---

### 1.3 Módulo Widget — Endpoints CRUD

- [ ] **1.3.1** Criar `apps/api-ts/src/modules/widget/index.ts`
- [ ] **1.3.2** `POST /api/v1/widgets/` — Upload de widget (multipart ZIP)
  - Autenticação: requer admin da instância
  - Fluxo: extrair ZIP → validar manifest → armazenar assets → criar `Widget` + `WidgetVersion` no banco
  - Status inicial: `PENDING_APPROVAL`
  - Retorno: registro `Widget` serializado
- [ ] **1.3.3** `GET /api/v1/widgets/` — Listagem com filtros
  - Filtros: `name`, `author`, `status`, `version` (query params)
  - Paginação cursor-based (padrão da plataforma)
- [ ] **1.3.4** `GET /api/v1/widgets/:id` — Buscar widget por ID
- [ ] **1.3.5** `PUT /api/v1/widgets/:id` — Atualizar metadados (name, description)
  - Não permite alterar `version`, `entryFile`, `manifest` via este endpoint
- [ ] **1.3.6** `POST /api/v1/widgets/:id/activate` — Alterar status para `ACTIVE`
- [ ] **1.3.7** `POST /api/v1/widgets/:id/deactivate` — Alterar status para `INACTIVE`
- [ ] **1.3.8** `DELETE /api/v1/widgets/:id` — Remoção lógica (soft delete via `deletedAt`)
- [ ] **1.3.9** `GET /api/v1/widgets/:id/assets/*` — Servir arquivos do widget (bundle JS)
  - Verificar que widget está `ACTIVE`
  - Fazer proxy / stream do arquivo do storage
  - Cache headers adequados (`Cache-Control`, `ETag`)
- [ ] **1.3.10** Registrar módulo no `apps/api-ts/src/index.ts`

---

## Fase 2 — Backend: Gateway do SDK

> Os widgets nunca acessam APIs internas diretamente. Todo tráfego passa pelo gateway `/api/widget-sdk/`.

### 2.1 Módulo Gateway

- [ ] **2.1.1** Criar `apps/api-ts/src/modules/widget-sdk-gateway/index.ts`
- [ ] **2.1.2** Middleware de autenticação do gateway: valida que requisição vem de um widget ativo (header `X-Widget-Id`)
- [ ] **2.1.3** Middleware de autorização: valida que a permissão solicitada consta no manifest do widget

---

### 2.2 WorkerItems API

- [ ] **2.2.1** `GET /api/widget-sdk/worker-items` — Listar (pass-through para módulo work-item com escopo workspace)
  - Params: `page`, `limit`, `search`, `entityId`, `status`, `assigneeId`
  - Retorno: `{ data, page, total, totalPages }`
- [ ] **2.2.2** `GET /api/widget-sdk/worker-items/:id` — Buscar por ID
- [ ] **2.2.3** `GET /api/widget-sdk/worker-items/stats` — Estatísticas agregadas

---

### 2.3 Intakes API

- [ ] **2.3.1** `GET /api/widget-sdk/intakes` — Listar (filtros equivalentes ao intake module)
- [ ] **2.3.2** `GET /api/widget-sdk/intakes/:id` — Buscar por ID
- [ ] **2.3.3** `GET /api/widget-sdk/intakes/stats` — Estatísticas

---

### 2.4 Actions API

- [ ] **2.4.1** `GET /api/widget-sdk/actions` — Listar ações
- [ ] **2.4.2** `GET /api/widget-sdk/actions/:id` — Buscar por ID
- [ ] **2.4.3** `GET /api/widget-sdk/actions/stats` — Estatísticas

---

### 2.5 Stats API

- [ ] **2.5.1** `GET /api/widget-sdk/stats/overview` — Visão geral (`workerItemsTotal`, `workerItemsOpen`, `workerItemsClosed`, `intakesTotal`, `actionsTotal`)
- [ ] **2.5.2** `GET /api/widget-sdk/stats/entity/:entityId` — Estatísticas por entidade
- [ ] **2.5.3** `GET /api/widget-sdk/stats/period` — Estatísticas por período (`startDate`, `endDate`)

---

### 2.6 Users API

- [ ] **2.6.1** `GET /api/widget-sdk/users/me` — Usuário atual
- [ ] **2.6.2** `GET /api/widget-sdk/users` — Listar usuários
- [ ] **2.6.3** `GET /api/widget-sdk/users/:id` — Buscar por ID

---

### 2.7 Entities API

- [ ] **2.7.1** `GET /api/widget-sdk/entities` — Listar entidades
- [ ] **2.7.2** `GET /api/widget-sdk/entities/:id` — Buscar por ID

---

### 2.8 OpenAPI

- [ ] **2.8.1** Configurar Elysia Swagger no módulo gateway
- [ ] **2.8.2** Adicionar schemas/tags a todos os endpoints do gateway
- [ ] **2.8.3** `GET /api/widget-sdk/docs` — Servir documentação OpenAPI interativa

---

## Fase 3 — Frontend: Painel de Administração

- [ ] **3.1** Criar rota `/settings/widgets/` em `apps/web/app/`
- [ ] **3.2** Criar componente `WidgetListPage` — tabela de widgets com status, ações (ativar, desativar, remover)
- [ ] **3.3** Criar componente `WidgetUploadModal` — drag-and-drop de ZIP com preview do manifest parseado
- [ ] **3.4** Criar componente `WidgetDetailPanel` — exibir detalhes, permissões, versões, histórico
- [ ] **3.5** Criar `WidgetService` em `apps/web/core/services/widget.service.ts`
  - Métodos: `list`, `getById`, `upload`, `update`, `activate`, `deactivate`, `remove`
- [ ] **3.6** Criar MobX store `widget.store.ts` em `apps/web/core/store/`
- [ ] **3.7** Criar hooks `useWidgets` e `useWidget` em `apps/web/core/hooks/`

---

## Fase 4 — Frontend: Loader Dinâmico de Widgets

- [ ] **4.1** Criar `WidgetRegistryService` em `apps/web/core/services/widget-registry.service.ts`
  - `fetchWidget(id)` — busca metadata e URL do bundle
  - `resolveAssetUrl(id, path)` — resolve URL de assets
- [ ] **4.2** Criar componente `DynamicWidget` em `apps/web/core/components/widgets/DynamicWidget.tsx`
  - Props: `widgetId: string`, `props: Record<string, unknown>`
  - Baixa bundle via `import(/* @vite-ignore */ url)`
  - Renderiza componente exportado como `default`
  - Exibe `<Skeleton />` durante carregamento
  - Exibe `<WidgetErrorFallback />` em caso de erro
- [ ] **4.3** Criar componente `WidgetErrorFallback` com mensagem de erro amigável
- [ ] **4.4** Injetar `window.WidgetSDK` antes da execução do bundle (chamar `initializeSDK()` do pacote SDK)

---

## Fase 5 — SDK: Pacote `@empresa/widget-sdk`

### 5.1 Estrutura do Pacote

- [ ] **5.1.1** Criar pacote `packages/widget-sdk/` no monorepo
  - `package.json`, `tsconfig.json`, `vite.config.ts` (library mode, saída `dist/index.js` + `dist/index.d.ts`)
  - Campos: `name: "@empresa/widget-sdk"`, `main`, `types`, `exports`
- [ ] **5.1.2** Configurar build para emitir tipagens completas (`tsc --emitDeclarationOnly`)
- [ ] **5.1.3** Adicionar à pipeline do turborepo (`turbo.json`)

---

### 5.2 Core do SDK

- [ ] **5.2.1** Criar `src/sdk.ts` — classe `WidgetSDKClient` que recebe `baseUrl` e `widgetId`
- [ ] **5.2.2** Criar `src/http.ts` — cliente HTTP interno com interceptor de autenticação (envia `X-Widget-Id`)
- [ ] **5.2.3** Criar `src/init.ts` — função `initializeSDK({ baseUrl, widgetId })` que monta `window.WidgetSDK`

---

### 5.3 APIs do SDK

- [ ] **5.3.1** `src/api/worker-items.ts` — `find`, `findById`, `stats`
- [ ] **5.3.2** `src/api/intakes.ts` — `find`, `findById`, `stats`
- [ ] **5.3.3** `src/api/actions.ts` — `find`, `findById`, `stats`
- [ ] **5.3.4** `src/api/stats.ts` — `overview`, `byEntity`, `period`
- [ ] **5.3.5** `src/api/users.ts` — `current`, `find`, `findById`
- [ ] **5.3.6** `src/api/entities.ts` — `find`, `findById`
- [ ] **5.3.7** `src/api/storage.ts` — `set`, `get`, `remove` (localStorage com namespace por widgetId)
- [ ] **5.3.8** `src/api/notifications.ts` — `success`, `error`, `warning`, `info` (integra com sistema de toast da plataforma via postMessage ou callback)
- [ ] **5.3.9** `src/api/ui.ts` — `modal`, `drawer`, `confirm`, `typography`, `button` (wrappers de componentes da plataforma via postMessage)

---

### 5.4 Types & DTOs

- [ ] **5.4.1** `src/types/worker-item.ts`
- [ ] **5.4.2** `src/types/intake.ts`
- [ ] **5.4.3** `src/types/action.ts`
- [ ] **5.4.4** `src/types/stats.ts`
- [ ] **5.4.5** `src/types/user.ts`
- [ ] **5.4.6** `src/types/entity.ts`
- [ ] **5.4.7** `src/types/pagination.ts` — interface `PaginatedResponse<T>`
- [ ] **5.4.8** `src/types/index.ts` — barrel export

---

### 5.5 React Hooks

- [ ] **5.5.1** `src/hooks/useWorkerItems.ts`
- [ ] **5.5.2** `src/hooks/useWorkerItem.ts`
- [ ] **5.5.3** `src/hooks/useIntakes.ts`
- [ ] **5.5.4** `src/hooks/useIntake.ts`
- [ ] **5.5.5** `src/hooks/useActions.ts`
- [ ] **5.5.6** `src/hooks/useAction.ts`
- [ ] **5.5.7** `src/hooks/useStats.ts`
- [ ] **5.5.8** `src/hooks/useEntities.ts`
- [ ] **5.5.9** `src/hooks/useEntity.ts`
- [ ] **5.5.10** `src/hooks/useUsers.ts`
- [ ] **5.5.11** `src/hooks/useCurrentUser.ts`

---

### 5.6 Publicação

- [ ] **5.6.1** Configurar `.npmrc` para GitLab Package Registry
- [ ] **5.6.2** Adicionar script `publish` no `package.json`
- [ ] **5.6.3** Criar `WIDGET_SDK_USAGE.md` com instruções de instalação e uso básico

---

## Fase 6 — Segurança

- [ ] **6.1** Lista branca de permissões válidas no backend (arquivo `widget-permissions.ts`)
- [ ] **6.2** Sanitização do manifest antes de persistir no banco
- [ ] **6.3** Rate limiting no endpoint de upload (env `WIDGET_UPLOAD_RATE_LIMIT`)
- [ ] **6.4** Auditoria de uploads: registrar em `AuditLog` (tabela existente) quem fez upload, ativação, desativação
- [ ] **6.5** Headers de segurança nos assets servidos: `Content-Security-Policy`, `X-Content-Type-Options`
- [ ] **6.6** Validação de MIME type do arquivo entry (deve ser `application/javascript`)

---

## Fase 7 — Testes

- [ ] **7.1** Testes unitários para `widget-zip.ts` (extração, validação de estrutura)
- [ ] **7.2** Testes unitários para `widget-manifest.ts` (campos obrigatórios, semver, permissões)
- [ ] **7.3** Testes de integração para endpoints CRUD do módulo Widget
- [ ] **7.4** Testes de integração para endpoints do gateway SDK
- [ ] **7.5** Testes unitários dos hooks do SDK (`useWorkerItems`, `useStats`, etc.)
- [ ] **7.6** Teste E2E: upload de widget ZIP → ativação → carregamento dinâmico no frontend

---

## Fase 8 — Documentação e Exemplos

- [ ] **8.1** Criar `docs/widget-development.md` — guia completo para desenvolvedores de widgets
  - Estrutura do projeto, configuração Vite (library mode), manifest, empacotamento, upload
- [ ] **8.2** Criar `examples/widgets/worker-items-dashboard/` — widget de exemplo
  - Lista de worker items com filtros, usando `useWorkerItems` hook
  - `src/index.tsx`, `manifest.json`, `vite.config.ts`, `package.json`
- [ ] **8.3** Criar `examples/widgets/stats-overview/` — widget de exemplo
  - Cards com estatísticas gerais usando `useStats`
- [ ] **8.4** Documentar todos os campos do manifest com exemplos
- [ ] **8.5** Documentar todas as APIs do SDK com exemplos de código
- [ ] **8.6** Documentar processo de publicação no GitLab Package Registry

---

## Critérios de Aceite

| Critério | Status |
|---|---|
| Upload funcional (ZIP → banco + storage) | [ ] |
| Registro persistido com metadados corretos | [ ] |
| Assets servidos corretamente via `/widgets/:id/assets/*` | [ ] |
| Loader dinâmico funcionando (`DynamicWidget`) | [ ] |
| `window.WidgetSDK` disponível e funcional | [ ] |
| Gateway `/api/widget-sdk/*` operando | [ ] |
| OpenAPI gerado em `/api/widget-sdk/docs` | [ ] |
| Hooks React gerados e tipados | [ ] |
| Tipagens TypeScript completas | [ ] |
| Documentação para desenvolvedores criada | [ ] |
| Exemplo de widget funcional criado | [ ] |
| Testes automatizados implementados | [ ] |
