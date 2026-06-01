# @mateusseiboth/widgets-aviao

SDK for building widgets for the **Avião** widget marketplace. Provides React
hooks (`useWorkerItems`, `useIntakes`, `useStats`, `useUsers`, `useEntities`) and
the `window.WidgetSDK` runtime, all gated by the permissions declared in a
widget's `manifest.json`.

## Install

This package is **not** published to the public npm registry. It is built on
every commit by the [`widget-sdk` GitHub Action](../../.github/workflows/widget-sdk.yml)
and stored in this repository. Install it one of two ways:

### From GitHub Packages

Add the scope to an `.npmrc` (needs a GitHub token with `read:packages`):

```ini
@mateusseiboth:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```bash
npm install @mateusseiboth/widgets-aviao
```

### Tokenless, from the release tarball

```bash
npm install https://github.com/mateusseiboth/plane/releases/download/widget-sdk-latest/widgets-aviao.tgz
```

The `widget-sdk-latest` pre-release is refreshed on every build, and a versioned
tarball is also attached to each workflow run as an artifact.

## Develop

```bash
pnpm --filter @mateusseiboth/widgets-aviao build      # one-off build
pnpm --filter @mateusseiboth/widgets-aviao dev        # watch mode
pnpm --filter @mateusseiboth/widgets-aviao typecheck
```

See [`docs/widget-development-guide.md`](../../docs/widget-development-guide.md) and
the in-app docs page at `/<workspace>/developers/widgets` for the full guide.
