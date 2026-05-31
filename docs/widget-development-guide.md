# Guia de Desenvolvimento de Widgets

> **Versão:** 1.0 — 2026-05-31  
> **Alvo:** Desenvolvedores que desejam criar widgets personalizados para a Home do Plane.

---

## Visão Geral

Os widgets da Home são componentes React independentes que aparecem no topo da página inicial do workspace. Cada widget recebe `workspaceSlug: string` como prop e pode buscar seus próprios dados via API.

Há dois tipos de widget:
- **Widget estático** — embutido no código-fonte, sempre ativo.
- **Widget dinâmico** *(futuro)* — configurável pelo usuário na tela de gerenciamento.

---

## 1. Estrutura de Arquivos

```
apps/web/core/components/home/widgets/
├── my-widget.tsx            ← Seu componente aqui
├── my-work-items.tsx        ← Exemplo existente
├── open-intakes.tsx
└── ...
```

---

## 2. Criando um Widget Simples

### 2.1 Componente React

```tsx
// apps/web/core/components/home/widgets/my-widget.tsx
"use client";

import { useEffect, useState } from "react";
import type { THomeWidgetProps } from "@plane/types";

export function MyWidget({ workspaceSlug }: THomeWidgetProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Busque dados da API aqui
    fetch(`/api/workspaces/${workspaceSlug}/urgent-issues/`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [workspaceSlug]);

  if (loading) return <div className="h-32 animate-pulse rounded-xl border border-subtle bg-surface-2" />;

  return (
    <div className="rounded-xl border border-subtle bg-surface-1 p-4">
      <h3 className="mb-3 text-13 font-semibold">Meu Widget</h3>
      <ul>
        {data.map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

### 2.2 Registrar no Dashboard

Em `apps/web/core/components/home/home-dashboard-widgets.tsx`, importe e adicione ao grid:

```tsx
import { MyWidget } from "./widgets/my-widget";

// ...dentro do JSX do componente:
{!isWikiApp && (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
    <MyWidget workspaceSlug={workspaceSlug.toString()} />
    {/* widgets existentes */}
  </div>
)}
```

---

## 3. Widget com Dados Customizados (API de Widget)

Para widgets que precisam de dados diretos do banco, use o endpoint `/widget-data/`.

### 3.1 Endpoint

```
POST /api/workspaces/{workspaceSlug}/widget-data/
Authorization: Bearer <token>
Content-Type: application/json
```

**Corpo da requisição:**

```json
{
  "table": "issue",
  "select": {
    "id": true,
    "name": true,
    "priority": true,
    "state": {
      "select": { "name": true, "group": true }
    }
  },
  "where": {
    "priority": "urgent",
    "isDraft": false
  },
  "orderBy": { "updatedAt": "desc" },
  "take": 10
}
```

**Resposta:**

```json
{
  "table": "issue",
  "count": 3,
  "results": [
    { "id": "...", "name": "Bug crítico", "priority": "urgent", "state": { "name": "Em Andamento", "group": "started" } }
  ]
}
```

### 3.2 Tabelas Disponíveis

| Tabela | Descrição |
|--------|-----------|
| `issue` | Work items |
| `issueComment` | Comentários |
| `technicalVisit` | Visitas técnicas |
| `entity` | Entidades/clientes |
| `project` | Projetos |
| `state` | Estados do fluxo |
| `label` | Labels |
| `cycle` | Ciclos |
| `module` | Módulos |
| `intakeIssue` | Registros de intake |
| `issueActivity` | Atividades/histórico |

> **Nota de segurança:** O endpoint sempre filtra pelo `workspaceId` do usuário autenticado e exclui registros com `deletedAt != null`. Campos sensíveis (senhas, tokens) são bloqueados automaticamente.

### 3.3 Usando o Endpoint em um Widget

```tsx
"use client";

import { useEffect, useState } from "react";
import type { THomeWidgetProps } from "@plane/types";
import { APIService } from "@/services/api.service";
import { API_BASE_URL } from "@plane/constants";

class WidgetDataService extends APIService {
  constructor() { super(API_BASE_URL); }
  
  query(slug: string, payload: {
    table: string;
    select?: object;
    where?: object;
    orderBy?: object;
    take?: number;
  }) {
    return this.post(`/api/workspaces/${slug}/widget-data/`, payload)
      .then((r) => r?.data?.results ?? [])
      .catch(() => []);
  }
}

const widgetDataService = new WidgetDataService();

export function MyCustomWidget({ workspaceSlug }: THomeWidgetProps) {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    widgetDataService.query(workspaceSlug, {
      table: "technicalVisit",
      select: {
        id: true, city: true, scheduledDate: true, status: true,
        entity: { select: { name: true } },
      },
      where: { status: 0 },          // 0 = Agendada
      orderBy: { scheduledDate: "asc" },
      take: 5,
    }).then(setItems);
  }, [workspaceSlug]);

  return (
    <div className="rounded-xl border border-subtle bg-surface-1 p-4">
      <h3 className="mb-3 text-13 font-semibold">Visitas Agendadas</h3>
      {items.map((v) => (
        <div key={v.id} className="py-1 text-13">
          {v.entity?.name} — {v.city} — {new Date(v.scheduledDate).toLocaleDateString("pt-BR")}
        </div>
      ))}
    </div>
  );
}
```

---

## 4. Boas Práticas

### 4.1 Loading state
Sempre exiba um esqueleto de carregamento:

```tsx
if (loading) return <div className="h-32 animate-pulse rounded-xl border border-subtle bg-surface-2" />;
```

### 4.2 Estado vazio
Não exiba nada (ou uma mensagem simples) quando não houver dados:

```tsx
if (items.length === 0) return (
  <div className="rounded-xl border border-subtle bg-surface-1 p-8 text-center text-13 text-secondary">
    Nenhum item encontrado.
  </div>
);
```

### 4.3 Links de navegação
Use `Link` do Next.js para navegação interna:

```tsx
import Link from "next/link";

<Link href={`/${workspaceSlug}/projects/${item.project?.id}/issues/${item.id}/`}>
  {item.name}
</Link>
```

### 4.4 Polling (atualização periódica)
Para dados em tempo real, use `setInterval` com cleanup:

```tsx
useEffect(() => {
  load();
  const interval = setInterval(load, 60_000); // A cada 60s
  return () => clearInterval(interval);
}, [workspaceSlug]);
```

### 4.5 Limitar requisições
Use `take` para limitar o número de resultados e evitar lentidão:

```json
{ "table": "issue", "take": 20 }
```

---

## 5. Design System

Use as classes utilitárias do Plane para consistência visual:

| Propósito | Classe |
|-----------|--------|
| Container | `rounded-xl border border-subtle bg-surface-1 p-4` |
| Título | `text-13 font-semibold text-primary` |
| Subtítulo/rótulo | `text-11 text-tertiary` |
| Texto principal | `text-13 text-primary` |
| Texto secundário | `text-13 text-secondary` |
| Skeleton de loading | `h-32 animate-pulse rounded-xl border border-subtle bg-surface-2` |
| Item de lista hover | `hover:bg-surface-2 rounded-md px-2 py-1.5` |

---

## 6. Exemplo Completo

Veja exemplos funcionais em:

- `apps/web/core/components/home/widgets/my-work-items.tsx` — Lista de work items
- `apps/web/core/components/home/widgets/open-intakes.tsx` — Intakes abertos
- `apps/web/core/components/home/widgets/critical-issues.tsx` — Chamados urgentes
- `apps/web/core/components/home/widgets/upcoming-dates.tsx` — Prazos próximos

---

## 7. Checklist para Publicar um Novo Widget

- [ ] Componente criado em `apps/web/core/components/home/widgets/`
- [ ] Exporta a função com `THomeWidgetProps` como prop
- [ ] Tem loading state
- [ ] Tem estado vazio
- [ ] Está registrado em `home-dashboard-widgets.tsx`
- [ ] Testado localmente
- [ ] Não faz chamadas para APIs externas (apenas para `/api/workspaces/...`)
- [ ] Não armazena dados sensíveis no estado local
