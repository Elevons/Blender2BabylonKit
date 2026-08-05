import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

import { CreateApiApp } from "./api.js";
import { CONTROL_PANEL_PORT } from "./paths.js";

const controlPanelRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = path.join(controlPanelRoot, "dist", "client");

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

app.listen(CONTROL_PANEL_PORT, () =>
{
  console.log(`Project Control Panel (production): http://localhost:${CONTROL_PANEL_PORT}`);
});
