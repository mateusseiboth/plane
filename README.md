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
| **Technical visits** | — | Dedicated screen + API: schedule visits, two technicians, motivation flags, link to issues, write visit reports, list & **calendar** views. |
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
| **Client portal** | — | **Public request portal** (`/portal?workspace=<slug>`) with its own login: the client picks a system, opens a request and follows its status. Own account model (no Plane seat), requests land in the project's **intake/triage**. |

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
