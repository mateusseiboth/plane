# Chat: disparo em massa (W07)

Data: 2026-09-22 · Worker W07. Substitui o "disparo de mensagens" da intranet
(`siteintranet/intranet/sac_chatDisparo*.php`, `sac_chatlistazapi.php`,
`zapi/ConectaZAPI.php`: `enviarMensagem`, `enviarArquivo`, `enviarStatus`, `BuscarFila`).
Decisão do dono do produto: o disparo vive dentro do chat e só para quem tem permissão.

## 1. Mapa

```
apps/api-ts/src/utils/permissions.ts   CHAT_DISPARO: chat.disparo (Gestor e admin)
apps/api-ts/src/utils/audit.ts         AUDIT_ACTIONS.SEND, AUDIT_ENTITIES.CHAT_DISPARO

apps/chat-backend/
  src/permissoes.ts          CHAT_ACTION.DISPARO (espelho; teste compara com o catálogo)
  src/audit.ts               CHAT_AUDIT_ENTITIES.DISPARO, CHAT_AUDIT_ACTIONS.SEND
  src/providers/provider.ts  MidiaDeSaida (caption), sendImageStatus, getFilaDeSaida
  src/providers/zapi.ts      send-image-status, GET queue, caption em imagem/vídeo/documento
  src/disparo/
    regras.ts     puro: normalizeTelefoneDisparo, buildDestinatarios, ritmo, readFiltros,
                  readMensagem, readArquivo, summarizeItens
    erros.ts      DisparoError e subclasses (status HTTP), requireValid
    permissao.ts  requireDisparo (chat.disparo pela matriz)
    dao.ts        só dados (tabelas chat_disparo_* e SQL em entity_contacts/entities)
    service.ts    cadastro, prévia, envio, histórico, Status, fila, ritmo, auditoria
    worker.ts     processWorkspace, runDisparoTick, recoverItensInterrompidos, startDisparoWorker
    routes.ts     rotas finas
  prisma/sql/0016_disparo.sql

apps/web/
  app/(all)/[workspaceSlug]/(projects)/chat/disparo/page.tsx   rota /:workspaceSlug/chat/disparo
  core/services/disparo.service.ts                               disparoApi (chat-backend)
  core/components/chat/disparo/
    disparo-helpers.ts (+ .test.ts)   rótulos, filtros, FormData, progresso
    use-disparo.ts                    hooks SWR
    disparo-app.tsx                   abas Mensagens, Enviar, Histórico, Fila Z-API, Configuração
    aba-*.tsx, estilos.ts
    botao-do-disparo.tsx              atalho no cabeçalho do atendimento (só com chat.disparo)
```

## 2. Tabelas (0016)

| Tabela                   | O quê                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `chat_disparo_mensagens` | título, texto, arquivo (`media_key/mime/name`), exclusão lógica (`deleted_at`)             |
| `chat_disparo_execucoes` | cada envio: CÓPIA do título/texto/arquivo, `filtros` (jsonb), `total`, `without_telefone`, `repetidos`, `status` (`em_andamento`, `concluida`, `cancelada`), quem e quando |
| `chat_disparo_itens`     | um por telefone (único por execução): `status` (`pendente`, `processando`, `enviado`, `falhou`, `cancelado`), `erro`, `external_id`, `tentado_em` |
| `chat_disparo_config`    | `mensagens_por_minuto` do espaço (1 a 60, padrão 20)                                       |

A execução copia a mensagem: editar ou excluir a mensagem depois não muda o que já saiu nem o log.

## 3. Regras

**Destinatários** (mesmo corte do SAC: `ativo = 1 AND enviar_mensagem = 1`, JOIN na entidade):
`entity_contacts` ativos (`is_active`, sem `deleted_at`) com `receive_messages`, de entidade
ativa (`entities.is_active`, sem `deleted_at`) do espaço. Filtros opcionais: tipo de entidade
(`entities.entity_type`, 0 a 7 do SAC), entidade e sistema (`entity_contact_projects`). Sem
filtro nenhum vai para todos, como no legado; a tela mostra a prévia e pede confirmação.

**Telefone**: `phone_digits` ou, vazio, `phone`. Normalização em `normalizeTelefoneDisparo`:
DDI 55 (via `telefoneWithDdi` de `responsaveis.ts`), nono dígito acrescentado no celular de 8
dígitos (começa em 6 a 9); fixo (2 a 5) fica como está. O que não é telefone brasileiro fica de
fora e é contado em `without_telefone`. O mesmo número (com e sem 9) sai UMA vez; o primeiro
cadastro fica com ele e os demais contam em `repetidos`.

**Fila e ritmo**: o envio só cria os itens. O worker (`startDisparoWorker`, chamado no boot do
`index.ts`) passa a cada 1 s e manda no máximo UM item por espaço quando a última tentativa do
espaço (`max(tentado_em)`) está a `60 / mensagens_por_minuto` segundos. O item é pego com
`UPDATE ... FOR UPDATE SKIP LOCKED` (vira `processando` e grava `tentado_em` numa instrução só).
Sem provedor ativo a fila espera (itens seguem `pendente`); o envio já recusa com 422 se o
WhatsApp não estiver configurado. Execução sem item pendente ou em envio vira `concluida`.

**Queda**: na subida, antes da primeira passada, todo item `processando` vira `falhou` com
"Envio interrompido por reinício do serviço. Não reenviado para evitar duplicidade." Não dá
para saber se a Z-API recebeu; é melhor faltar (e aparecer no log) do que chegar duas vezes.
O que estava `pendente` continua de onde parou.

**Mesma mensagem duas vezes**: enquanto uma execução dela está `em_andamento`, outra é recusada
(409). Terminada ou cancelada, pode sair de novo.

**Cancelar**: itens `pendente` viram `cancelado`; o que já saiu fica.

**Arquivo**: imagem (JPG, PNG, GIF, WEBP) ou PDF, até 10 MB, guardado em `disparo/<slug>/<uuid>`
pelo `storage.ts`. Com arquivo, o texto vai como legenda (`caption`, como no legado); sem arquivo,
texto é obrigatório. Com `CHAT_PUBLIC_URL`, a Z-API recebe a URL pública (`/media/<key>`); sem
ela, o conteúdo em base64 (`data:<mime>;base64,...`), porque o `outbound.ts` mandaria endereço
vazio.

**Status do WhatsApp**: só mensagem com imagem (`send-image-status`, sem legenda, como no legado).

**Fila da Z-API**: `GET queue`, lida de forma tolerante (`Created` em ms, `Phone`, `Message`,
`ZaapId`). Diagnóstico: fila parada costuma ser o celular da conta desconectado.

**Auditoria** (`audit_logs`, tela Auditoria: "Enviou" / "Disparo de mensagens"):
- envio: `entity = chat_disparo`, `entity_id = <execução>`, `action = send`,
  `metadata = { mensagem_id, titulo, total, filtros }`;
- Status: mesma entidade, `entity_id = <mensagem>`, `metadata.destino = "status"`;
- cancelamento: `action = update`, `metadata.cancelado = true`.

## 4. Permissão

`chat.disparo` (grupo Chat, escopo workspace, padrão Gestor e admin; demais por concessão na tela
de Funções). Checagem no servidor em TODA rota (`requireDisparo`). A tela e o botão do cabeçalho
usam `useMyWorkspaceActions(slug).can("chat.disparo")` só para decidir o que mostrar.

## 5. Testes

- chat-backend: `tests/disparo-regras.test.ts` (puro), `tests/disparo-zapi.test.ts` (Z-API
  falsa local), `tests/disparo.db.test.ts` (rotas no processo + worker com relógio por argumento,
  contra o banco, Z-API falsa), `tests/permissoes-do-chat.test.ts`.
- api-ts: `tests/unit/catalogo-de-acoes.test.ts`, `tests/unit/audit.test.ts`.
- web: `core/components/chat/disparo/disparo-helpers.test.ts` (`bun test core/components/chat/disparo`).

Nenhum teste fala com a Z-API real.

## 6. Decisões conservadoras

- Entidade inativa ou excluída não recebe; entidade congelada recebe (congelar não desliga o
  contato). Responsável sem entidade não recebe (o SAC fazia JOIN).
- Provedor desligado: a fila espera em vez de marcar tudo como falha.
- Item interrompido na queda vira falha, sem reenvio.
- Uma execução por mensagem por vez.
- Ritmo por espaço (não por instância da Z-API): cada espaço tem a sua conta.
- Worker de processo único. Com mais de uma instância do chat, o `SKIP LOCKED` evita pegar o
  mesmo item, mas a recuperação da subida marcaria como falha o que outra instância estivesse
  enviando. Hoje o chat roda em uma instância.

## 7. Pendências

- Agendar o envio para data e hora (o legado não tinha).
- Reenviar só os que falharam (hoje: enviar de novo manda para todos os filtrados).
- Excluir o arquivo do storage quando a mensagem é excluída ou trocada (hoje fica, e o log das
  execuções antigas aponta para ele).
- O legado mostrava a data do disparo e a quantidade na lista; aqui é o último envio.
