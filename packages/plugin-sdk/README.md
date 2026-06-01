# @mateusseiboth/plugins-aviao

SDK for building **plugins** for the **Avião** platform. Plugins extend the app
itself: they can add sidebar items, mount full pages (with routing) and consume
the same data APIs that widgets use — all gated by the permissions declared in a
plugin's `manifest.json`.

Plugins are distributed as a `.zip` (manifest + bundle) and uploaded by an
instance admin under **Settings → Plugins**.

## manifest.json

```json
{
  "name": "Sales Dashboard",
  "slug": "sales-dashboard",
  "version": "1.0.0",
  "author": "ACME",
  "description": "Adds a sales dashboard page and a sidebar shortcut.",
  "entry": "plugin.js",
  "permissions": ["worker-items.read", "stats.read", "ui.sidebar", "ui.pages"],
  "contributions": {
    "pages": [
      { "path": "dashboard", "title": "Sales Dashboard", "component": "default" }
    ],
    "sidebar": [
      { "id": "sales", "label": "Sales", "icon": "BarChart3", "page": "dashboard", "order": 50 }
    ]
  }
}
```

- `contributions.pages` — pages the host will route to at
  `/:workspaceSlug/plugins/:slug/:path`.
- `contributions.sidebar` — items injected into the workspace sidebar. Each must
  point at a declared page.

## Quick start

```ts
import { initializeSDK, useWorkerItems, navigationApi, pagesApi } from "@mateusseiboth/plugins-aviao";

// The host initializes the SDK before mounting your bundle, exposing it on
// window.PluginSDK. You can also register pages/sidebar items at runtime:
pagesApi.register("dashboard", DashboardPage, { title: "Sales Dashboard" });
navigationApi.addSidebarItem({ id: "sales", label: "Sales", page: "dashboard", icon: "BarChart3" });

export default function DashboardPage() {
  const { data, loading } = useWorkerItems({ limit: 10 });
  // ...
}
```

## APIs

Data (same as widgets): `workerItems`, `intakes`, `actions`, `stats`, `users`,
`entities`. Graphical: `ui` (modals/drawers/confirm), `notifications`,
`navigation` (sidebar), `pages` (route registration), `storage` (scoped
localStorage). React hooks: `useWorkerItems`, `useStats`, `useEntities`, etc.

## Local build

```bash
pnpm --filter @mateusseiboth/plugins-aviao build      # one-off build
pnpm --filter @mateusseiboth/plugins-aviao dev        # watch mode
```
