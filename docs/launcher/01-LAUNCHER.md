# 01 — Babylon Launcher

[← Index](00-INDEX.md)

## What it is

The launcher is a **local control panel** for Blender2BabylonKit projects. One
Express server exposes a JSON REST API and (in development) Vite middleware for
the React hub. The hub lets you:

- Pick a project and level
- Create a new app from the playground template
- Start/stop the game's Vite dev server and open the runtime preview
- Build, start, stop, and copy Cursor config for **bjs-mcp**
- List JSON files in per-level asset folders (`gui/`, `particles/`, …)

Nothing in the launcher runs inside the game runtime. It only orchestrates
processes and reads/writes files under `apps/<name>/`.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser  →  http://localhost:3200                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
         ┌──────────────────┴──────────────────┐
         │  Express (CreateApiApp)               │
         │  /api/*  →  projects, dev, mcp, assets│
         └──────────────────┬──────────────────┘
                            │
    dev: Vite middleware (server/dev.ts)  →  React hub (src/hub/)
    prod: express.static(dist/client)     →  prebuilt hub (server/index.ts)
```

| Piece | Location | Role |
|-------|----------|------|
| Hub UI | `src/hub/` | React panels: project picker, services, assets |
| API client | `src/api/client.ts` | `fetch` wrappers for `/api/*` |
| REST routes | `server/api.ts` | Express router |
| Project discovery | `server/projects.ts` | Scan `apps/`, dev-server child processes |
| Project scaffold | `server/createProject.ts` | Shell out to `scripts/create-app.mjs` |
| MCP control | `server/mcp.ts` | Build/start `tools/bjs-mcp` |
| Asset I/O | `server/assets.ts` | List/read/write JSON under level roots |
| Docs | `server/docs.ts` | Build and serve `docs/` at `/docs` |
| Paths & manifest | `server/paths.ts` | `REPO_ROOT`, `APPS_DIR`, `babylon-project.json` |

**Development** (`npm run launcher:dev` → `server/dev.ts`): API is mounted first,
then Vite runs in middleware mode so the hub hot-reloads.

**Production** (`npm run launcher:start` → `server/index.ts`): API plus static
files from `dist/client/`; unknown paths fall through to `index.html`.

Default port: **3200** (`LAUNCHER_PORT` env var). Each game's Vite port comes
from that app's `babylon-project.json` (`dev.port`, default **5173**).

## Hub UI

### Documentation panel

Repo-wide (not tied to a project). **Build Docs** runs `npm run docs:build` at
the repo root, regenerating the interactive HTML under `docs/` (engine diagrams,
Blender traces, searchable landing page). **View Docs** opens `/docs/` on the
launcher host — static files are served from `docs/` by the same Express server.

Docs are considered built when `docs/index.html` exists.

### Project panel

On load, the hub calls `GET /api/projects` and fills the project dropdown.
Projects are every directory under `apps/` that has a `package.json`. Optional
`babylon-project.json` in the app root supplies display title, default level, dev
port, and the Blender Live Link export path hint shown in the UI.

The **level** dropdown lists subdirectories of `apps/<project>/public/levels/`,
plus a synthetic **Workspace (pre-export staging)** entry (`_workspace` in the
API), which maps to `apps/<project>/public/workspace/`.

**Create Project** opens a wizard that `POST`s to `/api/projects` with `name`,
optional `title`, `level`, and `template` (`empty` | `minimal` | `sample`). The
server runs `scripts/create-app.mjs`; `sample` additionally copies `.ts`
behavior files from `apps/playground/src/behaviors/`.

### Services panel

Polls `GET /api/services/:app` every three seconds.

**Game Dev Server (Vite)** — `Start` runs `npm run dev --workspace apps/<app>`
from the repo root as a detached child. The launcher tracks the PID when it
spawned the process; it also probes the configured TCP port to detect an already-
running server (e.g. started manually). `Stop` sends `SIGTERM` to the process
group, then on Linux runs `fuser -k <port>/tcp` if the port is still open.
**Open Runtime Preview** links to `http://localhost:<dev.port>` when the port
accepts connections.

**bjs-mcp (Behavior Authoring)** — **Build** runs `npm run mcp:build` at the
repo root. **Start** launches `node tools/bjs-mcp/dist/index.js` (builds first if
needed). **Copy Cursor Config** writes the stdio MCP snippet for
`bjs-level-kit` (command, args, cwd) to the clipboard — paste into
`~/.cursor/mcp.json`.

**Start All Services** / **Stop All Services** call the combined endpoints that
run dev + MCP in parallel.

### Assets panel

When a project is selected, `GET /api/projects/:app/assets/:level` lists `.json`
files in each known asset folder (see below). The UI is read-only: it shows
folder names and filenames. Writes go through the REST API (`PUT`) if you build
tooling on top; the hub does not edit files.

## Projects and assets

### `babylon-project.json`

Optional manifest at `apps/<name>/babylon-project.json`:

```json
{
  "name": "playground",
  "title": "Playground",
  "defaultLevel": "Train Scene",
  "assetFolders": ["gui", "particles", "materials", "geometry", "filters", "render-graphs"],
  "dev": { "port": 5173 },
  "blenderExportPath": "apps/playground/public/levels/"
}
```

| Field | Purpose |
|-------|---------|
| `name` | Canonical app id (defaults to `package.json` name or folder name) |
| `title` | Display name in the hub |
| `defaultLevel` | Level pre-selected when it exists under `public/levels/` |
| `assetFolders` | Declared in manifest; server uses fixed `ASSET_FOLDERS` in `paths.ts` |
| `dev.port` | Vite port for start/stop/status |
| `blenderExportPath` | Shown as the Live Link target path in the hub |

New projects created via `create-app.mjs` get a manifest with default asset
folders and `dev.port`.

### Level roots and asset folders

Asset paths resolve through `WorkspaceAssetRoot()` in `server/paths.ts`:

| Level selector | Filesystem root |
|----------------|-----------------|
| `_workspace` | `apps/<app>/public/workspace/` |
| `<level name>` | `apps/<app>/public/levels/<level>/` |

Under each root, these subfolders are scanned (constants in `ASSET_FOLDERS`):

| Folder | Typical content |
|--------|-----------------|
| `gui/` | GUI editor JSON |
| `particles/` | Node particle system sets (`.json`; image files such as `.png` can sit beside them but are not listed in the launcher) |
| `materials/` | Node material graphs |
| `geometry/` | Node geometry graphs |
| `filters/` | Smart filter graphs |
| `render-graphs/` | Node render graph JSON |

Only **`.json`** files are listed. `WriteAsset` rejects non-`.json` names.
Filenames and folder segments are sanitized; resolved paths must stay inside the
level root (`IsPathInside`).

These folders sit **beside** the exported `level.glb` and `level.scene.json` for
a level — they are not embedded in the glTF export. The runtime loads them when
your game code or manifest references them.

## REST API

All routes are under `/api`. Errors return JSON `{ "error": "message" }` with an
appropriate status code.

### Health

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/api/health` | `{ "ok": true }` |

### Projects

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects` | Array of `ProjectSummary` |
| `GET` | `/api/projects/:app/levels` | Level directory names |
| `POST` | `/api/projects` | Body: `{ name, title?, level?, template? }` → `201` + `{ name, path, blenderExportPath }` |

`ProjectSummary`: `name`, `title`, `defaultLevel?`, `devPort`, `blenderExportPath`, `hasLevels`.

### Assets

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects/:app/assets/:level` | All folders → filename arrays |
| `GET` | `/api/projects/:app/assets/:level?folder=gui` | Single folder listing |
| `GET` | `/api/projects/:app/assets/:level/:folder/:file` | Raw JSON file body |
| `PUT` | `/api/projects/:app/assets/:level/:folder/:file` | Write JSON; body string or object → `{ path, relative }` |

`:level` is the level folder name or `_workspace`.

### Dev server

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/dev/:app` | `DevServerStatus` |
| `POST` | `/api/dev/:app/start` | Start Vite if port closed |
| `POST` | `/api/dev/:app/stop` | Stop managed process / free port |

`DevServerStatus`: `app`, `port`, `running`, `pid?`, `url?`, `managed`.

### MCP

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/mcp` | `McpStatus` (built, running, pid, paths, `cursorConfig`) |
| `POST` | `/api/mcp/build` | `npm run mcp:build` |
| `POST` | `/api/mcp/start` | Start MCP server |
| `POST` | `/api/mcp/stop` | Stop MCP server |

### Combined services

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/services/:app` | `{ dev, mcp }` |
| `POST` | `/api/services/:app/start-all` | Start dev + MCP |
| `POST` | `/api/services/:app/stop-all` | Stop dev + MCP |

### Documentation

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/docs` | `DocsStatus` (`built`, `indexPath`, `url`) |
| `POST` | `/api/docs/build` | Run `docs:build`; returns updated status |

Built HTML is served at **`/docs/`** (e.g. `http://localhost:3200/docs/`).

## Typical workflow

1. **Export from Blender** — point Live Link at
   `apps/<project>/public/levels/<level>/` (path shown in the hub).
2. **Start services** — in the launcher, **Start All Services** (or start dev
   only if you do not need MCP).
3. **Open runtime preview** — follow the Vite link; Live Link re-exports trigger
   a full reload via the app's Vite plugin ([Workflow](../engine/08-WORKFLOW.md#live-link)).
4. **Author behaviors** — with MCP running, use Cursor and the `bjs-level-kit`
   tools; paste MCP config once per machine.
5. **Drop sidecar JSON** — save editor exports into the matching asset folder
   under the level (or workspace) and confirm they appear in the Assets panel.

## Commands (repo root)

| Script | Action |
|--------|--------|
| `npm run launcher:dev` | Dev server on port 3200 (API + Vite HMR) |
| `npm run launcher:build` | `tsc` server + `vite build` client → `dist/` |
| `npm run launcher:start` | Production server (`NODE_ENV=production`) |

Equivalent from the workspace: `npm run dev --workspace @bjs/babylon-launcher`, etc.

## Environment and troubleshooting

| Variable | Default | Effect |
|----------|---------|--------|
| `LAUNCHER_PORT` | `3200` | Hub listen port |

If port 3200 is in use, the dev server prints a hint to free it (`fuser -k
3200/tcp` on Linux) or set `LAUNCHER_PORT=3201`.

Dev-server stop uses `fuser` on Linux only; on Windows, stopping relies on
process signals to the spawned child.

The launcher assumes it runs from a full git checkout with `apps/`, `scripts/`,
and `tools/bjs-mcp/` present. It is not a standalone npm package outside this
monorepo.

## Source layout

```
tools/babylon-launcher/
  index.html              # SPA shell
  package.json            # @bjs/babylon-launcher
  vite.config.ts          # Client build; middlewareMode in dev
  tsconfig.json           # React client
  tsconfig.server.json    # Express server → dist/server/
  server/
    dev.ts                # Dev entry (Vite + API)
    index.ts              # Production entry (static + API)
    api.ts                # Route table
    projects.ts           # List projects/levels; dev process management
    createProject.ts      # create-app.mjs wrapper
    mcp.ts                # bjs-mcp lifecycle
    assets.ts             # Asset list/read/write
    docs.ts               # docs:build + static /docs mount
    paths.ts              # Repo paths, manifest types, asset folders
  src/
    main.tsx              # React mount
    api/client.ts         # Browser API client
    hub/
      App.tsx             # Main hub layout
      AssetBrowser.tsx    # Asset listing
      CreateProjectWizard.tsx
      DocsPanel.tsx       # Build + view documentation
      ServicesPanel.tsx   # Dev + MCP controls
    styles/hub.css
```

Continue: [← Index](00-INDEX.md)
