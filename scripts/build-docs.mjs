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
 * Prose:    scripts/docs/prose/content/*.html → docs/engine|control-panel chapter pages
 * MCP:      npm run mcp:index → tools/bjs-mcp/data/doc-embeddings.json
 */
import { BuildEngineDocs } from "./build-trace-docs.mjs";
import { BuildBlenderDocs } from "./build-blender-docs.mjs";
import { BuildProseDocs } from "./build-prose-docs.mjs";
import { BuildLandingPage } from "./build-landing.mjs";
import { StampMetaMarkdown } from "./stamp-meta-md.mjs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

BuildEngineDocs();
BuildBlenderDocs();
BuildProseDocs();
StampMetaMarkdown();
BuildLandingPage();

const indexResult = spawnSync("npm", ["run", "mcp:index"], {
  cwd: ROOT,
  stdio: "inherit",
});
if (indexResult.status !== 0)
{
  process.exit(indexResult.status ?? 1);
}

for (const script of ["scripts/docs/validate-docs.mjs", "scripts/check-doc-links.mjs"])
{
  const result = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (result.status !== 0)
  {
    process.exit(result.status ?? 1);
  }
}

console.log("docs:build complete");
