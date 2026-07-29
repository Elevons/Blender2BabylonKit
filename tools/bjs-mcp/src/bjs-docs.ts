import { get } from "node:https";

/**
 * Babylon.js documentation bridge: searches and fetches pages from
 * https://doc.babylonjs.com/ for LLM consumption.
 *
 * Uses the sitemap.xml as an index and fetches individual pages on demand,
 * converting HTML to readable markdown.
 */

const BJS_BASE = "https://doc.babylonjs.com";

// --- Sitemap -----------------------------------------------------------------

interface SitemapEntry
{
  url: string;
  /** Path relative to the base, e.g. "/features/featuresDeepDive/physics/havokPlugin". */
  path: string;
}

let sitemapCache: SitemapEntry[] | null = null;

/** Fetch the sitemap and parse it into a list of doc entries. */
function FetchSitemap(): Promise<SitemapEntry[]>
{
  if (sitemapCache !== null)
  {
    return Promise.resolve(sitemapCache);
  }

  return HttpGet(`${BJS_BASE}/sitemap.xml`).then((xml) =>
  {
    const entries: SitemapEntry[] = [];
    const urlMatches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);

    for (const match of urlMatches)
    {
      const url = match[1];
      // Skip non-doc URLs (typedoc, packages, playground, search, etc.)
      if (
        url.includes("/typedoc/") ||
        url.includes("/packages/") ||
        url === `${BJS_BASE}/playground` ||
        url === `${BJS_BASE}/search` ||
        url === `${BJS_BASE}/` ||
        url.endsWith("/hierarchy") ||
        url.endsWith("/index")
      )
      {
        continue;
      }

      const path = url.replace(BJS_BASE, "").replace(/\/$/, "");
      if (path.length > 0)
      {
        entries.push({ url, path });
      }
    }

    sitemapCache = entries;
    return entries;
  });
}

// --- HTTP --------------------------------------------------------------------

function HttpGet(url: string, timeoutMs = 15000): Promise<string>
{
  return new Promise((resolve, reject) =>
  {
    const request = get(url, { headers: { "User-Agent": "bjs-mcp/1.0" } }, (response) =>
    {
      if (response.statusCode !== undefined && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location !== undefined)
      {
        HttpGet(response.headers.location, timeoutMs).then(resolve, reject);
        return;
      }

      if (response.statusCode !== undefined && response.statusCode >= 400)
      {
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      response.on("error", reject);
    });

    request.on("error", reject);
    request.setTimeout(timeoutMs, () =>
    {
      request.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

// --- HTML → Markdown ---------------------------------------------------------

/** Decode common HTML entities. */
function DecodeEntities(text: string): string
{
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Strip tags and convert inline HTML to markdown equivalents. */
function InlineText(html: string): string
{
  const withCode = html
    .replace(/<code[^>]*>/g, "`")
    .replace(/<\/code>/g, "`")
    .replace(/<(strong|b)>/g, "**")
    .replace(/<\/(strong|b)>/g, "**")
    .replace(/<(em|i)>/g, "*")
    .replace(/<\/(em|i)>/g, "*")
    .replace(/<a\s+[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, "[$2]($1)")
    .replace(/<[^>]+>/g, "");

  return DecodeEntities(withCode).replace(/[ \t]+/g, " ").trim();
}

/** Convert an HTML table to a markdown pipe table. */
function TableToMarkdown(tableHtml: string): string
{
  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  const lines: string[] = [];

  for (const [rowIndex, row] of rows.entries())
  {
    const cells = [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)]
      .map((cell) => InlineText(cell[1]).replace(/\|/g, "\\|"));

    lines.push(`| ${cells.join(" | ")} |`);

    if (rowIndex === 0)
    {
      lines.push(`|${cells.map(() => "---").join("|")}|`);
    }
  }

  return lines.join("\n");
}

/** Extract the main content area from a BJS doc page HTML. */
function ExtractContent(html: string): string
{
  // BJS docs use Docusaurus — main content is in <article> or the main tag
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/);
  if (articleMatch !== null)
  {
    return articleMatch[1];
  }

  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
  if (mainMatch !== null)
  {
    return mainMatch[1];
  }

  // Fallback: use the body
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
  return bodyMatch !== null ? bodyMatch[1] : html;
}

/** Extract the page title from HTML. */
function ExtractTitle(html: string): string
{
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleMatch !== null)
  {
    return DecodeEntities(titleMatch[1]).replace(/\s*\|.*$/, "").trim();
  }

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (h1Match !== null)
  {
    return InlineText(h1Match[1]);
  }

  return "Untitled";
}

/** Convert a full BJS doc page HTML to readable markdown. */
function HtmlToMarkdown(html: string): string
{
  const content = ExtractContent(html);
  let text = content;

  // Fenced code blocks first
  text = text.replace(
    /<pre[^>]*>(?:<code[^>]*>)?([\s\S]*?)(?:<\/code>)?<\/pre>/g,
    (_match, body: string) => `\n\`\`\`\n${DecodeEntities(body.replace(/<[^>]+>/g, "")).trim()}\n\`\`\`\n`
  );

  // Tables
  text = text.replace(/<table[\s\S]*?<\/table>/g, (table) => `\n${TableToMarkdown(table)}\n`);

  // Headings
  for (const level of [1, 2, 3, 4, 5])
  {
    const headingPattern = new RegExp(`<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, "g");
    text = text.replace(
      headingPattern,
      (_match, body: string) => `\n${"#".repeat(level)} ${InlineText(body)}\n`
    );
  }

  // Lists
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_match, body: string) => `- ${InlineText(body)}\n`);
  text = text.replace(/<\/?(ul|ol)[^>]*>/g, "\n");

  // Paragraphs
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (_match, body: string) => `\n${InlineText(body)}\n`);

  // Strip remaining tags
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/<[^>]+>/g, "");
  text = DecodeEntities(text);

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

// --- Search ------------------------------------------------------------------

interface SearchHit
{
  entry: SitemapEntry;
  score: number;
}

/** Score a sitemap entry against search tokens. */
function ScoreEntry(entry: SitemapEntry, tokens: string[]): number
{
  const pathLower = entry.path.toLowerCase();
  let score = 0;

  for (const token of tokens)
  {
    // Exact path segment match is very high value
    if (pathLower.includes(`/${token}`) || pathLower.includes(`${token}/`))
    {
      score += 10;
    }
    else if (pathLower.includes(token))
    {
      score += 3;
    }
  }

  // Bonus for shorter paths (more likely to be overview pages)
  const depth = entry.path.split("/").length;
  if (depth <= 3)
  {
    score += 2;
  }

  return score;
}

/** Search the BJS docs sitemap for pages matching a query. */
export async function SearchBjsDocs(query: string, maxResults = 10): Promise<string>
{
  const entries = await FetchSitemap();
  const tokens = query
    .toLowerCase()
    .split(/[\s/]+/)
    .filter((token) => token.length > 1);

  if (tokens.length === 0)
  {
    return `Query "${query}" is too short — use at least 2 characters.`;
  }

  const hits: SearchHit[] = entries
    .map((entry) => ({ entry, score: ScoreEntry(entry, tokens) }))
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score);

  if (hits.length === 0)
  {
    return `No BJS documentation found for "${query}". Try different terms or browse ${BJS_BASE}/`;
  }

  const lines: string[] = [
    `# BJS Docs search: "${query}" — ${hits.length} result(s)`,
    ``,
  ];

  for (const hit of hits.slice(0, maxResults))
  {
    lines.push(`- **${hit.entry.path}** (score: ${hit.score})`);
    lines.push(`  Fetch: \`fetch_bjs_doc(path="${hit.entry.path}")\``);
  }

  if (hits.length > maxResults)
  {
    lines.push(``, `…and ${hits.length - maxResults} more. Narrow the query to see them.`);
  }

  lines.push(``, `Browse: ${BJS_BASE}/`);

  return lines.join("\n");
}

// --- Fetch -------------------------------------------------------------------

/** Fetch a BJS doc page and convert it to markdown. */
export async function FetchBjsDoc(path: string): Promise<string>
{
  // Normalize path
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${BJS_BASE}${normalizedPath}`;

  try
  {
    const html = await HttpGet(url);
    const title = ExtractTitle(html);
    const markdown = HtmlToMarkdown(html);

    if (markdown.length < 50)
    {
      return `Page "${normalizedPath}" returned very little content. It may be a JavaScript-rendered page.\nBrowse directly: ${url}`;
    }

    return `# ${title}\n\nSource: ${url}\n\n---\n\n${markdown}`;
  }
  catch (error)
  {
    const message = error instanceof Error ? error.message : String(error);
    return `Failed to fetch "${normalizedPath}": ${message}\nBrowse directly: ${url}`;
  }
}
