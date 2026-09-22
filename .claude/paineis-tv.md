# Painéis de TV (W18, revisto em W22)

Data: 2026-09-23 · Worker W18; revisto em 2026-09-22 pelo W22 (mapa com Leaflet,
§8, e painel aberto a qualquer membro do espaço, §3).

Telas de PAREDE, em tela cheia, que abrem **sem login** com uma chave de API por
TV — ou com a sessão de quem já está logado.
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
um clique), `?uf=` e `?dias=` no painel de backups, e os filtros do painel de
backups interativo (`?interativo=1`, `?entidade=`, `?sistema=`, `?situacao=`,
`?ordem=`, ver §9).

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
                atrasados.ts · painel-de-backups.ts (puro) · historico.ts (puro)
                mysql.fonte.ts · backups.dao.ts · backups.errors.ts · backups.service.ts
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
  mapa/mapa-tv.tsx · mapa/mapa-de-ms.tsx (Leaflet) · mapa/mapa-de-reserva.tsx (SVG)
  mapa/mapa-helpers.ts (puro) · mapa/mapa-do-painel.css · mapa/dados/ms-municipios.geo.json
  backups/backups-helpers.ts (puro: tipos, filtros, ordenação) · backups/backups-tv.tsx
  backups/filtros-de-backup.tsx · backups/historico-de-backups.tsx · backups/use-backups.ts
  gestao/{chaves-de-painel,colunas-do-painel}.tsx
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
| `GET /backups/historico/` | `entidade` (id no Plane, obrigatório), `sistema` (1, 3, 4 ou 8), `dias` (1 a 180, padrão 30) |
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

### O desenho (W22)

O mapa é **Leaflet** (`mapa/mapa-de-ms.tsx`), com camada base de TERRENO:

| Item | Escolha |
| --- | --- |
| Tiles | **Esri World Topo Map** (`server.arcgisonline.com/.../World_Topo_Map/MapServer/tile/{z}/{y}/{x}`) |
| Por quê | colorido, com rios, sombreamento de relevo e vegetação. Numa TV, de longe, é o que dá cara de mapa de verdade; um mapa de ruas fica branco e vazio no interior de MS |
| Tema escuro | `filter: brightness(.78) saturate(1.2)` no `.leaflet-tile-pane`, em vez de trocar por um tile escuro, que perderia o relevo |
| Atribuição | obrigatória, no canto, pelo controle do próprio Leaflet |

Por cima do tile, tudo tirado do MESMO GeoJSON que já estava no repositório
(`mapa/dados/ms-municipios.geo.json`):

1. **Máscara do que está fora** (`buildMascaraDeFora`): um anel do tamanho do
   mundo com cada município recortado como buraco. Funciona porque o Leaflet
   pinta com `fill-rule: evenodd` e municípios vizinhos só ENCOSTAM, nunca se
   sobrepõem. O estado salta, e o resto continua servindo de referência.
2. **Grade municipal** em traço de 0,5 px: textura, e ajuda a situar a cidade
   sem ler o nome.
3. **Contorno do estado** (`readContornoDoEstado`): aresta que aparece em UM
   município só é divisa com quem está de fora; aresta que aparece em dois é
   divisa interna. Sai um desenho de 1.984 segmentos que o Leaflet traça de uma
   vez. Só casa porque as coordenadas do arquivo estão arredondadas em 3 casas.

A viewport é presa a MS: `fitBounds` no contorno e `maxBounds` com 12% de folga,
sem arrastar, sem roda do mouse, sem teclado (a TV não tem quem devolva a tela
para o lugar).

**Marcadores** são `L.divIcon` com o número de chamados abertos dentro. As faixas
de cor continuam vindo de `painel-helpers.ts` (vazio/baixo/médio/alto), com anel
pulsante para urgente, vermelho para servidor offline e o selo "B" do backup
atrasado. Cidades vizinhas são afastadas por `spreadPontosProximos` antes de
desenhar: cada aglomerado vira uma roseta em volta do ponto do meio
(`DISTANCIA_MINIMA_EM_GRAUS = 0,22`, uns 24 km), porque Campo Grande e
Sidrolândia se encavalavam e um número sumia dentro do outro. O cadastro não
muda: só a posição de DESENHO.

**Sem internet o mapa cai para `MapaDeReserva`** (o desenho SVG com `d3-geo`, que
era o mapa inteiro até W21) — a TV pode estar numa rede sem saída, e um mapa de
tiles ficaria cinza justamente ali. Quem decide é `readFonteDoMapa`, puro:

- `navigator.onLine === false` → reserva, na hora;
- 3 `tileerror` antes do primeiro `tileload` → reserva;
- 8 s sem nenhum tile → reserva (rede que engole o pedido não dispara
  `tileerror`, e sem esse relógio a TV esperaria para sempre);
- tile que JÁ pintou segura o mapa: erro depois disso é buraco de cobertura no
  zoom, e apagar a tela por causa dele seria pior.

Sobre o GeoJSON, que os dois desenhos compartilham:

- Origem: `servicodados.ibge.gov.br/api/v3/malhas/estados/50` (qualidade
  intermediária, por município), coordenadas arredondadas em 3 casas.
- **Os anéis foram invertidos de propósito.** O GeoJSON do IBGE vem com o anel
  externo no sentido horário; o `d3-geo` é ESFÉRICO e lê anel horário como "o
  mundo inteiro menos isto" — com os anéis originais o mapa de reserva virava um
  retângulo cinza cobrindo a tela e todos os marcadores caíam no mesmo ponto. Ao
  regerar o arquivo, inverta cada anel (`ring[::-1]`) e confira que
  `geoPath(geoMercator()).bounds(malha)` NÃO devolve algo do tamanho do mundo.
  (O Leaflet é PLANAR e não liga para o sentido do anel; quem cobra é o d3.)

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

### 9.1 Modo interativo (W23)

O painel de backups tem DUAS vidas no mesmo componente. Na PAREDE (chave de
painel, sem ninguém por perto) nada é clicável e as listas rolam sozinhas, como
sempre foi. Com alguém USANDO ele (sessão do Plane, ou `?interativo=1` na URL)
aparece a barra de filtros, a rolagem automática desliga e cada linha vira
botão. A infra confere os envios pela tela; a TV continua a mesma.

**Filtros**, todos refletidos na URL para o painel ser mandado por link:

| Parâmetro | O quê |
| --- | --- |
| `entidade` | busca rápida por nome (sem acento, sem caixa) ou por código |
| `sistema` | 1 Contabilidade, 3 ARH, 4 SIART, 8 Integração |
| `situacao` | `em-dia`, `atrasado` (já enviou algum dia) ou `nunca` |
| `ordem` | `atraso` (padrão), `entidade` (A a Z) ou `problema` |
| `dias` | a janela do painel, de 1 a 30 |
| `interativo` | `1` liga a barra mesmo sem login |

As regras são PURAS (`backups-helpers.ts`, testadas em `backups-helpers.test.ts`)
e os contadores do alto são refeitos sobre a lista filtrada: número que conta o
que não está na tela é mentira. Quem está sem backup nenhum continua aparecendo
com o filtro de sistema ligado, porque falta o backup daquele sistema também.

**Detalhe por célula**: clicar numa entidade × sistema abre a gaveta lateral com
`GET /backups/historico/`. Colunas de `backup.envio_autom` que só ela usa:
`nome_arquivo`, `host` (o computador que mandou, "IP/porta" ou o nome da
máquina), `ip_externo` e `versao_backup`, além de `tamanho_banco`,
`datahora_envio` e os quatro sinalizadores.

Duas diferenças propositais entre a gaveta e o painel:

- **o envio QUEBRADO aparece**, marcado "Com problema". O painel descarta
  `tamanho_banco <= 100` porque não conta como backup feito; quem abriu a gaveta
  veio justamente ver o que deu errado;
- **só os quatro sistemas do painel**. O legado guarda envio de outros (Gecom,
  por exemplo); mostrá-los aqui faria a gaveta contar mais backups do que a
  grade que a abriu. Quando `sistema` não vem, valem os quatro.

**"Solicitar backup"**: a gaveta mostra o atalho para a página do plugin de
backup (`/:slug/plugins/:slug-do-plugin`) quando o espaço tem um plugin ATIVO
cujo slug contém "backup" e quem está olhando está logado. A lista de plugins é
lida por `fetch` cru (`findPluginDeBackup` em `painel-tv.service.ts`), nunca pelo
cliente axios do produto: ele manda quem toma 401 para a tela de entrar, e o
painel também roda sem sessão nenhuma. Não há disparo de solicitação daqui: o
plugin backup-manager vive em repositório separado e a ação é dele.

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
- **O mapa virou Leaflet** (W22), com tile de terreno e o desenho SVG anterior
  guardado como reserva para quando não houver internet. Uma dependência nova
  (`leaflet`, no catálogo do `pnpm-workspace.yaml`); nada de
  `leaflet.markercluster`, porque o afastamento por roseta resolve o
  encavalamento com código puro e testável.

## 14. Testes

- api-ts, puros: `painel-chave`, `painel-chave-service` (DAO e auditoria
  mockados), `painel-quadro`, `painel-mapa`, `painel-backups`,
  `painel-de-backups`, `painel-historico-de-backups`, `painel-servidores`
  (gateway com `fetch` injetado).
- api-ts, contrato: `tests/contract/paineis-de-tv.test.ts` (18) — gestão das
  chaves, as duas portas de entrada (inclusive membro comum SEM `report.view` e
  logado de fora do espaço), escopo, revogação, colunas e cada rota de dados;
  `tests/contract/historico-de-backups.test.ts` (8) — as duas portas de
  entrada do histórico, escopo da chave, os campos recusados e a janela.
- chat-backend: `tests/painel-regras.test.ts` (puro) e `tests/painel.db.test.ts`
  (abas contra o banco e o segredo da rota interna).
- web: `core/components/painel-tv/painel-helpers.test.ts`,
  `core/components/painel-tv/mapa/mapa-helpers.test.ts` (tamanho do marcador,
  afastamento de cidades vizinhas, escolha entre tiles e reserva, máscara e
  contorno do estado) e `core/components/painel-tv/backups/backups-helpers.test.ts`
  (filtros, ordenação e leitura dos parâmetros da URL do painel interativo).
  Rodar com `bun test core/components/painel-tv`.

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
5. "Solicitar backup" é só o ATALHO para a página do plugin (§9.1). Disparar a
   solicitação daqui depende de o plugin backup-manager expor a ação pelo
   gateway; o plugin está em repositório separado.
