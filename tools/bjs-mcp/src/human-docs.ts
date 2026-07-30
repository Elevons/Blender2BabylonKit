import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LoadDocIndex,
  RankDocIndexEntries,
  type DocIndexEntry,
  type RankedDocHit,
} from "./doc-index.js";
import { EmbedText } from "./embed.js";
import { ListBehaviorFiles, ReadBehaviorFile } from "./io.js";
import { DOCS, PROSE_CONTENT } from "./paths.js";
import { ParseDocSections, FindDocSection, FormatSectionList } from "./docs.js";
import type { DocSection } from "./docs.js";

/**
 * Human documentation bridge: exposes the prose chapters under
 * scripts/docs/prose/content/ (the source of the built docs/*.html pages) as
 * markdown for LLM consumption, with chapter listing, per-section retrieval,
 * and semantic search across chapters + the markdown contract docs.
 */

export interface DocChapter
{
  /** Stable slug, e.g. "engine/04-load-pipeline" or "kernel". */
  slug: string;
  title: string;
  /** Which doc set the chapter belongs to. */
  side: "engine" | "blender" | "launcher" | "meta" | "contract";
  /** Human-readable source path relative to the repo root. */
  sourcePath: string;
  /** Built HTML page a human would read, when one exists. */
  builtPath?: string;
}

interface LoadedChapter extends DocChapter
{
  markdown: string;
}

const PROSE_SIDES: { folder: string; side: DocChapter["side"] }[] = [
  { folder: "engine", side: "engine" },
  { folder: "blender", side: "blender" },
  { folder: "launcher", side: "launcher" },
  { folder: "meta", side: "meta" },
];

/** Markdown contract docs already served by dedicated tools — included in search. */
const CONTRACT_DOCS: { slug: string; title: string; path: string }[] = [
  { slug: "kernel", title: "LLM_KERNEL — minimal behavior contract", path: DOCS.kernel },
  {
    slug: "scripting-context",
    title: "LLM_SCRIPTING_CONTEXT — full behavior API contract",
    path: DOCS.scriptingContext,
  },
  { slug: "playbook", title: "LLM_PLAYBOOK — task playbooks", path: DOCS.playbook },
  { slug: "style-guide", title: "STYLE_GUIDE — TypeScript style rules", path: DOCS.styleGuide },
];

// --- HTML fragment → markdown -----------------------------------------------

/** Decode the handful of entities the prose fragments actually use. */
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

/** Strip any remaining tags and collapse whitespace inside a line. */
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

/** Convert one <table>…</table> block to a markdown pipe table. */
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

/** Convert a prose HTML body fragment to readable markdown. */
export function HtmlFragmentToMarkdown(html: string): string
{
  let text = html;

  // Fenced blocks first so their contents are never re-processed.
  text = text.replace(
    /<pre class="mermaid">([\s\S]*?)<\/pre>/g,
    (_match, body: string) => `\n\`\`\`mermaid\n${DecodeEntities(body).trim()}\n\`\`\`\n`
  );
  text = text.replace(
    /<pre[^>]*>(?:<code[^>]*>)?([\s\S]*?)(?:<\/code>)?<\/pre>/g,
    (_match, body: string) => `\n\`\`\`\n${DecodeEntities(body.replace(/<[^>]+>/g, "")).trim()}\n\`\`\`\n`
  );

  text = text.replace(/<table[\s\S]*?<\/table>/g, (table) => `\n${TableToMarkdown(table)}\n`);

  for (const level of [1, 2, 3, 4])
  {
    const headingPattern = new RegExp(`<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, "g");
    text = text.replace(
      headingPattern,
      (_match, body: string) => `\n${"#".repeat(level)} ${InlineText(body)}\n`
    );
  }

  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_match, body: string) => `- ${InlineText(body)}\n`);
  text = text.replace(/<\/?(ul|ol)[^>]*>/g, "\n");
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (_match, body: string) => `\n${InlineText(body)}\n`);

  // Anything left (divs, imgs, comments) — strip tags, keep text.
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/<[^>]+>/g, "");
  text = DecodeEntities(text);

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

// --- Chapter catalog ---------------------------------------------------------

let chapterCache: LoadedChapter[] | null = null;

/** First <h1> of the fragment, falling back to the filename. */
function ChapterTitle(markdown: string, fileName: string): string
{
  const heading = markdown.match(/^# (.+)$/m);
  return heading !== null ? heading[1].trim() : fileName.replace(/\.html$/, "");
}

/** Load every prose chapter + contract doc once per process. */
export function LoadAllChapters(): LoadedChapter[]
{
  if (chapterCache !== null)
  {
    return chapterCache;
  }

  const chapters: LoadedChapter[] = [];

  for (const { folder, side } of PROSE_SIDES)
  {
    const directory = join(PROSE_CONTENT, folder);
    if (!existsSync(directory))
    {
      continue;
    }

    for (const fileName of readdirSync(directory).filter((name) => name.endsWith(".html")).sort())
    {
      const html = readFileSync(join(directory, fileName), "utf-8");
      const markdown = HtmlFragmentToMarkdown(html);
      const stem = fileName.replace(/\.html$/, "");
      const builtPath = side === "meta" ? `docs/${fileName}` : `docs/${folder}/${fileName}`;

      chapters.push({
        slug: `${folder}/${stem.toLowerCase()}`,
        title: ChapterTitle(markdown, fileName),
        side,
        sourcePath: `scripts/docs/prose/content/${folder}/${fileName}`,
        builtPath,
        markdown,
      });
    }
  }

  for (const contract of CONTRACT_DOCS)
  {
    if (!existsSync(contract.path))
    {
      continue;
    }

    chapters.push({
      slug: contract.slug,
      title: contract.title,
      side: "contract",
      sourcePath: contract.path.slice(contract.path.indexOf("docs/")),
      markdown: readFileSync(contract.path, "utf-8"),
    });
  }

  chapterCache = chapters;
  return chapters;
}

/** Find a chapter by slug — exact first, then substring on slug or title. */
export function FindChapter(query: string): LoadedChapter | undefined
{
  const chapters = LoadAllChapters();
  const normalized = query.toLowerCase().trim().replace(/\.html$/, "");

  const exact = chapters.find((chapter) => chapter.slug === normalized);
  if (exact !== undefined)
  {
    return exact;
  }

  return chapters.find(
    (chapter) =>
      chapter.slug.includes(normalized) ||
      chapter.title.toLowerCase().includes(normalized)
  );
}

// --- Tool formatters ---------------------------------------------------------

/** Markdown table of every chapter, grouped by side. */
export function FormatChapterList(): string
{
  const chapters = LoadAllChapters();
  const lines: string[] = [
    `# Documentation chapters`,
    ``,
    `Call \`get_doc_chapter(chapter="<slug>")\` for full text, or add \`section="…"\` for one heading.`,
    ``,
  ];

  for (const { side } of [...PROSE_SIDES, { folder: "", side: "contract" as const }])
  {
    const group = chapters.filter((chapter) => chapter.side === side);
    if (group.length === 0)
    {
      continue;
    }

    lines.push(`## ${side}`, ``);
    for (const chapter of group)
    {
      lines.push(`- **${chapter.slug}** — ${chapter.title}`);
    }
    lines.push(``);
  }

  return lines.join("\n").trim();
}

/** One chapter (or one section of it) with a source-path footer. */
export function FormatChapter(chapterQuery: string, section?: string): string
{
  const chapter = FindChapter(chapterQuery);
  if (chapter === undefined)
  {
    return `Unknown chapter "${chapterQuery}". Call list_doc_chapters for slugs.`;
  }

  const footer =
    `\n\n---\nSource: \`${chapter.sourcePath}\`` +
    (chapter.builtPath !== undefined ? ` · Built page: \`${chapter.builtPath}\`` : "");

  if (section === undefined || section.trim().length === 0)
  {
    return chapter.markdown + footer;
  }

  const sections = ParseDocSections(chapter.markdown);
  if (section === "list")
  {
    return `Sections in **${chapter.slug}**:\n\n${FormatSectionList(sections)}` + footer;
  }

  return FindDocSection(sections, section) + footer;
}

// --- Doc chunks (for embedding index build) ----------------------------------

/** Text fed to the embedder for one doc section. */
export function BuildChunkText(chapterTitle: string, sectionTitle: string, content: string): string
{
  const body = content.length > 4000 ? `${content.slice(0, 4000)}…` : content;
  return `${chapterTitle}\n${sectionTitle}\n${body}`;
}

/** Collect every doc section as an indexable chunk (without embeddings). */
export function CollectDocChunks(): Omit<DocIndexEntry, "embedding">[]
{
  const chunks: Omit<DocIndexEntry, "embedding">[] = [];

  for (const chapter of LoadAllChapters())
  {
    for (const section of ParseDocSections(chapter.markdown))
    {
      const snippet = section.content.slice(0, 160).replace(/\s+/g, " ").trim();

      chunks.push({
        id: `${chapter.slug}/${section.slug}`,
        chapterSlug: chapter.slug,
        sectionSlug: section.slug,
        chapterTitle: chapter.title,
        sectionTitle: section.title,
        snippet,
      });
    }
  }

  return chunks;
}

/** Build a lookup of section content keyed by index entry id. */
export function BuildSectionContentMap(): Map<string, string>
{
  const contentById = new Map<string, string>();

  for (const chapter of LoadAllChapters())
  {
    for (const section of ParseDocSections(chapter.markdown))
    {
      contentById.set(`${chapter.slug}/${section.slug}`, section.content);
    }
  }

  return contentById;
}

// --- Search ------------------------------------------------------------------

interface SearchHit
{
  chapter: LoadedChapter;
  section: DocSection;
  /** Number of query-term occurrences in the section. */
  score: number;
  snippet: string;
}

/** A short context window around the first match in a section. */
function BuildSnippet(content: string, term: string): string
{
  const lowerContent = content.toLowerCase();
  const matchIndex = lowerContent.indexOf(term);
  if (matchIndex === -1)
  {
    return content.slice(0, 160).replace(/\s+/g, " ").trim();
  }

  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(content.length, matchIndex + term.length + 120);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < content.length ? "…" : "";

  return prefix + content.slice(start, end).replace(/\s+/g, " ").trim() + suffix;
}

/** Count non-overlapping occurrences of a term. */
function CountOccurrences(haystack: string, needle: string): number
{
  let count = 0;
  let position = haystack.indexOf(needle);

  while (position !== -1)
  {
    count++;
    position = haystack.indexOf(needle, position + needle.length);
  }

  return count;
}

/** Split a search query into terms (min length 2). */
function SplitSearchTerms(query: string): string[]
{
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((term) => term.length >= 2);
}

/** Score text against one or more search terms. */
function ScoreTextAgainstTerms(text: string, terms: string[]): number
{
  const lower = text.toLowerCase();
  let score = 0;

  for (const term of terms)
  {
    score += CountOccurrences(lower, term);
  }

  return score;
}

interface BehaviorSearchHit
{
  name: string;
  score: number;
  snippet: string;
}

/** Search playground behavior sources by filename and file contents. */
function SearchBehaviorSources(terms: string[]): BehaviorSearchHit[]
{
  const hits: BehaviorSearchHit[] = [];

  for (const file of ListBehaviorFiles())
  {
    const name = file.replace(/\.ts$/, "");
    const source = ReadBehaviorFile(name) ?? "";
    const nameScore = ScoreTextAgainstTerms(name, terms) * 3;
    const bodyScore = ScoreTextAgainstTerms(source, terms);
    const score = nameScore + bodyScore;

    if (score > 0)
    {
      hits.push({
        name,
        score,
        snippet: BuildSnippet(source, terms[0] ?? ""),
      });
    }
  }

  hits.sort((left, right) => right.score - left.score);
  return hits;
}

/** Keyword-only doc search — fallback when the vector index is missing or embedding fails. */
function SearchDocsByKeyword(query: string, terms: string[], maxResults: number): SearchHit[]
{
  const hits: SearchHit[] = [];

  for (const chapter of LoadAllChapters())
  {
    for (const section of ParseDocSections(chapter.markdown))
    {
      const score = ScoreTextAgainstTerms(section.content, terms);
      if (score > 0)
      {
        hits.push({
          chapter,
          section,
          score,
          snippet: BuildSnippet(section.content, terms[0]),
        });
      }
    }
  }

  hits.sort((left, right) => right.score - left.score);
  return hits.slice(0, maxResults);
}

function FormatDocHitLines(hits: SearchHit[] | RankedDocHit[]): string[]
{
  const lines: string[] = [];

  for (const hit of hits)
  {
    if ("chapter" in hit)
    {
      lines.push(
        `## ${hit.chapter.slug} › ${hit.section.title} (${hit.score} hit${hit.score === 1 ? "" : "s"})`,
        ``,
        `> ${hit.snippet}`,
        ``,
        `Fetch: \`get_doc_chapter(chapter="${hit.chapter.slug}", section="${hit.section.slug}")\``,
        ``
      );
      continue;
    }

    lines.push(
      `## ${hit.entry.chapterSlug} › ${hit.entry.sectionTitle} (score ${hit.score.toFixed(3)})`,
      ``,
      `> ${hit.snippet}`,
      ``,
      `Fetch: \`get_doc_chapter(chapter="${hit.entry.chapterSlug}", section="${hit.entry.sectionSlug}")\``,
      ``
    );
  }

  return lines;
}

function FormatBehaviorHitLines(behaviorHits: BehaviorSearchHit[]): string[]
{
  const lines: string[] = [`## Behavior reference sources`, ``];

  for (const hit of behaviorHits.slice(0, 5))
  {
    lines.push(
      `- **${hit.name}.ts** (${hit.score} hit${hit.score === 1 ? "" : "s"})`,
      `  > ${hit.snippet}`,
      `  Fetch: \`get_behavior("${hit.name}")\` · \`find_similar_behavior(query="${hit.name}", includeSource=true)\``,
      ``
    );
  }

  return lines;
}

/** Semantic + keyword search across docs, contract files, and playground behavior sources. */
export async function SearchDocs(query: string, maxResults = 8): Promise<string>
{
  const terms = SplitSearchTerms(query);
  if (terms.length === 0)
  {
    return `Query "${query}" is too short — use at least 2 characters.`;
  }

  const behaviorHits = SearchBehaviorSources(terms);
  const index = LoadDocIndex();
  let docHits: SearchHit[] | RankedDocHit[] = [];
  let searchMode = "keyword";

  if (index !== null)
  {
    try
    {
      const queryEmbedding = await EmbedText(query);
      const sectionContentById = BuildSectionContentMap();
      docHits = RankDocIndexEntries(index, queryEmbedding, terms, sectionContentById, maxResults);
      searchMode = "semantic";
    }
    catch
    {
      docHits = SearchDocsByKeyword(query, terms, maxResults);
    }
  }
  else
  {
    docHits = SearchDocsByKeyword(query, terms, maxResults);
  }

  if (docHits.length === 0 && behaviorHits.length === 0)
  {
    return `No documentation matches for "${query}". Try list_doc_chapters or a shorter term.`;
  }

  const lines: string[] = [
    `# Search (${searchMode}): "${query}" — ${docHits.length} doc section(s)${behaviorHits.length > 0 ? `, ${behaviorHits.length} behavior source(s)` : ""}`,
    ``,
    ...FormatDocHitLines(docHits),
  ];

  if (behaviorHits.length > 0)
  {
    lines.push(...FormatBehaviorHitLines(behaviorHits));
  }

  return lines.join("\n").trim();
}
