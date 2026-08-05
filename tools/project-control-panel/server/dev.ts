import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer as createViteServer } from "vite";

import { CreateApiApp } from "./api.js";
import { CONTROL_PANEL_PORT } from "./paths.js";

const controlPanelRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function Main(): Promise<void>
{
  const app = express();
  app.use(CreateApiApp());

  const vite = await createViteServer({
    configFile: path.join(controlPanelRoot, "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "spa",
  });

  app.use(vite.middlewares);

  const server = app.listen(CONTROL_PANEL_PORT, () =>
  {
    console.log(`Project Control Panel: http://localhost:${CONTROL_PANEL_PORT}`);
  });

  server.on("error", (error: NodeJS.ErrnoException) =>
  {
    if (error.code === "EADDRINUSE")
    {
      console.error(
        `Port ${CONTROL_PANEL_PORT} is already in use (another Project Control Panel may still be running).\n` +
        `Stop it with: fuser -k ${CONTROL_PANEL_PORT}/tcp\n` +
        `Or use another port: CONTROL_PANEL_PORT=3201 npm run control-panel:dev`,
      );
      process.exit(1);
    }
    throw error;
  });
}

Main().catch((error) =>
{
  console.error(error);
  process.exit(1);
});
