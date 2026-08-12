# b2bkit

Babylon Level Kit runtime — loads Blender-exported `.scene.json` + `.glb` levels.

**Elevons LLC** · [elevons.design](https://elevons.design)

This package is the publishable kit surface:

- **Runtime** — `import { LevelLoader, Behavior, … } from "b2bkit"`
- **Blender add-on** — `npx b2bkit-addon-path` prints the Install-from-Disk zip
- **Project Control Panel** — `npx b2bkit-control-panel` (from a project root that contains `game/`)
- **MCP server** — `npx b2bkit-mcp` reads the current project's `game/` folder
- **Documentation** — the control panel serves the versioned site at `/docs/`

In this monorepo, day-to-day development imports live TypeScript from `src/`.
`npm pack` and `npm run release` both run `scripts/assemble-kit-package.mjs`,
which rebuilds the documentation site and the MCP doc-embedding index, then
bundles the engine, control panel, MCP server, docs, and Blender add-on zip.
Release with:

```bash
npm run release -- --version X.Y.Z          # build + pack (no publish)
npm run release -- --version X.Y.Z --publish
```

See [Create a game with the published kit](../../docs/CREATE-A-GAME.html).
