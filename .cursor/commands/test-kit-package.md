# Test the kit package in a consumer project

Build the publishable kit and verify it works from a real outside project, then
report the URLs to open.

## Run it

```bash
npm run kit:test
```

That single command does everything:

1. `npm pack --workspace @bjs/engine` — the `prepack` hook runs
   `scripts/assemble-kit-package.mjs`, which rebuilds the documentation site and
   the MCP vector index (`doc-embeddings.json`), builds the engine, control
   panel, and `bjs-mcp`, and packs the Blender add-on zip.
2. Installs that tarball into the test project (`../B2BKitTest` by default).
3. Verifies the bundled assets: docs site, MCP server, vector index and its
   freshness, Blender add-on zip, and the three CLI bins.
4. Starts the packaged control panel, then starts the game dev server *through
   the panel API* so the dev-server health check is exercised.
5. Probes `/api/mcp`, `/api/docs`, the served docs site, and confirms the
   removed `POST /api/docs/build` returns 404.

Servers are left running. Print the three URLs from the script output.

## Options

```bash
npm run kit:test -- --project /path/to/other-project
npm run kit:test -- --panel-port 3210
npm run kit:test -- --skip-pack              # reuse the installed tarball
npm run kit:test -- --stop                   # stop panel + dev server
```

## Reporting

Lead with pass/fail and the URLs. Each check prints `[PASS]` or `[FAIL]`; the
script exits non-zero if any failed.

If something fails:

- **Panel did not start** — read the panel log path printed by the script.
- **Port busy / dev server unhealthy** — another project's Vite holds the port.
  The panel names the offending pid; both games use `strictPort`, so a collision
  fails loudly rather than drifting to another port. Run with `--stop`, or pick a
  different `dev.port` in the project's `b2bkit-project.json`.
- **Stale docs or MCP index** — should be impossible, since assembly always
  rebuilds them. If the freshness check fails, look at
  `scripts/assemble-kit-package.mjs`.
- **Docs build fails on a `MISSING:` symbol** — a traced function was renamed.
  Update the matching entry in `TRACES` in `scripts/build-trace-docs.mjs` or
  `scripts/build-blender-docs.mjs`.

Do not commit anything unless asked. The test project's `package.json` will
point at the local tarball; that is expected.
