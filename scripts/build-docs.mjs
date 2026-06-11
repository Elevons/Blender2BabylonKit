#!/usr/bin/env node
/**
 * Regenerate all interactive HTML documentation from the shared shell template.
 *
 *   npm run docs:build   (or: node scripts/build-docs.mjs)
 *
 * Template:  docs/_template/diagram-shell.html  (viewer CSS/JS — edit once)
 * Engine data: scripts/docs/engine-areas.mjs + build-trace-docs.mjs traces
 * Blender data: build-blender-docs.mjs area + trace definitions
 */
import { BuildEngineDocs } from "./build-trace-docs.mjs";
import { BuildBlenderDocs } from "./build-blender-docs.mjs";

BuildEngineDocs();
BuildBlenderDocs();
console.log("docs:build complete");
