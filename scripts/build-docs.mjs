#!/usr/bin/env node
/**
 * Regenerate all interactive HTML documentation from the shared shell template.
 *
 *   npm run docs:build   (or: node scripts/build-docs.mjs)
 *
 * Template:  docs/_template/diagram-shell.html  (viewer CSS/JS — edit once)
 * Engine data: scripts/docs/engine-areas.mjs + build-trace-docs.mjs traces
 * Blender data: build-blender-docs.mjs area + trace definitions
 * Landing:  scripts/build-landing.mjs → docs/index.html (searchable index)
 * Prose:    scripts/docs/prose/content/*.html → docs/engine|launcher chapter pages
 */
import { BuildEngineDocs } from "./build-trace-docs.mjs";
import { BuildBlenderDocs } from "./build-blender-docs.mjs";
import { BuildProseDocs } from "./build-prose-docs.mjs";
import { BuildLandingPage } from "./build-landing.mjs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

BuildEngineDocs();
BuildBlenderDocs();
BuildProseDocs();
BuildLandingPage();

const linkCheck = spawnSync(process.execPath, ["scripts/check-doc-links.mjs"], {
  cwd: ROOT,
  stdio: "inherit",
});
if (linkCheck.status !== 0)
{
  process.exit(linkCheck.status ?? 1);
}

console.log("docs:build complete");
