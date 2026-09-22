# Painéis de TV (W18)

Data: 2026-09-23 · Worker W18. Telas de PAREDE, em tela cheia, que abrem **sem
login** com uma chave de API por TV — ou com a sessão de quem já está logado.
Substituem o antigo `/:workspaceSlug/painel/:setor`, que exigia login e só tinha
TI e Qualidade.

Legado de referência: `siteintranet/intranet/painel/` (painel do TI e da
Qualidade), `siteintranet/intranet/chatger/` (abas do atendimento) e
`siteintranet/backup/relatorio_backup.php` (backups).

## 1. As cinco telas

| URL | O que mostra |
| --- | --- |
| `/:slug/painel/ti` | Pendente, Atribuído, Em desenvolvimento, Concluído e Enviado |
| `/:slug/painel/qualidade` | Verificar, Analisar, Homologar e Homologado, com percentual |
| `/:slug/painel/atendimento` | As 6 abas do chat, trocando sozinhas, e a lateral de atendentes |
| `/:slug/painel/mapa` | Mato Grosso do Sul com os chamados abertos de cada entidade |
| `/:slug/painel/backups` | Entidades sem backup e os envios do período |

Parâmetros da URL (a TV só sabe abrir endereço): `?key=` a chave do painel,
`?intervalo=` os segundos da rotação das abas do atendimento (padrão 15),
`?som=1` para deixar o botão do alerta sonoro piscando (o navegador ainda exige
um clique), `?uf=` e `?dias=` no painel de backups.

Todas ficam em `/:slug/painel/:painel`, FORA do layout do espaço
(`apps/web/app/(all)/painel/[workspaceSlug]/[painel]/page.tsx`): a página não
usa nenhum store que dependa de login.

## 2. Mapa dos arquivos

```
apps/api-ts/src/modules/painel-tv/
  chaves/       chave.ts (puro: gerar, hash, escopo, ler da requisição)
                chave.errors.ts · chave.dao.ts · chave.service.ts
  quadro/       colunas.ts (mapeamento das colunas, puro) · quadro.dao.ts · quadro.service.ts
  mapa/         mapa.ts (puro) · mapa.dao.ts · mapa.service.ts · dados.ts
                dados/municipios-ms.json · dados/entidades-legado.json
  backups/      fonte.ts (contrato + fonte vazia) · legado.ts (regras do legado, puro)
                atrasados.ts · painel-de-backups.ts (puro) · mysql.fonte.ts · backups.service.ts
  servidores/   status.ts (contrato + regra pura) · status.gateway.ts
  atendimento/  atendimento.service.ts (atravessa para o chat)
  rotas-da-tv.ts        /api/v1/tv/:slug/... (chave OU sessão)
  rotas-de-gestao.ts    /workspaces/:slug/tv-panels/... (panel.manage)

apps/chat-backend/src/painel/
  painel-regras.ts (abas e tempos, puro) · painel.service.ts · rotas.ts (rota interna)

apps/web/core/components/painel-tv/
  painel-helpers.ts (puro) · cores.ts · use-painel-tv.ts · moldura.tsx
  painel-da-tv.tsx (escolhe o painel por mapa, sem `if`)
  quadro/quadro-tv.tsx · atendimento/atendimento-tv.tsx
  mapa/mapa-tv.tsx · mapa/mapa-svg.tsx · mapa/dados/ms-municipios.geo.json
  backups/backups-tv.tsx · gestao/{chaves-de-painel,colunas-do-painel}.tsx
apps/web/core/services/painel-tv.service.ts · core/hooks/use-paineis-de-tv.ts
```

## 3. Chave de painel

- Modelo `PainelChave` (`panel_keys`, migração `20260923110000_paineis_de_tv`):
  nome, escopo, ativa, último uso, quem criou e quem revogou. **Só o hash
  SHA-256 e os quatro últimos caracteres são gravados**; o valor aparece uma vez,
  na criação, e nem a tela de gestão o lê depois.
- Prefixo `ptv_` + 32 bytes em base64url.
- Escopo: `ti`, `qualidade`, `atendimento`, `mapa`, `backups` ou **`todos`** (a
  chave geral, que é o padrão da tela e abre inclusive painéis futuros).
- Viaja no cabeçalho `X-Panel-Key`; a página também aceita `?key=` na URL,
  porque é assim que a TV abre, e o front passa a mandá-la no cabeçalho.
- Limite de 120 consultas por minuto POR IP e POR CHAVE (`checkRateLimit`).
- Criar e revogar entram na trilha da LGPD (`audit_logs`, entidade `panel_key`).
- Ação nova na matriz: **`panel.manage`** (padrão: só admin). Nada de checagem
  por número de papel.

**Duas portas de entrada** nas rotas de dados, nesta ordem:

1. chave de painel — abre sem login nenhum, dentro do escopo gravado;
2. sessão do Plane — **qualquer membro ativo do espaço** abre sem chave, seja
   qual for o papel.

Sem chave e sem sessão é 401; sessão de quem não é do espaço é 403; chave fora
do escopo é 403. `resolveUsuarioOpcional` (`middleware/auth.ts`) foi extraído do
`authPlugin` justamente para isso: ele resolve a credencial sem recusar.

A porta da sessão pedia `report.view` até W22. O dono do produto trocou: o
painel é a TV da sala, o que ele mostra já está nas telas de chamado que todo
mundo abre, e exigir a ação de relatório deixava metade da equipe de fora de uma
tela que fica ligada na parede. Quem decide agora é `requireWorkspaceMember`. A
GESTÃO das chaves não mudou: continua em `panel.manage`.

## 4. Rotas

Dados (só leitura, `/api/v1/tv/:slug/...`, montadas ANTES do `apiApp` para não
herdarem o `authPlugin` global):

| Rota | O quê |
| --- | --- |
| `GET /me/` | nome do espaço e por onde entrou (chave ou sessão) |
| `GET /quadro/:painel/` | `ti` ou `qualidade`; aceita `project_ids`, `entity_id` |
| `GET /atendimento/` | atravessa para o chat (ver §7) |
| `GET /mapa/` | pontos, laterais e backups atrasados |
| `GET /backups/` | `uf`, `dias` (1 a 30) |
| `GET /stream/` | fluxo de eventos (SSE) de chamado e solicitação |

Gestão (`/workspaces/:slug/tv-panels/...`, `panel.manage`): `GET/POST keys/`,
`POST keys/:id/revoke/`, `GET/PUT/DELETE columns/:painel/`.

O SSE é lido por `fetch` (e não por `EventSource`) para a chave viajar no
CABEÇALHO: no `EventSource` ela teria de ir na URL, e URL entra em log de proxy
e em histórico. O nginx (`apps/proxy-ts/nginx.conf`) ganhou uma `location`
própria para `/api/tv/<slug>/stream/`, sem buffer e com leitura longa.

## 5. Colunas do TI e da Qualidade

A coluna é DADO: `{chave, rotulo, cor, etapas[], responsavel?, concluidoEmDias?,
noTotal?}`. Cada chamado entra em UMA coluna, a primeira que o quer — assim o
total do painel é a soma das colunas, como o "(11/134)" do legado.

Padrão (`quadro/colunas.ts`):

| Painel | Colunas |
| --- | --- |
| TI | Pendente (Pendências/A Fazer SEM responsável), Atribuído (as mesmas COM responsável), Em desenvolvimento, Concluído (Em Teste), Enviado (Concluído nos últimos 30 dias, fora do total) |
| Qualidade | Verificar (Triagem), Analisar (Em Análise), Homologar (Em Teste), Homologado (Concluído nos últimos 7 dias, fora do total) |

O espaço pode trocar o mapeamento em _Configurações > Painéis de TV_ (tabela
`panel_settings`). Configuração inválida NÃO derruba o painel: vale o padrão.

Cartão: ícone do sistema (o `icon_prop` do projeto), o NÚMERO ANUAL (N-AAAA) bem
grande, título em duas linhas, sistema, entidade e responsáveis. Urgente =
"cliente parado" do SAC: borda vermelha, pulso e a palavra escrita. Coluna longa
rola sozinha, desce, espera e volta.

## 6. Cores

Paleta categórica validada da referência de visualização de dados (tons do tema
escuro), conferida para daltonismo contra o fundo do painel; os valores estão em
`core/components/painel-tv/cores.ts`. As cores de SITUAÇÃO (bom, atenção, sério,
crítico) são reservadas e nunca viram cor de coluna. **Cor nunca informa
sozinha**: coluna tem rótulo, marcador tem número, situação tem texto.

## 7. Painel do atendimento

Os dados são do chat. O api-ts atravessa o pedido para
`GET /internal/painel/:slug/atendimento/` no chat-backend, autenticado pelo
segredo de serviço que os dois já compartilham (`CHAT_SERVICE_TOKEN`) — a regra
da chave de painel fica em UM lugar só, e a TV conversa com uma origem só.

Abas (de `painel-regras.ts`), com o tempo que cada uma mostra:

| Aba | Nossa situação | Tempo |
| --- | --- | --- |
| Em Atendimento | `active` com o atendente já tendo escrito | parado desde a última mensagem |
| Pausa | `paused` | desde a pausa |
| Não Iniciado | `active` e o atendente ainda não escreveu | desde a abertura |
| Espera | `bot` ou `queued` | desde a abertura |
| Inativo | encerrada hoje por `inatividade`, `pausa_vencida` ou `abandono` | duração |
| Fechou Chat | as demais encerradas hoje (`cliente_saiu`, `atendente`, `cliente`, `robo`, `fim_do_dia`) | duração |

Ligação (`channel = "phone"`) fica de fora: do outro lado não há ninguém
digitando. A lateral lista quem tem `chat.atender` no espaço, com a situação
(online = conectado e visível; invisível = conectado e escondido pelo
administrador; offline), quantas conversas tem na mão e em quantas o cliente
está esperando resposta.

## 8. Painel do mapa

- Cada marcador é uma CIDADE com entidades clientes; o número em cima é a soma
  dos chamados abertos das entidades dali. Cor por faixa de volume; anel
  pulsante quando há urgente; anel/preenchimento vermelho quando algum servidor
  da cidade está offline; "B" quando há backup atrasado.
- Onde a entidade cai: 1) coordenada gravada da entidade legada
  (`dados/entidades-legado.json`); 2) o município de MS cujo nome casa com a
  cidade dela (`dados/municipios-ms.json`, IBGE, com acento e caixa
  normalizados). Sem nenhum dos dois, vai para a lista "Sem localização".
- O desenho é SVG com `d3-geo` sobre o GeoJSON dos municípios no REPOSITÓRIO
  (`apps/web/core/components/painel-tv/mapa/dados/ms-municipios.geo.json`): a TV
  pode estar numa rede sem saída para a internet, e um mapa de tiles ficaria
  cinza justamente ali.
  - Origem: `servicodados.ibge.gov.br/api/v3/malhas/estados/50` (qualidade
    intermediária, por município), coordenadas arredondadas em 3 casas.
  - **Os anéis foram invertidos de propósito.** O GeoJSON do IBGE vem com o anel
    externo no sentido horário; o `d3-geo` é ESFÉRICO e lê anel horário como "o
    mundo inteiro menos isto" — com os anéis originais o mapa virava um
    retângulo cinza cobrindo a tela e todos os marcadores caíam no mesmo ponto.
    Ao regerar o arquivo, inverta cada anel (`ring[::-1]`) e confira que
    `geoPath(geoMercator()).bounds(malha)` NÃO devolve algo do tamanho do mundo.

## 9. Painel de backups

Formato do relatório legado: "Entidades sem backup há mais de N dias" (código,
nome, cidade/UF, último backup, dias de atraso) e "Backups enviados" (uma linha
por entidade, e dentro dela cada backup com sistema, data, tamanho e os quatro
sinalizadores: Banco, FTP, Erro Backup e Erro Restore — verde quando está bom,
vermelho quando não, sempre com a palavra ao lado).

Só os sistemas 1 (Contabilidade), 3 (ARH), 4 (SIART) e 8 (Integração); o grupo
do banco de integração (8, 9, 10, 11, 12, 13, 15, 18, 21, 22 e 23) conta como 8.

**Data de expiração**: o relatório legado a lê do Firebird do SAC
(`SAC_ENTIDADE_LIBERACAO`), que não temos aqui. O campo existe no contrato
(`expira_em`) e chega `null`; a tela só o mostra quando houver fonte.

## 10. Fontes externas (todas injetáveis, todas com provedor vazio)

| Fonte | Variáveis | Sem configuração |
| --- | --- | --- |
| Backups (`backup.envio_autom` no MySQL legado) | `LEGACY_BACKUP_DB_URL`, `LEGACY_INTRANET_DB` (padrão `quality_site_dev`), `LEGACY_BACKUP_TZ` (padrão `-04:00`) | "Sem dados de backup" |
| Status dos servidores (gateway dos bservers) | `GATEWAY_ADMIN_TOKEN`, `GATEWAY_ADMIN_URL` (padrão o gateway de PRODUÇÃO) | nenhum marcador recebe cor de status |

Armadilhas que essas fontes guardam:

- `envio_autom.id_entidade` é o código da entidade no **SAC desktop**
  (`entidades.entidades_sac_desktop_id`), que NÃO é o id legado que o Plane
  guarda (`entities.legacy_id` = `entidades.entidades_id`) — dos 283 cadastros
  do legado, 242 têm os dois valores diferentes. A tradução sai da base da
  intranet.
- O DATETIME do legado vem sem fuso; ele grava em `-04:00`, e a leitura tem de
  dizer isso em vez de deixar o driver decidir.
- `tamanho_banco > 100`: o relatório legado descarta envios menores (banco vazio
  ou arquivo quebrado) — eles não contam como backup feito.
- O MySQL legado **não aceita TLS** (`ssl` desligado de propósito).
- **O gateway é sempre o de PRODUÇÃO**, inclusive em homologação: os bservers de
  verdade só se conectam a ele, e apontar a homologação para o
  `gwsocketlocal` deixaria o mapa inteiro sem status de servidor.
- **O token do gateway nunca vai para o navegador.** Quem fala com o gateway é o
  api-ts, com a credencial dele, e o painel recebe o resultado já digerido pela
  rota que a chave autentica. A consulta é HTTP (`GET /admin/clients.list` com
  `x-admin-token`), guardada em memória por 20 s.
- Entidade que o gateway não conhece fica SEM informação, nunca "offline":
  marcador vermelho é acusação, e acusar por falta de dado é pior que calar.

## 11. Dados estáticos e como regerá-los

- `apps/api-ts/src/modules/painel-tv/mapa/dados/entidades-legado.json`: por
  entidade migrada, o código dela no SAC desktop e a coordenada do endereço
  (origem: `servermonitor.psm_adresses`, um POINT do MySQL). Gerado por
  `bun run scripts/gerar-coordenadas-das-entidades.ts` com
  `LEGACY_MONITOR_DB_URL` e `LEGACY_INTRANET_DB`. São dados de LOCALIZAÇÃO e de
  CADASTRO: cidade não muda de lugar, então a cópia versionada serve e o painel
  não depende do MySQL legado para desenhar.
- `municipios-ms.json`: os 79 municípios de MS (IBGE) com a coordenada da sede.

## 12. Tempo real

O mesmo barramento SSE do produto (`utils/realtime.ts`), filtrado para chamado e
solicitação. A TV também recarrega a cada 60 s como rede de segurança (proxy que
corta o stream, rede que cai), e o cabeçalho mostra "Ao vivo" e há quanto tempo
os dados chegaram. O fluxo reconecta sozinho a cada 5 s quando cai: a tela fica
ligada o dia inteiro e ninguém a recarrega.

## 13. Decisões

- **O painel antigo saiu.** `/:slug/painel/:setor` (com login) e o relatório
  `tv-panel/` foram removidos; o mapeamento das colunas, que lá era fixo em
  código, virou configuração do espaço.
- Os atalhos ficam na tela de **Relatórios**, um cartão por painel, abrindo em
  aba nova, com "Copiar link" e o atalho para as chaves. O link COM a chave sai
  na tela de Configurações, na criação — depois nem o servidor sabe a chave.
- Chave inválida devolve sempre a mesma recusa ("inválida ou revogada"): dizer
  "existe, mas está revogada" ajuda quem está adivinhando.
- Cartões por coluna limitados a 60 na resposta; a CONTAGEM do cabeçalho é a
  real. Painel nenhum desenha 500 cartões, mas o número tem de estar certo.
- Contagem do mapa por `groupBy`, nunca `_count` de relação (a armadilha do
  dashboard de 56 s registrada no estilo do time).
- **O painel abre para toda a equipe** (W22): ver o painel deixou de exigir
  `report.view`, basta ser membro ativo do espaço. Criar e revogar chave
  continua em `panel.manage`.

## 14. Testes

- api-ts, puros: `painel-chave`, `painel-chave-service` (DAO e auditoria
  mockados), `painel-quadro`, `painel-mapa`, `painel-backups`,
  `painel-de-backups`, `painel-servidores` (gateway com `fetch` injetado).
- api-ts, contrato: `tests/contract/paineis-de-tv.test.ts` (18) — gestão das
  chaves, as duas portas de entrada (inclusive membro comum SEM `report.view` e
  logado de fora do espaço), escopo, revogação, colunas e cada rota de dados.
- chat-backend: `tests/painel-regras.test.ts` (puro) e `tests/painel.db.test.ts`
  (abas contra o banco e o segredo da rota interna).
- web: `core/components/painel-tv/painel-helpers.test.ts`.

## 15. Dados de demonstração

`apps/api-ts/scripts/dados-demo-w18.ts` (sistemas com ícone, entidades em
cidades de MS e chamados em todas as etapas) e
`apps/chat-backend/scripts/dados-demo-w18.ts` (conversas nas seis situações).
Servem para conferir os painéis no navegador; não tocam em dado real.

## 16. Pendências

1. **Data de expiração das entidades** no painel de backups (fonte no Firebird
   do SAC, ver §9).
2. `GATEWAY_ADMIN_TOKEN` ainda não foi configurado em nenhum ambiente: o status
   de servidor no mapa fica sem cor até alguém preenchê-lo. O provedor, a regra
   e os testes já estão prontos.
3. O painel de backups lê a janela de 1 a 30 dias; a base de desenvolvimento
   parou em 2022, então em homologação tudo aparece como atrasado e "Backups
   enviados" fica vazio. É esperado.
4. Contagem de chamados do mapa considera a entidade do chamado; chamado sem
   entidade não aparece em ponto nenhum (aparece nos painéis de etapa).
