# Guia de Integrações Customizadas

As integrações customizadas permitem que administradores criem lógica de automação via **JavaScript assíncrono**, executada quando um webhook externo é recebido. Ideal para integrar sistemas legados (SAC, ERP, etc.) com o Plane sem precisar de middleware adicional.

---

## Visão Geral

```
Sistema externo  ──POST──►  /api/webhooks/receive/:slug/:hook_id/
                                      │
                              Executa seu JS
                                      │
                          executePrismaAction(...)
                                      │
                              makeLog(...)  ← obrigatório no final
```

---

## Criando uma Integração

1. Acesse **Configurações → Integrações Customizadas**
2. Clique em **Nova Integração**
3. Preencha nome, descrição e o código JS
4. Anote a **URL de recebimento** e o **segredo** gerados

---

## Estrutura do Código JS

```js
async function action() {
  // Variáveis injetadas automaticamente:
  //   body       — corpo do webhook (objeto JS)
  //   headers    — cabeçalhos HTTP (objeto de strings)
  //   sourceIp   — IP de origem (string)
  //   executePrismaAction({ table, operation, data?, options? })
  //   makeLog({ status?, error? })  ← DEVE ser chamada ao final
  //   importModule("node:crypto")   ← para módulos Node.js built-in

  // Sua lógica aqui...

  await makeLog({ status: "success" });
}
```

> ⚠️ **A função `action()` é a única que será executada. Não renomeie nem remova-a.**

---

## `executePrismaAction`

Executa operações no banco de dados de forma segura.

### Assinatura

```ts
executePrismaAction({
  table: string,        // Nome da tabela Prisma (ver lista abaixo)
  operation: "retrieve" | "insert" | "update" | "delete",
  data?: Record<string, any>,     // Obrigatório para insert/update
  options?: {
    where?: Record<string, any>,  // Filtros
    select?: Record<string, any>, // Campos a retornar
    orderBy?: Record<string, any>,
    take?: number,                // Máximo de registros (padrão: 50, máximo: 500)
    id?: string,                  // Para update/delete por ID específico
  },
})
```

### Tabelas permitidas

| Tabela | Descrição |
|--------|-----------|
| `issue` | Work items |
| `issueComment` | Comentários |
| `technicalVisit` | Visitas técnicas |
| `entity` | Entidades (clientes/prefeituras) |
| `project` | Projetos |
| `state` | Estados de workflow |
| `label` | Labels |
| `cycle` | Ciclos |
| `module` | Módulos |
| `intakeIssue` | Intakes (chamados de entrada) |
| `issueActivity` | Log de atividades |
| `customWebhookAuditLog` | Log de webhooks (somente leitura recomendada) |

> **Segurança:** Campos sensíveis (`password`, `apiKey`, etc.) são automaticamente bloqueados.  
> Todas as operações são escopo do workspace — `workspaceId` é sempre injetado.

---

## Exemplos

### 1. Criar um intake a partir de um número de chamado externo

```js
async function action() {
  // Extrair número do chamado do corpo
  const rawNum = body.chamado_numero ?? body.ticket_id ?? "";

  // Validar formato: ex. "2024-000123" ou "123"
  const match = rawNum.match(/^(?:\d{4}-)?(\d+)$/);
  if (!match) {
    await makeLog({ status: "error", error: `Número inválido: ${rawNum}` });
    return;
  }
  const ticketNum = match[1];

  // Buscar o projeto pelo identificador
  const projects = await executePrismaAction({
    table: "project",
    operation: "retrieve",
    options: { where: { identifier: "SAC" }, take: 1 },
  });
  if (!projects.length) {
    await makeLog({ status: "error", error: "Projeto SAC não encontrado" });
    return;
  }
  const project = projects[0];

  // Criar o intake
  const intakeName = body.assunto ?? `Chamado #${ticketNum}`;
  await executePrismaAction({
    table: "issue",
    operation: "insert",
    data: {
      projectId: project.id,
      name: intakeName,
      legacyTicketNumber: ticketNum,
      priority: body.urgente ? "urgent" : "none",
    },
  });

  await makeLog({ status: "success" });
}
```

### 2. Atualizar status de visita técnica via webhook de assinatura digital

```js
async function action() {
  // Webhook da plataforma de assinatura envia signatureId e status
  const { signature_id, status } = body;

  if (status !== "completed") {
    await makeLog({ status: "success" });
    return;
  }

  // Encontrar a visita com esse requestId
  const visits = await executePrismaAction({
    table: "technicalVisit",
    operation: "retrieve",
    options: { where: { signatureRequestId: signature_id }, take: 1 },
  });

  if (!visits.length) {
    await makeLog({ status: "error", error: `Visita não encontrada para signature ${signature_id}` });
    return;
  }

  // Marcar como concluída
  await executePrismaAction({
    table: "technicalVisit",
    operation: "update",
    options: { id: visits[0].id },
    data: { status: "completed", completedAt: new Date().toISOString() },
  });

  await makeLog({ status: "success" });
}
```

### 3. Múltiplas operações encadeadas

```js
async function action() {
  const entityCnpj = body.cnpj?.replace(/\D/g, "");

  // 1. Buscar entidade pelo CNPJ
  const entities = await executePrismaAction({
    table: "entity",
    operation: "retrieve",
    options: { where: { cnpj: entityCnpj }, take: 1 },
  });

  if (!entities.length) {
    await makeLog({ status: "error", error: "Entidade não encontrada" });
    return;
  }

  // 2. Buscar chamados abertos dessa entidade
  const openIssues = await executePrismaAction({
    table: "issue",
    operation: "retrieve",
    options: {
      where: { entityId: entities[0].id },
      take: 10,
      orderBy: { createdAt: "desc" },
    },
  });

  // 3. Comentar em cada chamado aberto
  for (const issue of openIssues) {
    await executePrismaAction({
      table: "issueComment",
      operation: "insert",
      data: {
        issueId: issue.id,
        commentHtml: `<p>Atualização automática: ${body.message}</p>`,
        commentStripped: body.message,
        projectId: issue.projectId,
      },
    });
  }

  await makeLog({ status: "success" });
}
```

---

## `makeLog`

Registra a execução no log de auditoria. **Deve ser chamada ao final de toda execução bem-sucedida ou com erro.**

```js
await makeLog();                            // status padrão: "success"
await makeLog({ status: "success" });
await makeLog({ status: "error", error: "descrição do erro" });
```

O log registra: IP de origem, cabeçalhos, corpo do request, status e tempo de execução.

---

## Importando Módulos Node.js

Apenas módulos built-in são permitidos via `importModule`:

```js
const { createHash } = await importModule("node:crypto");
const hash = createHash("sha256").update(body.token).digest("hex");
```

**Módulos permitidos:** `node:crypto`, `node:url`, `node:path`, `node:util`, `node:querystring`

---

## Verificação de Assinatura (HMAC)

Para garantir que o webhook veio do sistema correto, use o segredo gerado ao criar a integração:

```js
async function action() {
  const { createHmac } = await importModule("node:crypto");

  // O sistema externo deve enviar um header X-Signature com HMAC-SHA256
  const expected = createHmac("sha256", "SEU_SEGREDO")
    .update(JSON.stringify(body))
    .digest("hex");

  const received = headers["x-signature"] ?? "";

  if (received !== expected) {
    await makeLog({ status: "error", error: "Assinatura inválida" });
    return;
  }

  // ... lógica após validação
  await makeLog({ status: "success" });
}
```

---

## Logs de Auditoria

Acesse **Configurações → Integrações Customizadas** e clique em **Ver Logs** ao lado da integração para ver o histórico de execuções.

Cada log contém:
- Data/hora da execução
- IP de origem
- Cabeçalhos (sanitizados)
- Corpo do request (primeiros 10.000 chars)
- Status (`success` / `error`)
- Mensagem de erro (se houver)
- Tempo de execução (ms)

---

## Limitações

| Limite | Valor |
|--------|-------|
| Corpo máximo armazenado no log | 10.000 chars |
| Cabeçalhos máximos no log | 2.000 chars |
| Registros por `retrieve` | 500 |
| Módulos importáveis | Apenas Node.js built-ins |
| Tabelas acessíveis | Lista acima |
| Campos bloqueados | `password`, `apiKey`, `token`, etc. |

---

## Boas Práticas

1. **Sempre chame `makeLog()`** — mesmo em casos de erro ou retorno antecipado
2. **Valide o corpo** antes de fazer operações no banco
3. **Use o segredo HMAC** para autenticar requests de sistemas externos
4. **Não armazene segredos no código JS** — use os campos seguros do banco se necessário
5. **Teste com dados reais pequenos** antes de ativar em produção
