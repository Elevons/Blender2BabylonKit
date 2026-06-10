import { defineConfig, type Plugin } from "vite";

/**
 * Reload the browser whenever an exported level changes in public/levels.
 * Vite serves public/ statically without watching it for HMR, so this plugin
 * closes the loop for the Blender add-on's Live Link: save in Blender ->
 * re-export -> full page reload. The .scene.json write is the trigger (the
 * exporter writes it after the .glb, so both files are ready by then).
 */
function ReloadOnLevelExport(): Plugin
{
  return {
    name: "bjs-reload-on-level-export",
    configureServer(server)
    {
      server.watcher.add("public/levels");
      server.watcher.on("change", (changedPath) =>
      {
        if (changedPath.endsWith(".scene.json"))
        {
          server.ws.send({ type: "full-reload" });
        }
      });
      server.watcher.on("add", (addedPath) =>
      {
        if (addedPath.endsWith(".scene.json"))
        {
          server.ws.send({ type: "full-reload" });
        }
      });
    },
  };
}

// Havok ships a .wasm that must be served. Excluding it from dep-optimization
// lets Vite resolve the wasm URL correctly in dev and build.
export default defineConfig({
  optimizeDeps: { exclude: ["@babylonjs/havok"] },
  server: { port: 5173 },
  plugins: [ReloadOnLevelExport()],
});
