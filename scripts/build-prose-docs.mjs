#!/usr/bin/env node
/**
 * Assemble prose chapter HTML from body fragments + prose-shell.html.
 *
 *   npm run docs:build  (or: node scripts/build-prose-docs.mjs)
 *
 * Source: scripts/docs/prose/content/ (edit the .html fragments — not markdown)
 * Template: docs/_template/prose-shell.html
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PROSE_CHAPTERS,
  ChapterNavHtml,
  ToolbarHtml,
} from "./docs/prose/manifest.mjs";
import { ApplyKitVersionPlaceholders } from "./docs/kit-version.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHELL_PATH = path.join(ROOT, "docs", "_template", "prose-shell.html");
const CONTENT_DIR = path.join(ROOT, "scripts", "docs", "prose", "content");

const MERMAID_HEAD = `<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>`;
const MERMAID_SCRIPT = `<script>
mermaid.initialize({
  startOnLoad: true,
  theme: "dark",
  securityLevel: "loose",
  themeVariables: {
    fontSize: "16px",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
  },
  flowchart: {
    useMaxWidth: false,
    htmlLabels: true,
    nodeSpacing: 48,
    rankSpacing: 56,
    padding: 18,
  },
});
</script>`;

function ReadShell()
{
  return fs.readFileSync(SHELL_PATH, "utf8");
}

function EmitProsePage({ shell, outPath, chapter, body })
{
  const hasMermaid = body.includes('class="mermaid"');
  let page = shell
    .replace(/__PAGE_TITLE__/g, `Babylon Level Kit — ${chapter.title}`)
    .replace("__MERMAID_HEAD__", hasMermaid ? MERMAID_HEAD : "")
    .replace("__MERMAID_SCRIPT__", hasMermaid ? MERMAID_SCRIPT : "")
    .replace("__TOOLBAR__", ToolbarHtml(chapter))
    .replace("__CHAPTER_NAV__", ChapterNavHtml(chapter))
    .replace("__CONTENT__", body)
    .replace("__BODY_CLASS__", hasMermaid ? "has-mermaid" : "")
    .replace("__FRAGMENT_PATH__", chapter.fragment);
  fs.writeFileSync(outPath, page);
}

export function BuildProseDocs()
{
  const shell = ReadShell();
  let count = 0;

  for (const chapter of PROSE_CHAPTERS)
  {
    const fragmentPath = path.join(CONTENT_DIR, chapter.fragment);
    if (!fs.existsSync(fragmentPath))
    {
      console.error(`prose: missing fragment ${chapter.fragment}`);
      process.exitCode = 1;
      continue;
    }

    const raw = fs.readFileSync(fragmentPath, "utf8");
    const body = ApplyKitVersionPlaceholders(raw);
    const outPath = path.join(ROOT, "docs", chapter.href);
    EmitProsePage({ shell, outPath, chapter, body });
    count++;
  }

  if (process.exitCode !== 1)
  {
    console.log(`prose chapters: ${count} pages → docs/`);
  }
}

/** Plain text for search indexing. */
export function StripHtml(html)
{
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function ReadProseFragment(fragment)
{
  return fs.readFileSync(path.join(CONTENT_DIR, fragment), "utf8");
}

if (import.meta.url === new URL(process.argv[1], "file:").href)
{
  BuildProseDocs();
}
