#!/usr/bin/env node
/**
 * Structural checks for the documentation source tree (no HTML regen).
 *
 *   npm run docs:validate
 *
 * Catches common contributor mistakes before or after a full docs:build:
 * missing prose fragments, broken prev/next chain, pages missing from PAGE_TOPICS.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PROSE_CHAPTERS } from "./prose/manifest.mjs";
import { PAGE_TOPICS } from "./topics.mjs";
import { KEPT_META_MD } from "./prose-config.mjs";
import { ENGINE_AREA_PAGES } from "./engine-areas.mjs";
import { TRACES as ENGINE_TRACES } from "../build-trace-docs.mjs";
import { AREA_PAGES as BLENDER_AREA_PAGES, TRACES as BLENDER_TRACES } from "../build-blender-docs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTENT_DIR = path.join(ROOT, "scripts/docs/prose/content");

/** @type {string[]} */
const errors = [];

/** @type {string[]} */
const warnings = [];

function RequirePageTopics(href, label)
{
  if (!(href in PAGE_TOPICS))
  {
    errors.push(`${label} missing from PAGE_TOPICS in scripts/docs/topics.mjs → "${href}"`);
  }
  else if ((PAGE_TOPICS[href] ?? []).length === 0)
  {
    errors.push(`${label} has empty topic list in PAGE_TOPICS → "${href}"`);
  }
}

function ValidateProseFragments()
{
  for (const chapter of PROSE_CHAPTERS)
  {
    const fragmentPath = path.join(CONTENT_DIR, chapter.fragment);
    if (!fs.existsSync(fragmentPath))
    {
      errors.push(`missing prose fragment → scripts/docs/prose/content/${chapter.fragment} (${chapter.href})`);
    }

    RequirePageTopics(chapter.href, `prose chapter ${chapter.href}`);
  }
}

function ValidateEngineChapterChain()
{
  const numbered = PROSE_CHAPTERS.filter((chapter) =>
    /^engine\/\d+-/.test(chapter.href) && chapter.layout !== "meta");
  const byBasename = new Map(numbered.map((chapter) =>
    [path.basename(chapter.href), chapter]));

  for (const chapter of numbered)
  {
    const basename = path.basename(chapter.href);

    if (chapter.prev !== undefined && chapter.prev !== null)
    {
      const prevChapter = byBasename.get(chapter.prev);
      if (prevChapter === undefined)
      {
        errors.push(`manifest prev "${chapter.prev}" not found (from ${chapter.href})`);
      }
      else if (prevChapter.next !== basename)
      {
        errors.push(`prev/next mismatch: ${chapter.href} prev→${chapter.prev}, but ${chapter.prev} next→${prevChapter.next ?? "null"}`);
      }
    }

    if (chapter.next !== undefined && chapter.next !== null)
    {
      const nextChapter = byBasename.get(chapter.next);
      if (nextChapter === undefined)
      {
        errors.push(`manifest next "${chapter.next}" not found (from ${chapter.href})`);
      }
      else if (nextChapter.prev !== basename)
      {
        errors.push(`prev/next mismatch: ${chapter.href} next→${chapter.next}, but ${chapter.next} prev→${nextChapter.prev ?? "null"}`);
      }
    }
  }

  const indexChapter = PROSE_CHAPTERS.find((chapter) => chapter.href === "engine/00-INDEX.html");
  if (indexChapter !== undefined && indexChapter.next !== "01-ARCHITECTURE.html")
  {
    errors.push(`engine/00-INDEX.html should next→01-ARCHITECTURE.html (got ${indexChapter.next ?? "null"})`);
  }

  const lastChapter = PROSE_CHAPTERS.find((chapter) => chapter.href === "engine/14-API-GUIDE.html");
  if (lastChapter !== undefined && lastChapter.next !== undefined && lastChapter.next !== null)
  {
    errors.push("engine/14-API-GUIDE.html should be the last engine chapter (next should be omitted)");
  }
}

function ValidateBlenderChapterChain()
{
  const numbered = PROSE_CHAPTERS.filter((chapter) =>
    /^blender\/0[1-4]-/.test(chapter.href));
  const prose = PROSE_CHAPTERS.filter((chapter) =>
    chapter.href.startsWith("blender/"));
  const byBasename = new Map(prose.map((chapter) =>
    [path.basename(chapter.href), chapter]));

  for (const chapter of prose)
  {
    const basename = path.basename(chapter.href);

    if (chapter.prev !== undefined && chapter.prev !== null)
    {
      const prevChapter = byBasename.get(chapter.prev);
      if (prevChapter === undefined)
      {
        errors.push(`manifest prev "${chapter.prev}" not found (from ${chapter.href})`);
      }
      else if (prevChapter.next !== basename)
      {
        errors.push(`prev/next mismatch: ${chapter.href} prev→${chapter.prev}, but ${chapter.prev} next→${prevChapter.next ?? "null"}`);
      }
    }

    if (chapter.next !== undefined && chapter.next !== null)
    {
      const nextChapter = byBasename.get(chapter.next);
      if (nextChapter === undefined)
      {
        errors.push(`manifest next "${chapter.next}" not found (from ${chapter.href})`);
      }
      else if (nextChapter.prev !== basename)
      {
        errors.push(`prev/next mismatch: ${chapter.href} next→${chapter.next}, but ${chapter.next} prev→${nextChapter.prev ?? "null"}`);
      }
    }
  }

  const indexChapter = PROSE_CHAPTERS.find((chapter) => chapter.href === "blender/00-INDEX.html");
  if (indexChapter !== undefined && indexChapter.next !== "01-EXPORT.html")
  {
    errors.push(`blender/00-INDEX.html should next→01-EXPORT.html (got ${indexChapter.next ?? "null"})`);
  }

  const lastChapter = PROSE_CHAPTERS.find((chapter) => chapter.href === "blender/PREFABS.html");
  if (lastChapter !== undefined && lastChapter.next !== undefined && lastChapter.next !== null)
  {
    errors.push("blender/PREFABS.html should be the last Blender chapter (next should be omitted)");
  }

  if (numbered.length !== 4)
  {
    warnings.push(`expected 4 numbered Blender chapters (01–04), found ${numbered.length}`);
  }
}

function ValidateDiagramAndTraceTopics()
{
  for (const file of Object.keys(ENGINE_AREA_PAGES))
  {
    RequirePageTopics(`engine/${file}`, `engine subsystem diagram engine/${file}`);
  }

  for (const trace of ENGINE_TRACES)
  {
    RequirePageTopics(`engine/trace-${trace.id}.html`, `engine trace "${trace.id}"`);
  }

  for (const file of Object.keys(BLENDER_AREA_PAGES))
  {
    RequirePageTopics(`blender/${file}`, `blender subsystem diagram blender/${file}`);
  }

  for (const trace of BLENDER_TRACES)
  {
    RequirePageTopics(`blender/trace-${trace.id}.html`, `blender trace "${trace.id}"`);
  }
}

function ValidateOrphanPageTopics()
{
  const expected = new Set([
    ...PROSE_CHAPTERS.map((chapter) => chapter.href),
    ...KEPT_META_MD,
    ...Object.keys(ENGINE_AREA_PAGES).map((file) => `engine/${file}`),
    ...ENGINE_TRACES.map((trace) => `engine/trace-${trace.id}.html`),
    ...Object.keys(BLENDER_AREA_PAGES).map((file) => `blender/${file}`),
    ...BLENDER_TRACES.map((trace) => `blender/trace-${trace.id}.html`),
  ]);

  for (const href of Object.keys(PAGE_TOPICS))
  {
    if (!expected.has(href))
    {
      warnings.push(`PAGE_TOPICS entry has no matching source page → "${href}"`);
    }
  }
}

ValidateProseFragments();
ValidateEngineChapterChain();
ValidateBlenderChapterChain();
ValidateDiagramAndTraceTopics();
ValidateOrphanPageTopics();

if (warnings.length > 0)
{
  console.warn("doc validate warnings:\n" + warnings.map((message) => `  · ${message}`).join("\n"));
}

if (errors.length > 0)
{
  console.error("doc validate failed:\n" + errors.map((message) => `  · ${message}`).join("\n"));
  process.exit(1);
}

console.log("doc validate: OK");
