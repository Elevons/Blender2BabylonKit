#!/usr/bin/env node
/**
 * Verify internal hrefs in prose fragments and contributor-facing meta markdown.
 *
 *   npm run docs:check-links
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROSE_CHAPTERS } from "./docs/prose/manifest.mjs";
import { KEPT_META_MD } from "./docs/prose-config.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = path.join(ROOT, "scripts/docs/prose/content");
const DOCS_DIR = path.join(ROOT, "docs");

const HREF_RE = /href=["']([^"'#]+)(?:#[^"']*)?["']/g;
const MD_LINK_RE = /\[[^\]]+\]\(([^)#]+)(?:#[^)]*)?\)/g;

/** @type {string[]} */
const errors = [];

function checkTarget(fromFile, href)
{
  if (/^(https?:|mailto:)/i.test(href)) { return; }
  if (href.startsWith("#")) { return; }

  const resolved = path.normalize(path.join(DOCS_DIR, path.dirname(fromFile), href));

  if (!fs.existsSync(resolved))
  {
    errors.push(`${fromFile}: broken link → ${href}`);
  }
}

function scanHtml(fragmentPath, outputHref)
{
  const full = path.join(CONTENT_DIR, fragmentPath);
  const html = fs.readFileSync(full, "utf8");
  for (const re of [HREF_RE, MD_LINK_RE])
  {
    let match;
    while ((match = re.exec(html)) !== null)
    {
      checkTarget(outputHref, match[1]);
    }
  }
}

for (const chapter of PROSE_CHAPTERS)
{
  scanHtml(chapter.fragment, chapter.href);
}

for (const name of KEPT_META_MD)
{
  const filePath = path.join(DOCS_DIR, name);
  if (!fs.existsSync(filePath)) { continue; }
  const md = fs.readFileSync(filePath, "utf8");
  let match;
  while ((match = MD_LINK_RE.exec(md)) !== null)
  {
    if (!match[1].startsWith("http"))
    {
      checkTarget(name, match[1]);
    }
  }
}

if (errors.length)
{
  console.error("doc link check failed:\n" + errors.map((e) => `  · ${e}`).join("\n"));
  process.exit(1);
}

console.log("doc links: OK");
