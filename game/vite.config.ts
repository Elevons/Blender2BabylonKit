import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

const GAME_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * True for any file under public/levels. Vite/chokidar paths may be relative
 * (`public/levels/...`) or absolute — avoid matching on `/public/levels/` only.
 */
function IsLevelAsset(changedPath: string, root: string): boolean
{
  const absolute = path.resolve(root, changedPath);
  const levelsDir = path.resolve(root, "public/levels");
  return absolute.startsWith(levelsDir + path.sep) && absolute !== levelsDir;
}

/**
 * Reload the browser whenever an exported level changes in public/levels.
 * Vite serves public/ statically without watching it for HMR, so this plugin
 * closes the loop for the Blender add-on's Live Link: save in Blender ->
 * re-export -> full page reload.
 *
 * Watches the whole level folder (glb, env/, manifest, …), not only
 * .scene.json — so a replaced HDR still reloads when manifest bytes are unchanged.
 */
function ReloadOnLevelExport(): Plugin
{
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;

  function ScheduleReload(server: ViteDevServer): void
  {
    clearTimeout(reloadTimer);
    // Debounce: one export touches glb, env/, and .scene.json in quick succession.
    reloadTimer = setTimeout(() =>
    {
      server.ws.send({ type: "full-reload" });
    }, 50);
  }

  return {
    name: "bjs-reload-on-level-export",
    configureServer(server)
    {
      const levelsDir = path.resolve(server.config.root, "public/levels");
      server.watcher.add(levelsDir);
      const onFsEvent = (changedPath: string): void =>
      {
        if (IsLevelAsset(changedPath, server.config.root))
        {
          ScheduleReload(server);
        }
      };
      server.watcher.on("change", onFsEvent);
      server.watcher.on("add", onFsEvent);
    },
  };
}

/**
 * Replace the Inspector entry point before dependency traversal when publishing
 * without developer tools. TypeScript still checks calls against the real package.
 */
function ExcludeDeveloperTools(): Plugin
{
  const virtualInspectorId = "\0bjs-disabled-inspector";

  return {
    name: "bjs-exclude-developer-tools",
    enforce: "pre",
    resolveId(source)
    {
      if (
        process.env.VITE_INCLUDE_DEVELOPER_TOOLS === "false" &&
        source === "@babylonjs/inspector"
      )
      {
        return virtualInspectorId;
      }

      return null;
    },
    load(id)
    {
      if (id === virtualInspectorId)
      {
        return "export const Inspector = undefined;";
      }

      return null;
    },
  };
}

// Havok ships a .wasm that must be served. Excluding it from dep-optimization
// lets Vite resolve the wasm URL correctly in dev and build.
export default defineConfig({
  resolve: {
    // The published package points at dist/. Inside the kit monorepo, use live
    // engine TypeScript so engine edits still hot-reload without a build step.
    alias: {
      "@bjs/engine": path.resolve(GAME_DIR, "../packages/engine/src/index.ts"),
    },
  },
  optimizeDeps: { exclude: ["@babylonjs/havok"] },
  // strictPort: the panel probes the configured port, so silently moving to the
  // next free one would leave it reporting a server it cannot see.
  server: { port: 5173, strictPort: true },
  plugins: [ReloadOnLevelExport(), ExcludeDeveloperTools()],
});
