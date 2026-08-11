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
  views + report editor + **contatos/responsáveis**), global full-text search,
  file & image upload, and local notifications for **urgent** tickets.

### Contatos (responsáveis da visita técnica)

Who received the team on site comes from the shared **Contatos** directory
(`entity-contacts/`), not from free text — same records the web and the chat use
(contract: `.claude/CONTRATO_RESPONSAVEIS.md`).

**Wording**: the directory itself is **"Contatos"** everywhere (sheet title,
"Cadastrar novo contato", "Editar contato", modal header). Inside a visit the
section keeps the name **"Responsáveis"** — there it is the role the contact
plays, the person who received the technician.

- The visit sends `contact_ids: string[]` on POST/PATCH and reads back
  `contact_records` (name, type, phone, e-mail).
- Adding someone = pick an existing contact of the entity (searchable by name,
  phone or e-mail) **or register a new one right there** — the técnico arrives at
  the prefeitura and whoever receives him is not in the system yet. The new
  contact is saved to the entity's directory (default type: the *usuário do
  sistema* one; any type can be picked) and linked to the visit in one go.
- Removing only unlinks: the contact stays in the directory for the next visit.
- The legacy `contacts` text (imported from the SAC, impossible to split back
  into people) is still shown, read-only, under "Anotado no SAC".
- Picking/creating/editing contacts **requires connection** — see the offline
  note below.

## Architecture

```text
app/                      expo-router routes
  _layout.tsx             providers + auth gate + Stack
  (auth)/login.tsx
  (tabs)/                 Home, Work Items, Intake, Visitas, Mais
  work-item/[id], /new
  intake/[id]
  visit/[id], /new, /contact   (contact = editar o contato que recebeu a equipe)
  wiki/index, /[id]
  search.tsx
src/
  api/                    client, types, endpoint helpers
  auth/                   AuthContext + secure token storage
  permissions/            role model + usePermissions
  offline/                cache + outbox + SyncProvider
  theme/                  colors, ThemeProvider
  components/             reusable UI + RichTextEditor + calendar + ContactSheet/Form
  hooks/                  useAsync, useCurrentProject, useEntityContacts,
                          usePushNotifications
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

The login screen also has a **Servidor** field: the URL typed there is persisted
to AsyncStorage after a successful sign-in and takes precedence over
`EXPO_PUBLIC_API_URL` / `app.json` on later launches (URLs without a scheme get
`https://` prefixed).

## Notes / next steps

- Remote push needs an EAS `projectId` + a device-registration endpoint; until
  then `usePushNotifications` raises **local** notifications by polling unread
  urgent items while foregrounded.
- App icon / splash use Expo defaults; swap in real artwork under `assets/` and
  reference them from `app.json` when branding is ready.
- **Contatos need connection.** The outbox queues *creations only* (product
  rule in `src/offline/storage.ts`), and linking a contact needs the id the
  server mints — an offline "create person + link them" pair would need id
  remapping between two queued items, which the outbox has no way to express. So
  the picker is disabled while offline and the screens say so; a new visit can
  still be saved offline and get its contatos once it syncs.
