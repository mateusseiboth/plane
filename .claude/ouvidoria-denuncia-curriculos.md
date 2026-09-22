# Ouvidoria, denúncia interna, currículos e lista de e-mails (W15)

Data: 2026-09-22 · Worker W15. Legado consultado em `siteintranet/intranet/`:
`sac_relatorioOuvidoria.php`, `zapi/menuOuvidoria.php`, `zapi/menuInicial.php`,
`zapi/menuEnviarCurriculo.php`, `zapi/menuAtualizarEmail.php`, `sac_denuncia.php`,
`sac_denunciasLista.php`, `sac_curriculos.php`, `intra_curriculo*.php`, `intra_responsavelemails.php`.

## 1. Mapa

```
apps/api-ts/src/
  modules/ouvidoria/        lista, contador de não lidas, marcar como lida (ouvidoria.read)
  modules/denuncia/         POST (qualquer membro) e lista paginada (denuncia.read)
  modules/curriculo/        lista, vagas, marcações, download, exclusão, prazo de guarda,
                            scheduleExpurgoDeCurriculos (boot + a cada 24 h)
  modules/trabalhe-conosco/ página pública de inscrição de currículo (HTML próprio)
  modules/contato-email/    lista de e-mails e CSV (contato.export, auditado como export)
  modules/interno-chat/     rotas do robô: /api/internal/chat/workspaces/:slug/{ouvidoria,curriculos,responsavel-email}/
  utils/servico-interno.ts  X-Service-Token = CHAT_SERVICE_TOKEN (vazio = 503)
  utils/rota-sem-rastro.ts  rotas que não gravam o "último uso" da chave de API (POST de denúncia)
  utils/erro-de-dominio.ts  DomainError / NotFoundError / FieldValidationError (errors: [{path, message}])
  prisma/migrations/20260922190000_ouvidoria_denuncia_curriculos/

apps/chat-backend/src/bot/
  engine.ts                 passos do fluxo num strategy map (STEP_RUNNERS); passo novo "action"
  acao/tipos.ts             contrato do passo e dos destinos
  acao/executar.ts          createAcaoRunner: pergunta o que falta, valida, chama, trata o resultado
  acao/destinos.ts          createDestinos: ouvidoria, curriculo, responsavel_email
  acao/api-ts.ts            cliente das rotas internas (API_TS_INTERNAL_URL + CHAT_SERVICE_TOKEN)
  acao/arquivo.ts           arquivo da última mensagem do cliente (ext: só https; ou storage do chat)
  acao/rotas.ts             GET /workspaces/:slug/config/bot/destinos/ (chat.administrar)

apps/web/
  app/.../ouvidoria, denuncias, curriculos, contatos/emails (páginas)
  core/components/ouvidoria/  helpers (+ testes), comum, retenção, link da lista de e-mails
  core/components/chat/passo-de-acao.tsx     passo "Executar ação" no editor de fluxos
  core/components/workspace/sidebar/sidebar-badge.tsx  contador de não lidas da ouvidoria
  core/hooks/use-ouvidoria.ts, use-destinos-do-robo.ts; core/services/ouvidoria.service.ts
apps/proxy-ts/nginx.conf    location sem access_log para /api/.../denuncias/
```

## 2. Passo "ação" do robô

Passo gravado em `chat_bot_flows.steps`: `{ "type": "action", "destino": "ouvidoria", "params": { "tipo": "reclamacao" }, "prompts": { "cnpj": "..." } }`.

- O destino declara os campos. O passo pula o que a conversa já sabe (`prefill`: o nome do cliente),
  pergunta um campo por vez, valida a resposta (CNPJ com 14 números, e-mail, PDF) e, com tudo
  respondido, chama `run`.
- Estado no `flowState`: `__step` (índice do passo), `__acao` (campo esperado), `__arquivos`
  (mensagem que trouxe cada arquivo). As respostas ficam nas chaves dos campos, como no passo "ask".
- Resultado `campo` (a API recusou, ex.: CNPJ que não é de entidade do espaço): apaga a resposta e
  pergunta de novo. `falha` (API fora): aviso curto e o fluxo segue. `ok`: mensagem e próximo passo.
- Destino novo = uma entrada em `createDestinos`. O motor não muda.
- Montagem sugerida (legado): menu `2) Sugestões` → fluxo [ação ouvidoria tipo sugestão, encerrar];
  `3) Reclamações` idem com reclamação; `4) Atualizar e-mail` → [ação responsavel_email, mostrar menu
  ou encerrar]; `5) Enviar currículo` → [ação curriculo, encerrar]. Nada é criado automaticamente.
- `responsavel_email` só vale com o responsável identificado pelo telefone (`entity_contact_id` da
  sessão); sem ele, o robô avisa e segue. O de/para do e-mail vai para `audit_logs`
  (`entity_contact`, `update`, `metadata.origem = "chat"`), no lugar da `responsaveis_emaillog`.

## 3. Autenticação de serviço

`CHAT_SERVICE_TOKEN` igual no api-ts e no chat-backend (compose já passa os dois). Cabeçalho
`X-Service-Token`, comparação em tempo constante. Sem o segredo no api-ts, as rotas internas dão 503.
As rotas ficam em `/api/internal/chat/...`, fora do `/api/v1` (o `authPlugin` de lá é global) e
montadas antes do `apiApp`. O proxy público reescreve `/api/*` para `/api/v1/*`, então elas só são
alcançadas pela rede interna (`API_TS_INTERNAL_URL`, padrão `http://api-ts:8001`).

## 4. Denúncia anônima: o que garante o anonimato

- Tabela `denuncias` SEM `created_at`/`updated_at`: só `reported_on` (DATE, no fuso `TZ_PADRAO`,
  padrão `America/Campo_Grande`). `author_id` nulo quando anônima. Id v4 (o v7 carrega o instante).
- Lista ordenada por dia e id aleatório: não revela a ordem de gravação dentro do dia.
- O POST não grava `audit_logs`, não publica SSE, não notifica ninguém.
- `api_activity_logs` não é gravado por ninguém no api-ts hoje (conferido); o teste confere que a
  contagem não muda.
- `authPlugin` não atualiza `api_tokens.last_used` nessa rota (`isRotaSemRastro`).
- nginx: `location ~ ^/api/(?:v1/)?workspaces/[^/]+/denuncias/` com `access_log off` e sem
  `X-Forwarded-For`.
- Teste: `tests/contract/ouvidoria-denuncia-curriculos.test.ts` ("ANÔNIMA: nada liga a denúncia ao
  autor"), pela sessão (JWT) e pela chave de API.
- Fica de fora do alcance do app: log do Postgres, do Docker/host e de proxies à frente do nginx.

## 5. Currículos e LGPD

- PDF conferido pelo tipo E pela assinatura `%PDF-`, até 10 MB; arquivo em
  `curriculos/<workspace>/<id>.pdf` no storage (disco ou S3).
- Marcar lido/entrevistado grava quem e quando; desmarcar limpa os dois.
- Download: `Cache-Control: private, no-store`, auditado (`curriculo`, `download`).
- Exclusão: apaga arquivo (S3 e disco, `deleteAsset`) e linha, auditada. Não há lixeira.
- Prazo de guarda por espaço (`curriculo_config.retention_days`, 30 a 3650, padrão 365). O expurgo
  roda no boot e a cada 24 h e registra `delete` com `metadata.exclusao = "prazo_de_guarda"`.
- Vaga é texto livre informado pelo candidato; o filtro é por trecho, com as vagas já recebidas como
  sugestão.

## 5.1 Inscrição pelo site (W17, 23/09/2026)

Currículo também entra por uma página pública, sem login:
`/trabalhe-conosco?workspace=<slug>` (módulo `modules/trabalhe-conosco`, HTML próprio no molde
do portal do cliente, `location ~ ^/trabalhe-conosco` no `apps/proxy-ts/nginx.conf`).

- Campos: nome, e-mail, telefone com DDD, vaga, cidade, mensagem opcional, PDF obrigatório
  (mesma `validatePdf`: tipo + assinatura `%PDF-`, até 10 MB) e aceite da LGPD obrigatório. O
  texto do aceite mostra o prazo de guarda DO ESPAÇO.
- Colunas novas (migração `20260923100000_curriculo_pelo_site`): `curriculos.email`, `city`,
  `source` (`chat` do robô ou `site`) e `consent_at`; `curriculo_config.site_enabled`. A origem
  é objeto `as const` (`CURRICULO_ORIGEM`), nunca enum.
- Gravação pelo MESMO service (`createDoSite` cai no mesmo `save` do robô), então prazo de
  guarda, expurgo, download auditado e exclusão valem igual.
- Liga/desliga por espaço na tela de Currículos (`InscricaoPeloSite`, exige `curriculo.read`),
  junto do link para copiar. Desligado, a página mostra "As inscrições estão fechadas no
  momento." e o POST responde 403 com a mesma frase.
- Contra robô: 5 envios por IP por hora (`checkRateLimit`) e campo isca `sobrenome`, fora da
  tela. Robô na isca recebe a MESMA resposta de sucesso e nada é gravado; dizer "recusado"
  ensinaria o robô a tentar de novo sem a isca. A resposta nunca conta se o e-mail já mandou
  currículo antes.
- `GET /trabalhe-conosco/api/config?workspace=<slug>` devolve `{nome, aberto}`, para montar o
  link em outro lugar.
- Testes: `tests/contract/trabalhe-conosco.test.ts` e `tests/unit/curriculo-site.test.ts`.
- Formato de e-mail passou a ter fonte única: `@utils/email-valido` (`isEmailValido`), usado
  aqui e na lista de e-mails dos responsáveis.

## 6. Lista de e-mails

`GET /workspaces/:slug/contact-emails/?entity_id&entity_type&project_ids=a,b&include_members=true`
e `/export/` (CSV `;`, com BOM). Entram responsáveis ativos, não apagados, com e-mail, **com
`receive_messages` ligado** (opt-in) e de entidade ativa e não congelada. Sistema = vínculo
`entity_contact_projects` (W09). Internos = membros ativos do espaço. E-mails deduplicados sem
diferenciar maiúsculas e inválidos descartados. Gerar a lista e baixar o CSV são auditados como
`export` de `entity_contact`. Sem filtro, a lista traz todas as entidades (decisão: a ação e a
auditoria já controlam o acesso).

## 7. Decisões conservadoras

- Ouvidoria: o CNPJ é sempre perguntado (o legado pulava quando o contato já tinha entidade). O
  CNPJ do cadastro pode ter máscara: a busca compara só os dígitos.
- O "99 encerra" do legado não foi reproduzido dentro do passo de ação.
- Denúncia: nem a identificada guarda hora (se só a anônima perdesse a hora, dava para distingui-las).
- Chaves de navegação só em `en` e `pt-BR`, como as demais telas do fork (os outros idiomas caem no
  inglês).
- Evento SSE `ouvidoria` (só o id) vai para o espaço inteiro; a tela e o contador só consultam a API
  com `ouvidoria.read`.

## 8. Pendências

- `chat_sessions.protocol` é único no banco inteiro, mas a sequência é por espaço e dia: dois espaços
  no mesmo dia colidem (`20260922-0002`). Em produção há um espaço só; nos testes aparece quando se
  usa o espaço `quality` e outro no mesmo dia. Não corrigido aqui (arquivo de outro worker).
- Legado: `chat_ouvidoria`, `denuncia` e `curriculos` do MySQL não foram migrados.
- A tela de fluxos segue no padrão antigo (useEffect + estado local); só o passo novo usa SWR.
- `tests/unit/sla.test.ts` falhou uma vez rodando a pasta toda e passou sozinho e na repetição
  (ordem dos testes, anterior a este trabalho).
