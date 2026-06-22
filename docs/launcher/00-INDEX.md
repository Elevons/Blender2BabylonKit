# Babylon Launcher — Documentation

The **Babylon Launcher** (`tools/babylon-launcher/`, npm workspace `@bjs/babylon-launcher`)
is a small self-hosted web hub for day-to-day work in the monorepo. It discovers
apps under `apps/`, starts and stops the per-app Vite dev server, manages the
**bjs-mcp** behavior-authoring server for Cursor, scaffolds new projects, and
browses JSON asset folders next to each level.

It does **not** embed Babylon.js editors. Author GUI, materials, particles, and
similar assets with the [online Babylon editors](https://doc.babylonjs.com/) or
your own workflow, then place the exported `.json` files in the project's asset
folders (see [Projects & assets](01-LAUNCHER.md#projects-and-assets)).

## Quick start

From the repo root:

```bash
npm install
npm run launcher:dev
```

Open **http://localhost:3200** (override with `LAUNCHER_PORT`).

Production build (serves the compiled React client from `dist/client/`):

```bash
npm run launcher:build
npm run launcher:start
```

## Chapters

1. [Launcher](01-LAUNCHER.md) — hub UI, services, projects, assets, REST API, and server layout

## Related docs

- [Workflow & tooling](../engine/08-WORKFLOW.md) — Live Link, validator, monorepo commands
- [Architecture](../engine/01-ARCHITECTURE.md) — two-artifact export model and repo layout
