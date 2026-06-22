import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer as createViteServer } from "vite";

import { CreateApiApp } from "./api.js";
import { LAUNCHER_PORT } from "./paths.js";

const launcherRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function Main(): Promise<void>
{
  const app = express();
  app.use(CreateApiApp());

  const vite = await createViteServer({
    configFile: path.join(launcherRoot, "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "spa",
  });

  app.use(vite.middlewares);

  const server = app.listen(LAUNCHER_PORT, () =>
  {
    console.log(`Babylon Editor Launcher: http://localhost:${LAUNCHER_PORT}`);
  });

  server.on("error", (error: NodeJS.ErrnoException) =>
  {
    if (error.code === "EADDRINUSE")
    {
      console.error(
        `Port ${LAUNCHER_PORT} is already in use (another launcher may still be running).\n` +
        `Stop it with: fuser -k ${LAUNCHER_PORT}/tcp\n` +
        `Or use another port: LAUNCHER_PORT=3201 npm run launcher:dev`,
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
