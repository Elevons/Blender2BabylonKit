import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

import { CreateApiApp } from "./api.js";
import { LAUNCHER_PORT } from "./paths.js";

const launcherRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = path.join(launcherRoot, "dist", "client");

const app = express();
app.use(CreateApiApp());
app.use(express.static(clientDir));

app.get("*", (req, res) =>
{
  if (req.path.startsWith("/api") || req.path.startsWith("/docs"))
  {
    res.status(404).send("Not found");
    return;
  }
  res.sendFile(path.join(clientDir, "index.html"));
});

app.listen(LAUNCHER_PORT, () =>
{
  console.log(`Babylon Launcher (production): http://localhost:${LAUNCHER_PORT}`);
});
