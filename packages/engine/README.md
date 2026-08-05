# @bjs/engine

Babylon Level Kit runtime — loads Blender-exported `.scene.json` + `.glb` levels.

This package is the publishable kit surface:

- **Runtime** — `import { LevelLoader, Behavior, … } from "@bjs/engine"`
- **Blender add-on** — `npx b2bkit-addon-path` prints the Install-from-Disk zip
- **Project Control Panel** — `npx b2bkit-control-panel` (from a project root that contains `game/`)

In this monorepo, day-to-day development imports live TypeScript from `src/`.
`npm run build` emits `dist/` for publish. Release with:

```bash
npm run release -- --version X.Y.Z          # build + pack (no publish)
npm run release -- --version X.Y.Z --publish
```

See [Create a game with the published kit](../../docs/CREATE-A-GAME.html).
