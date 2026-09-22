<br /><br />

<p align="center">
  <!-- Placeholder logo — this fork does NOT use Plane's brand assets. Replace with your own. -->
  <img src="https://placehold.co/400x120/1e293b/ffffff/png?text=Avi%C3%A3o" alt="Project logo placeholder" width="400">
</p>
<p align="center"><b>A Plane-based project management & service-desk platform, re-engineered in TypeScript</b></p>

<p align="center">
  <img src="https://img.shields.io/badge/based%20on-Plane-5b5fc7?style=for-the-badge" alt="Based on Plane" />
  <img src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=for-the-badge" alt="AGPL-3.0" />
  <img src="https://img.shields.io/badge/API-TypeScript%20(Bun%20%2B%20Elysia)-3178c6?style=for-the-badge" alt="TypeScript API" />
  <img src="https://img.shields.io/badge/mobile-Expo-000020?style=for-the-badge&logo=expo" alt="Expo mobile app" />
</p>

---

## 📌 About this project

This repository is a **fork of [Plane](https://plane.so/)**, the open-source project
management tool by [Plane (makeplane)](https://github.com/makeplane/plane). We are deeply
grateful to the Plane team and community for their work — without it, this project would not
exist.

It is **not** affiliated with, endorsed by, or supported by Plane. We do **not** use Plane's
logos, brand assets, or trademarks anywhere in this fork; all branding shown here uses
placeholders that you should replace with your own.

We have evolved Plane Community Edition in two major directions:

1. **A full rewrite of the backend API in TypeScript.** The original Django/Python REST API
   (`apps/api/`) is **deprecated and no longer used** at runtime — it is kept **read-only, for
   historical reference only**. All new development happens in the new TypeScript API
   (`apps/api-ts/`), built with **Bun + Elysia + Prisma 7 (PostgreSQL)**, while preserving the
   original `/api/v1/` contract.

2. **A set of additional features** layered on top of Plane Community Edition — most notably a
   service-desk / SAC workflow (entities, technical visits, legacy ticket numbers),
   managerial reports, a developer widget marketplace, granular role-based permissions, and a
   brand-new **mobile app ("Avião")** built with Expo.

> **License & attribution.** This project remains licensed under the **GNU Affero General
> Public License v3.0 (AGPL-3.0)**, the same license as upstream Plane. The original copyright
> of Plane is retained; our changes are contributed under the same terms. See
> [LICENSE.txt](./LICENSE.txt).

---

## 🆚 What we changed vs. Plane Community Edition

| Area | Plane Community Edition | This fork |
| --- | --- | --- |
| **Backend API** | Django / Python REST Framework (`apps/api/`) | **Rewritten in TypeScript** — Bun + Elysia + Prisma 7 on PostgreSQL (`apps/api-ts/`). Same `/api/v1/` contract, `X-Api-Key` auth, identical pagination/cursor format. |
| **Django API** | Active, primary backend | **Deprecated / read-only.** Kept only as a reference for legacy business rules; not run, not patched, no new endpoints or migrations. |
| **Mobile app** | — | **New "Avião" app** built with Expo (latest SDK): a data-rich home (assigned/urgent/open stats), work items, **real intake approval flow**, entities, notifications, wiki, technical visits, global search, rich text editor, offline-first sync, push notifications, light/dark themes. |
| **Service desk (SAC)** | — | **Entities** (clients) and **Technical Visits** as first-class, workspace-scoped models. |
| **Legacy ticket numbers** | — | `legacy_ticket_number` field preserved on issues and shown across all views. |
| **Technical visits** | — | Dedicated screen + API: schedule visits with technician and 2nd technician, server-generated number `N-YYYY` (restarts every year), city filled from the entity, visit opened **from an issue** (already linked, entity and system inherited), linked issues with search, closing lock (no open linked issue; dates, summary, conclusion and a motive required), functionalities = project **modules**, report attachment (upload/download; attaching the signed report concludes a visit "Awaiting signature"), printable report with signature fields and a **training attendance list** (one sheet per system), list filters (technician, entity, period, overdue) with pagination. Who does what comes from the action matrix: `visit.manage` registers, `visit.manage.all` changes technician/date, cancels and deletes, and the visit's own technician fills the report. See [`.claude/visitas-tecnicas.md`](./.claude/visitas-tecnicas.md). |
| **Managerial reports** | Basic analytics only | **Reports module**: tickets, productivity & people, technical visits, SLA, and temporal/managerial breakdowns, with PDF/print export. |
| **Widget marketplace** | — | **Developer widget system**: upload/host widget assets, an SDK gateway API, dynamic widget loader, and a `@empresa/widget-sdk` package for third-party widgets. |
| **Home widgets** | Static home | Configurable, useful home widgets. |
| **Permissions** | Admin / Member / Guest | **Granular role-based permissions** mirrored across backend, web, and mobile (e.g. service-desk, quality, IT, project-manager roles), with sector-derived role mapping on import. |
| **Intake** | Available (paid/EE in places) | Full **intake/approval flow** (triage → approve/decline) in the TypeScript API, exposed on web **and** mobile, with offline creation and persistence fixes. |
| **Urgent tickets** | — | Urgent-ticket banner, home surfacing, and **push notifications**. |
| **Global search** | Basic `contains` | **Native PostgreSQL full-text search** (`tsvector` + `websearch_to_tsquery`) with **trigram typo tolerance**, accent-folding, comment matching and **legacy ticket number** indexing; plus an admin **reindex** route. |
| **AI text assist** | Pages AI | AI-assisted text improvement on comments/descriptions. |
| **Comment history** | — | Edit history for comments. |
| **Default locale** | English | **pt-BR available as default**, full i18n retained. |
| **File / image upload** | Web | Web **and** mobile, via the asset module (`FileAsset` / `IssueAttachment`). |
| **Paywalls / "Pro" gating** | Upgrade modals, badges & feature flags gate features | **All paywalls removed** — upgrade UI renders nothing and gated CE features (bulk operations, page move/share, issue embeds) are enabled for everyone. |
| **Whitelabel branding** | Hardcoded "Plane" | **Single switch point** (`APP_NAME` / `VITE_APP_NAME`) — defaults to **"Avião"**; titles, metadata and chrome derive from it. |
| **Developer docs** | — | In-app **Widgets & Custom Integrations** docs page (`/<workspace>/developers/widgets`), linked from the home "Manage widgets" dialog. |
| **Message board (Mural)** | — | **Announcements on the user's home**: rich text, optional attachment, pinned, expiry and "must read" (opens in a modal on entry until confirmed). Unread first, per-person read tracking, "who read / who didn't" for publishers, history page with period filter, live via SSE and a bell notification. Publishing requires the `mural.publish` action (Gestor and admin by default). See [`.claude/mural.md`](./.claude/mural.md). |
| **Workspace wiki** | Paid ("Wiki" in the plan table) | **Wiki at `/<workspace>/wiki`**: nested pages (create child, move, reorder, archive with the subtree), the same collaborative editor and version history as project pages, **file attachment block** in the editor, wiki search plus wiki pages in ⌘K and global search. Access by the permission matrix (`wiki.view`, `wiki.edit`). Legacy import: `apps/api-ts/scripts/import-wiki-legado.ts`. See [`.claude/wiki.md`](./.claude/wiki.md). |
| **Client portal** | — | **Public request portal** (`/portal?workspace=<slug>`) with its own login: the client picks a system, opens a request and follows its status. Own account model (no Plane seat), requests land in the project's **intake/triage**. The client can **reply** to an open request (rich text + attachments, becomes a comment on the work item and rings the assignees' bell), **close** it ("already solved"), **reopen** a completed one with a reason, **rate** the service when it is completed (shown to the team in the work item) and read the **technical visits** of their entity. Accounts are managed in **Settings > Customer portal** (action `portal.manage`): create, edit, link to an entity, deactivate and reset the password (e-mail link, or a one-time temporary password when there is no SMTP). |
| **Accounts & sessions** | Forgot-password needs Django's SMTP setup | **Forgot password by e-mail** for Plane users and **client-portal accounts** (single-use, expiring, hashed token), **session revocation** in the API, the chat and the portal (changing or resetting the password, freezing the account or "sign out everywhere" drops every open session), **sign-in by username** as well as e-mail, **admin creates a user with password, role and systems** (no invite), **freeze** a member in one workspace (only that workspace) or the whole account (instance admin), extra profile fields (phone, mobile, birthday, nickname), a **phone book** of active colleagues, and an audit trail for member creation, role changes, removal, password changes and freezes. SMTP is set in workspace settings or via `SMTP_*` env vars. |
| **Entity registry** | — | Full entity record (address, state registration, website, sales representative, **responsible entity** for third-party CNPJ) with audited create/update/delete, **freeze/unfreeze** (action `entity.freeze`) that also switches off the entity's contacts and portal accounts and restores exactly those, **contacts linked to systems** (projects) with a system filter, a **duplicate phone/e-mail warning** and a screen for **contact types**. |

> A living backlog of these features lives in [`ToDo.md`](./ToDo.md),
> [`RELATORIOS_TODO.md`](./RELATORIOS_TODO.md) and
> [`WIDGET_MARKETPLACE_TODO.md`](./WIDGET_MARKETPLACE_TODO.md).

### 🎨 Whitelabel & no paywalls

- **Whitelabel:** the product name is centralized in `APP_NAME`
  ([`packages/constants/src/metadata.ts`](./packages/constants/src/metadata.ts)) and defaults to
  **Avião**. Override per build with `VITE_APP_NAME`, `VITE_APP_TAGLINE` and `VITE_APP_URL` — all
  page titles, metadata and visible chrome follow it. Logos use placeholders (no Plane brand
  assets).
- **No paywalls:** every "upgrade to Pro" surface (badges, banners, the plan-upgrade modal,
  issue-embed and active-cycles CTAs) renders nothing, and the CE feature flags that hid bulk
  operations and page move/sharing are enabled for everyone.

---

## 🏗️ Architecture

```text
apps/
├── api/        # ⛔ Legacy Django API — DEPRECATED, read-only reference only
├── api-ts/     # ✅ Current backend — Bun + Elysia + Prisma 7 (PostgreSQL)
├── web/        # Web client (React Router)
├── admin/      # Admin / God-mode console
├── space/      # Public spaces
├── live/       # Realtime collaboration server
├── proxy-ts/   # Reverse proxy (TypeScript)
└── mobile/     # 📱 "Avião" — Expo mobile app   (added by this fork)
```

**Backend (`apps/api-ts/`) at a glance**

- **Runtime:** Bun · **Framework:** Elysia · **ORM:** Prisma 7 with `@prisma/adapter-pg`
- **Docs:** `@elysiajs/swagger` (OpenAPI)
- **Contract:** `/api/v1/` prefix, `X-Api-Key` auth, Plane-compatible cursor pagination
- **Modules:** project, state, label, cycle, module, issue, page, workspace, member, user, auth,
  entity, technical-visit, asset, invite, analytics, reports, webhook, notification, ai,
  premium, intake-work-item, work-item, widget / widget-sdk-gateway / custom-widget, plugin,
  and integrations (Git, Slack).
- **E-mail:** SMTP config lives on the instance (`configurations.smtp`, edited in
  *Settings → E-mail*); when absent, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`,
  `SMTP_FROM`, `SMTP_FROM_NAME` and `SMTP_SECURITY` (`none` | `starttls` | `ssl`) are used.
  `EMAIL_TRANSPORT=fake` writes messages to `EMAIL_OUTBOX_DIR` instead of sending (tests).
  Links in e-mails point to `APP_BASE_URL`.
- **Sessions:** the JWT carries the user's session version (`users.token_updated_at`); bumping
  it revokes every token issued before. The chat backend applies the same rule (checked against
  api-ts by a test), and client-portal tokens carry `portal_accounts.token_updated_at`.

**Plugin backend bridge: `PLUGIN_BRIDGE_SECRET` (required for plugins with a backend)**

Plugins that declare `backend.baseUrl` in their manifest talk to their own backend through
the signed proxy `ALL /api/v1/plugin-sdk/backend/*`. Each request carries identity headers
(`X-Plugin-User`, `X-Plugin-Workspace`, `X-Plugin-Perms`, ...) signed with a per-plugin key,
`HMAC(PLUGIN_BRIDGE_SECRET, pluginId)`; the plugin backend must be configured with the same secret.

- Set it on the api-ts service: `PLUGIN_BRIDGE_SECRET=$(openssl rand -hex 32)`
  (see `apps/api-ts/.env.example` and `docker-compose-local.yml`).
- There is **no default value**. Without it the proxy answers `503` and api-ts logs
  `PLUGIN_BRIDGE_SECRET não configurado`. The other plugin SDK routes keep working.
- Changing it invalidates the key of every plugin backend: update both sides together.

**Plugin / widget SDK gateways** (`/api/v1/plugin-sdk/*`, `/api/v1/widget-sdk/*`): every data
route requires `workspace_slug` and an active membership in that workspace; work items and
intakes are limited to the projects the user belongs to (same rule as the workspace issue list).
The SDKs send the current workspace automatically (`initializeSDK({ ..., workspaceSlug })`,
wired by the host). Uploading a plugin whose slug already exists updates it when the version is
higher, re-enables it after a delete, and is rejected with `409` for an equal or lower version.

> **Django is no longer used.** Per project policy, no new code, bug fixes, endpoints,
> migrations, or model changes are made in `apps/api/`. Treat it as read-only documentation of
> legacy behavior only.

---

## 📱 Mobile app — "Avião"

The name **Avião** ("airplane" in Portuguese) is a nod to *Plane*. The app talks exclusively to
the new TypeScript API and brings the web experience to mobile:

- Intake, work items, wiki, and technical visits — feature parity with the web app
- Rich text editor matching the web editor's capabilities
- Open intakes & work items; change status, entity, and assignee (assignee changes for admins)
- Permissions identical to web/backend
- Light & dark themes, fully reusable component library
- Offline-first: local storage with sync for **new** items, with clear "pending sync" indicators
- File & image upload
- Push notifications for **urgent** tickets
- Technical-visit reports in **list or calendar** views

Built with **Expo (latest SDK)** under `apps/mobile/`.

---

## 🚀 Local development

This is a pnpm + Turborepo monorepo. See [CONTRIBUTING.md](./CONTRIBUTING.md) and the
`docker-compose-*.yml` files at the repo root for local and stack setups.

```bash
# install
pnpm install

# run the TypeScript API tests
docker compose -f docker-compose-test-ts.yml up --build \
  --abort-on-container-exit --exit-code-from api-ts-tests
```

## ⚙️ Built with

[![Bun](https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh/)
[![Elysia](https://img.shields.io/badge/Elysia-0f172a?style=for-the-badge)](https://elysiajs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![React Router](https://img.shields.io/badge/-React%20Router-CA4245?logo=react-router&style=for-the-badge&logoColor=white)](https://reactrouter.com/)
[![Expo](https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev/)

> The Django badge was removed: the Python backend is deprecated in this fork.

---

## 🙏 Credits & upstream

This project is built on top of **[Plane](https://github.com/makeplane/plane)**. All of Plane's
original features, documentation, and design are the work of the Plane team and contributors.
Please support the upstream project:

- Website: [plane.so](https://plane.so/)
- Repository: [github.com/makeplane/plane](https://github.com/makeplane/plane)
- Docs: [docs.plane.so](https://docs.plane.so/) · [developers.plane.so](https://developers.plane.so/)

## 🛡️ Security

If you discover a security vulnerability, please report it responsibly instead of opening a
public issue. For vulnerabilities in **upstream Plane**, follow Plane's
[security policy](https://github.com/makeplane/plane/blob/master/SECURITY.md).

## 📜 License

This project is licensed under the **[GNU Affero General Public License v3.0](./LICENSE.txt)** —
the same license as upstream Plane. As required by the AGPL-3.0, the source of our modifications
is published here and remains available to all users who interact with the software over a
network.
