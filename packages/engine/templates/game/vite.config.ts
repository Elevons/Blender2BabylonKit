import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

const GAME_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * True for any file under public/levels. Vite/chokidar paths may be relative
 * (`public/levels/...`) or absolute.
 */
function IsLevelAsset(changedPath: string, root: string): boolean
{
  const absolute = path.resolve(root, changedPath);
  const levelsDir = path.resolve(root, "public/levels");
  return absolute.startsWith(levelsDir + path.sep) && absolute !== levelsDir;
}

/**
 * Reload the browser whenever an exported level changes in public/levels
 * (Blender Live Link).
 */
function ReloadOnLevelExport(): Plugin
{
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;

  function ScheduleReload(server: ViteDevServer): void
  {
    clearTimeout(reloadTimer);
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
 * Replace the Inspector entry when publishing without developer tools.
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

// Production uses base './' so dist/ is portable under any host path.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "./" : "/",
  root: GAME_DIR,
  optimizeDeps: { exclude: ["@babylonjs/havok"] },
  server: { port: 5173, strictPort: true },
  plugins: [ReloadOnLevelExport(), ExcludeDeveloperTools()],
}));
