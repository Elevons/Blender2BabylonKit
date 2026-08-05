import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

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

interface ProjectManifestFile
{
  defaultLevel?: string;
  levels?: {
    include?: string[];
    start?: string;
    startManifest?: string;
  };
}

interface BootPayload
{
  startLevel: string;
  manifestPath: string;
}

/**
 * Read babylon-project.json and build the boot payload that names the first
 * level to load. All path computation lives here — app code only fetches the
 * JSON and prepends import.meta.env.BASE_URL.
 */
function ReadBootPayload(projectRoot: string): BootPayload
{
  const manifestPath = path.resolve(projectRoot, "babylon-project.json");
  if (!fs.existsSync(manifestPath))
  {
    throw new Error(
      `babylon-project.json missing at ${manifestPath} — cannot build bjs-boot.json`,
    );
  }

  const projectManifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8"),
  ) as ProjectManifestFile;

  const startLevel = projectManifest.levels?.start ?? projectManifest.defaultLevel;
  if (startLevel === undefined || startLevel === "")
  {
    throw new Error(
      `babylon-project.json at ${manifestPath} has neither levels.start nor defaultLevel`,
    );
  }

  const startManifest = projectManifest.levels?.startManifest ?? `${startLevel}.scene.json`;
  return {
    startLevel,
    manifestPath: `levels/${startLevel}/${startManifest}`,
  };
}

/**
 * Serve / emit bjs-boot.json so the app boots from babylon-project.json instead
 * of a hardcoded level path. Dev re-reads on every request; build emits an
 * asset. Changing babylon-project.json triggers a full page reload.
 */
function ServeBootManifest(): Plugin
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
    name: "bjs-serve-boot-manifest",
    configureServer(server)
    {
      const projectManifestPath = path.resolve(server.config.root, "babylon-project.json");
      server.watcher.add(projectManifestPath);

      server.middlewares.use((request, response, next) =>
      {
        const requestUrl = request.url ?? "";
        if (requestUrl !== "/bjs-boot.json" && !requestUrl.startsWith("/bjs-boot.json?"))
        {
          next();
          return;
        }

        try
        {
          const payload = ReadBootPayload(server.config.root);
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify(payload, null, 2));
        }
        catch (error)
        {
          response.statusCode = 500;
          response.end(JSON.stringify({ error: (error as Error).message }));
        }
      });

      const onFsEvent = (changedPath: string): void =>
      {
        if (path.resolve(changedPath) === projectManifestPath)
        {
          ScheduleReload(server);
        }
      };
      server.watcher.on("change", onFsEvent);
      server.watcher.on("add", onFsEvent);
    },
    generateBundle()
    {
      const projectRoot = path.resolve(process.cwd());
      const payload = ReadBootPayload(projectRoot);
      this.emitFile({
        type: "asset",
        fileName: "bjs-boot.json",
        source: JSON.stringify(payload, null, 2),
      });
    },
  };
}

// Havok ships a .wasm that must be served. Excluding it from dep-optimization
// lets Vite resolve the wasm URL correctly in dev and build.
export default defineConfig({
  optimizeDeps: { exclude: ["@babylonjs/havok"] },
  server: {
    port: 5173,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  plugins: [ReloadOnLevelExport(), ServeBootManifest()],
});
