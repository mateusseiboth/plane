# URLs do ambiente

Homologação: `https://plane.qualitysistemas.inf.br` (mesma coisa em `http://10.1.2.12`).
Espaço de trabalho: `quality`. Onde aparece `<slug>`, use `quality`.

Este arquivo é escrito à mão: ao criar tela nova, acrescente a linha aqui.

## Sem login (cliente, candidato, TV)

| O que é | URL | Como entra |
|---|---|---|
| Portal do cliente | `/portal?workspace=<slug>` | conta do portal (e-mail e senha), com "esqueci a senha" |
| Chat do cliente (widget embutível) | `/chat-api/client?system=<sistema>&name=<nome>` | nenhum; aceita metadados do computador do cliente por query |
| WebSocket do chat | `/chat-ws` | usado pelo widget e pela tela do atendente |
| Transcrição de um atendimento | `/<slug>/chat-view/<protocolo>` | link compartilhado pela equipe |
| Cadastro de currículo pelo site | `/trabalhe-conosco?workspace=<slug>` | nenhum (ligado/desligado na tela de Currículos) |
| Painel de TV: TI | `/<slug>/painel/ti?key=<chave>` | chave de painel |
| Painel de TV: Qualidade | `/<slug>/painel/qualidade?key=<chave>` | chave de painel |
| Painel de TV: Atendimento | `/<slug>/painel/atendimento?key=<chave>` | chave de painel; abas trocam sozinhas |
| Painel de TV: Mapa | `/<slug>/painel/mapa?key=<chave>` | chave de painel |

As chaves de painel são criadas em *Configurações → Painéis de TV*, e cada uma vale só
para os painéis escolhidos. A chave aparece uma vez na criação.

## Dentro do Plane (com login)

| Tela | URL |
|---|---|
| Página inicial (mural fica no topo) | `/<slug>/` |
| Chamados do espaço | `/<slug>/workspace-views/all-issues` |
| Solicitações globais (triagem) | `/<slug>/global-intake` |
| Visitas técnicas | `/<slug>/visits` |
| Atendimento (chat) | `/<slug>/chat` |
| Disparo em massa | `/<slug>/chat/disparo` |
| Contatos (responsáveis) | `/<slug>/contatos` |
| Lista de e-mails para disparo | `/<slug>/contatos/emails` |
| Mural | `/<slug>/mural` |
| Wiki | `/<slug>/wiki` |
| Ouvidoria | `/<slug>/ouvidoria` |
| Denúncia | `/<slug>/denuncias` |
| Currículos | `/<slug>/curriculos` |
| Pós-atendimento | `/<slug>/pos-atendimento` |
| Satisfação (relatório do pós) | `/<slug>/pos-atendimento/satisfacao` |
| Relatórios | `/<slug>/reports` |
| Plugins instalados | `/<slug>/plugins/<slug-do-plugin>` |

### Configurações do espaço

`/<slug>/settings/...`: `members`, `roles` (funções e permissões), `email` (SMTP),
`chat`, `portal` (contas do cliente), `storage`, `auditoria`, `sla`, `plugins`,
`ia-requisitos`, `print`.

## Administração e serviços

| O que é | URL |
|---|---|
| God mode (admin da instância) | `/god-mode/` |
| API | `/api/v1/...` (health: `/api/v1/health/`) |
| Autenticação | `/auth/...` |
| Chat (API) | `/chat-api/` (health: `/chat-api/health/`) |
| Edição colaborativa | `/live/` (health: `/live/health/`; WebSocket em `/live/collaboration`) |
| Tempo real (SSE) | `/api/v1/workspaces/<slug>/realtime/stream/` |

## Integrações que recebem chamada de fora

| Quem chama | URL | Autenticação |
|---|---|---|
| Z-API (WhatsApp) | `/chat-api/providers/zapi/webhook/<slug>/` | token do provedor, quando configurado |
| FreePBX (ligações) | `/chat-api/workspaces/<slug>/telefonia/ligacoes/` | token de serviço (`X-Api-Token`) |
| Robô do chat → API | `/api/internal/chat/workspaces/<slug>/...` | `X-Service-Token` (`CHAT_SERVICE_TOKEN`) |
| Backend de plugin | `/api/v1/plugin-sdk/backend/*` | sessão do usuário + assinatura da ponte |

## Observações

- **Loja de plugins** (`/<slug>/plugins`): vitrine de exemplo, com catálogo fixo no código.
  Instalar de verdade é em *Configurações → Plugins*, enviando o `.zip` do plugin.
- **Telefones** (`/<slug>/telefones`): em remoção, porque Contatos já cobre.
