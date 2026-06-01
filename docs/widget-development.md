# Widget Development Guide

This guide explains how to create, build, and publish widgets for the Platform Widget Marketplace.

---

## What is a Widget?

A Widget is a self-contained React application that:

- Is compiled into a single JavaScript bundle (`widget.js`)
- Is packaged inside a ZIP file alongside a `manifest.json`
- Is uploaded to the platform via the Admin panel
- Can be embedded anywhere in the platform using `<DynamicWidget widgetId="..." />`
- Communicates with the platform exclusively through `window.WidgetSDK`

---

## Project Structure

```
my-widget/
├── src/
│   └── index.tsx        # Default export: your React component
├── manifest.json
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## manifest.json

All fields are required unless noted:

```json
{
  "name": "My Widget",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "What this widget does (optional)",
  "entry": "widget.js",
  "permissions": [
    "worker-items.read",
    "intakes.read",
    "stats.read",
    "users.read",
    "entities.read",
    "actions.read"
  ]
}
```

### Permission Reference

| Permission | Description |
|---|---|
| `worker-items.read` | Read work items (issues) |
| `intakes.read` | Read intake records |
| `actions.read` | Read actions |
| `stats.read` | Read aggregated statistics |
| `users.read` | Read user profiles |
| `entities.read` | Read entity (company/client) records |

---

## Vite Configuration

Use library mode so Vite emits a single ESM bundle:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      name: "Widget",
      fileName: () => "widget.js",
      formats: ["es"],
    },
    rollupOptions: {
      // React is provided by the host — do NOT bundle it
      external: ["react", "react-dom", "react/jsx-runtime"],
    },
  },
});
```

---

## Component Entry Point

Your `src/index.tsx` must have a **default export** of a React component:

```tsx
// src/index.tsx
import React from "react";

interface Props {
  entityId?: string;
  [key: string]: unknown;
}

export default function MyWidget({ entityId }: Props) {
  return (
    <div style={{ padding: 16 }}>
      <h2>My Widget</h2>
      <p>Entity: {entityId ?? "none"}</p>
    </div>
  );
}
```

---

## Using the SDK

The host platform injects `window.WidgetSDK` before your bundle executes.

If you are using the npm package:

```bash
npm install @mateusseiboth/widgets-aviao
```

Then use React hooks:

```tsx
import { useWorkerItems, useStats } from "@mateusseiboth/widgets-aviao";

export default function MyWidget({ entityId }: { entityId?: string }) {
  const { data, loading, error } = useWorkerItems({ entity_id: entityId, limit: 10 });

  if (loading) return <p>Loading…</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <ul>
      {data?.data.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}
```

Or use `window.WidgetSDK` directly (no package needed):

```tsx
declare const window: Window & {
  WidgetSDK: import("@mateusseiboth/widgets-aviao").WidgetSDKInstance;
};

export default function MyWidget() {
  const [items, setItems] = React.useState([]);

  React.useEffect(() => {
    window.WidgetSDK.workerItems.find({ limit: 5 }).then((res) => {
      setItems(res.data);
    });
  }, []);

  return <ul>{items.map((i: any) => <li key={i.id}>{i.name}</li>)}</ul>;
}
```

---

## Available SDK APIs

### WorkerItems

```ts
WidgetSDK.workerItems.find({ page, limit, search, entityId, status, assigneeId })
WidgetSDK.workerItems.findById(id)
WidgetSDK.workerItems.stats({ workspace_slug?, entity_id? })
```

### Intakes

```ts
WidgetSDK.intakes.find({ workspace_slug?, project_id?, status?, page, limit })
WidgetSDK.intakes.findById(id)
WidgetSDK.intakes.stats({ workspace_slug? })
```

### Actions

```ts
WidgetSDK.actions.find({ workspace_slug?, entity_id?, assignee_id?, page, limit })
WidgetSDK.actions.findById(id)
WidgetSDK.actions.stats({ workspace_slug? })
```

### Stats

```ts
WidgetSDK.stats.overview({ workspace_slug? })
WidgetSDK.stats.byEntity(entityId)
WidgetSDK.stats.period({ start_date, end_date, workspace_slug? })
```

### Users

```ts
WidgetSDK.users.current()
WidgetSDK.users.find({ search?, page, limit })
WidgetSDK.users.findById(id)
```

### Entities

```ts
WidgetSDK.entities.find({ workspace_slug?, search?, page, limit })
WidgetSDK.entities.findById(id)
```

### Storage (per-widget namespace)

```ts
WidgetSDK.storage.set("key", value)
WidgetSDK.storage.get("key")      // returns T | null
WidgetSDK.storage.remove("key")
WidgetSDK.storage.clear()         // removes all keys for this widget
```

### Notifications

```ts
WidgetSDK.notifications.success("Saved!")
WidgetSDK.notifications.error("Something went wrong")
WidgetSDK.notifications.warning("Quota is low")
WidgetSDK.notifications.info("Background sync running")
```

### UI

```ts
WidgetSDK.ui.modal({ title, content, size? })   // returns { close() }
WidgetSDK.ui.drawer({ title, content, position? })
WidgetSDK.ui.confirm({ title, message, onConfirm, onCancel? })
```

---

## Building

```bash
npm run build
# Outputs: dist/widget.js
```

---

## Packaging

```bash
# From your widget project root:
zip widget.zip manifest.json -j dist/widget.js
```

Or with Python:

```bash
python3 -c "
import zipfile, os
with zipfile.ZipFile('widget.zip', 'w') as zf:
    zf.write('manifest.json')
    zf.write('dist/widget.js', 'widget.js')
"
```

---

## Uploading

1. Open **Administration → Settings → Widgets**
2. Click **+ Upload Widget**
3. Drag and drop `widget.zip`
4. Review the manifest preview
5. Click **Upload**
6. The widget is created with status `PENDING_APPROVAL`
7. An instance admin can then **Activate** it

---

## Embedding in the Platform

Use the `<DynamicWidget>` component anywhere in the platform's React tree:

```tsx
import { DynamicWidget } from "@/components/widgets/dynamic-widget";

<DynamicWidget
  widgetId="550e8400-e29b-41d4-a716-446655440000"
  props={{ entityId: "my-entity-id" }}
/>
```

---

## Version Management

- Each upload creates a new `WidgetVersion` record
- You cannot re-upload the same `name + version` combination (returns 409)
- Increment `version` in `manifest.json` before each upload

---

## Security

Widgets are sandboxed in several ways:

- All API calls pass through `/api/v1/widget-sdk/*` (never internal endpoints)
- The gateway validates that the widget is active and has the declared permissions
- Storage is namespaced per widget ID — widgets cannot read each other's data
- CSP headers prevent the bundle from loading external resources

---

## Publishing the SDK

For GitLab-hosted projects, add to your CI/CD pipeline:

```yaml
publish-sdk:
  script:
    - cd packages/widget-sdk
    - npm run build
    - npm publish
  only:
    - tags
```
