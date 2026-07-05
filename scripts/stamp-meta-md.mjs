#!/usr/bin/env node
/**
 * Substitute __KIT_VERSION__ in contributor meta markdown under docs/.
 *
 *   npm run docs:build  (runs via build-docs.mjs)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { KEPT_META_MD } from "./docs/prose-config.mjs";
import { ApplyKitVersionPlaceholders } from "./docs/kit-version.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_DIR = path.join(ROOT, "docs");

export function StampMetaMarkdown()
{
  let count = 0;

  for (const name of KEPT_META_MD)
  {
    const filePath = path.join(DOCS_DIR, name);
    if (!fs.existsSync(filePath))
    {
      console.warn(`stamp-meta-md: missing ${name}`);
      continue;
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const stamped = ApplyKitVersionPlaceholders(raw);

    if (stamped !== raw)
    {
      fs.writeFileSync(filePath, stamped);
    }

    count++;
  }

  console.log(`meta markdown: ${count} files stamped → docs/`);
}

if (import.meta.url === new URL(process.argv[1], "file:").href)
{
  StampMetaMarkdown();
}
