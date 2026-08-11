# Contrato — Contatos (as pessoas dentro do cliente)

> **Nome na interface: "Contatos".** No SAC eram "responsáveis" e é assim que o
> pessoal ainda fala, mas na tela o termo é Contatos — diz melhor o que são.
> Rotas (`entity-contacts/`), modelos (`EntityContact`) e o campo `contact_ids`
> já nasceram com esse nome; só os textos visíveis precisavam alinhar.

Fixado pelo coordenador para que backend, web, mobile e chat sejam escritos em
paralelo. **Quem implementar o backend segue isto à risca**; quem consome pode
programar contra este documento antes de a rota existir.

## Modelo

Já está no schema (migração `20260811090000_responsaveis_estimate_rich_filters`):
`EntityContact` (`entity_contacts`), `EntityContactType` (`entity_contact_types`)
e `TechnicalVisitContact` (`technical_visit_contacts`).

Os dados do SAC já entram por `apps/api-ts/scripts/migrate-sac-responsaveis.ts`
(2.433 contatos, 9 tipos — ver `.claude/MIGRACAO_LEGADO.md`). Uma ressalva para
quem escrever a rota: nos registros importados `photo` guarda o **caminho
relativo do legado** (`2025/11/foto_10.jpg`), não uma URL — o binário ainda está
no filesystem da intranet antiga.

## Rotas

Todas sob `/api/v1/workspaces/:slug/`, autenticadas, no padrão dos demais
módulos (`entity/index.ts` é o vizinho mais próximo — copie o estilo dele).

| Método | Caminho | Observação |
|---|---|---|
| GET | `entity-contacts/` | filtros `entity_id`, `type_id`, `is_active`, `search`, `has_phone` |
| POST | `entity-contacts/` | |
| GET | `entity-contacts/:contact_id/` | |
| PATCH | `entity-contacts/:contact_id/` | |
| DELETE | `entity-contacts/:contact_id/` | exclusão lógica (`deletedAt`) |
| GET | `entities/:entity_id/contacts/` | atalho; mesma forma da listagem |
| GET | `entity-contact-types/` | |
| POST | `entity-contact-types/` | |
| PATCH | `entity-contact-types/:type_id/` | |
| DELETE | `entity-contact-types/:type_id/` | |

`GET entity-contacts/` devolve **array puro** quando não vier `per_page`/`cursor`,
e envelope paginado quando vier — igual ao módulo de entidades. `search` casa
nome, e-mail e telefone (só dígitos).

## Corpo (snake_case, sempre)

```jsonc
{
  "id": "uuid",
  "entity_id": "uuid | null",
  "entity_name": "Prefeitura de X | null",   // conveniência de leitura
  "type_id": "uuid | null",
  "type_name": "Secretário (a) | null",
  "is_system_user": false,                    // vem do tipo
  "user_id": "uuid | null",
  "name": "Fulano de Tal",
  "email": "fulano@x.gov.br | null",
  "phone": "(67) 99999-0000 | null",
  "phone_digits": "5567999990000 | null",     // derivado no servidor, nunca do cliente
  "photo": "url | null",
  "birth_date": "1980-05-01 | null",          // ISO, só a data
  "is_active": true,
  "receive_messages": true,
  "notes": "texto | null",
  "created_at": "...", "updated_at": "..."
}
```

Aceito no POST/PATCH: `entity_id`, `type_id`, `user_id`, `name` (obrigatório),
`email`, `phone`, `photo`, `birth_date`, `is_active`, `receive_messages`, `notes`.
`phone_digits` é **calculado**: tira tudo que não é dígito e prefixa `55` quando
o número tem 10 ou 11 dígitos (padrão brasileiro sem DDI).

## Visita técnica

`POST`/`PATCH technical-visits/` passam a aceitar `contact_ids: string[]`.
A resposta ganha `contact_records: EntityContact[]`. O campo texto `contacts`
continua existindo e sendo devolvido — é o que veio do SAC e não dá para
reconstituir em pessoas; não remova nem sobrescreva.

## Permissões

Visível para todo mundo: é um menu próprio, no mesmo nível de Atendimento, sem
gating por função. Ler: qualquer membro do espaço. Criar/editar/apagar: qualquer
membro também — o cadastro nasce no encerramento do atendimento e na visita
técnica, feitos por quem está em campo.

## Trilha LGPD (obrigatória)

Responsável é dado pessoal de terceiro: nome, e-mail, telefone, data de
nascimento e foto de servidores públicos. **Toda rota deste módulo grava
auditoria** com `recordAudit` (`apps/api-ts/src/utils/audit.ts`), no mesmo
padrão dos módulos que já o fazem — incluindo a **leitura** da listagem e do
detalhe, não só a escrita. Sem isso não pode ir para produção.
