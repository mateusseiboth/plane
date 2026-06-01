# Avião — mobile app

Expo (SDK 54, React Native 0.81, expo-router) client for the TypeScript API. The
name **Avião** ("airplane" in Portuguese) is a nod to *Plane*; this app uses
**placeholder branding only** — no Plane logos or brand assets.

## What's inside

- **Auth** — email/password sign-in against `/auth/sign-in/`, JWT stored in the OS
  keychain (`expo-secure-store`), Bearer-token API client.
- **Theming** — light / dark / system, fully token-driven (`src/theme`).
- **Permissions** — mirror of the backend SAC role model (GUEST 5 → ADMIN 20);
  assignee changes are admin-only, status/entity changes follow sector roles.
- **Offline-first** — read cache + an outbox that queues **new** items only and
  flushes on reconnect (`@react-native-community/netinfo`), with a clear
  **"pendente de sync"** badge wherever a local item appears.
- **Rich text editor** — self-contained WebView editor (bold/italic/underline/
  strike, H1–H3, lists, quote, code, links) that works offline and outputs HTML
  compatible with the API.
- **Features** — Home, Work Items (status / priority / entity / assignee changes),
  Intake (triage → promote), Wiki (view/edit), Technical Visits (**list & calendar**
  views + report editor), global full-text search, file & image upload, and local
  notifications for **urgent** tickets.

## Architecture

```
app/                      expo-router routes
  _layout.tsx             providers + auth gate + Stack
  (auth)/login.tsx
  (tabs)/                 Home, Work Items, Intake, Visitas, Mais
  work-item/[id], /new
  intake/[id]
  visit/[id], /new
  wiki/index, /[id]
  search.tsx
src/
  api/                    client, types, endpoint helpers
  auth/                   AuthContext + secure token storage
  permissions/            role model + usePermissions
  offline/                cache + outbox + SyncProvider
  theme/                  colors, ThemeProvider
  components/             reusable UI + RichTextEditor + calendar
  hooks/                  useAsync, useCurrentProject, usePushNotifications
```

## Running

This app is intentionally **outside** the pnpm workspace (see the root
`pnpm-workspace.yaml`) so it has a flat `node_modules` and avoids React Native /
Metro symlink issues.

```bash
cd apps/mobile
cp .env.example .env          # point EXPO_PUBLIC_API_URL at your gateway
npm install                   # or: yarn / bun install (NOT pnpm)
npx expo install --fix        # align native dep versions to the installed SDK
npx expo start
```

On a physical device set `EXPO_PUBLIC_API_URL` to your machine's LAN IP (e.g.
`http://192.168.0.10:8080`), not `localhost`.

## Notes / next steps

- Remote push needs an EAS `projectId` + a device-registration endpoint; until
  then `usePushNotifications` raises **local** notifications by polling unread
  urgent items while foregrounded.
- App icon / splash use Expo defaults; swap in real artwork under `assets/` and
  reference them from `app.json` when branding is ready.
