import { readFileSync } from "node:fs";

export interface DocSection
{
  slug: string;
  title: string;
  content: string;
}

/** Read a markdown file from disk. */
export function ReadDoc(filePath: string): string
{
  return readFileSync(filePath, "utf-8");
}

/** Split markdown on `##` headings into sections. Preamble before the first heading is included when section is omitted. */
export function ParseDocSections(markdown: string): DocSection[]
{
  const sections: DocSection[] = [];
  const parts = markdown.split(/^## /m);

  if (parts[0]?.trim().length > 0)
  {
    sections.push({
      slug: "overview",
      title: "Overview",
      content: parts[0].trim(),
    });
  }

  for (let index = 1; index < parts.length; index++)
  {
    const part = parts[index];
    const newlineIndex = part.indexOf("\n");
    const title = newlineIndex === -1 ? part.trim() : part.slice(0, newlineIndex).trim();
    const body = newlineIndex === -1 ? "" : part.slice(newlineIndex + 1).trim();

    sections.push({
      slug: Slugify(title),
      title,
      content: `## ${title}\n\n${body}`.trim(),
    });
  }

  return sections;
}

function Slugify(title: string): string
{
  return title
    .toLowerCase()
    .replace(/[`'"]/g, "")
    .replace(/@exposed/g, "exposed")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function FindDocSection(sections: DocSection[], query?: string): string
{
  if (query === undefined || query.trim().length === 0)
  {
    return sections.map((section) => section.content).join("\n\n---\n\n");
  }

  const normalized = Slugify(query);

  const exact = sections.find((section) => section.slug === normalized);
  if (exact !== undefined)
  {
    return exact.content;
  }

  const partial = sections.find(
    (section) =>
      section.slug.includes(normalized) ||
      normalized.includes(section.slug) ||
      Slugify(section.title).includes(normalized)
  );

  if (partial !== undefined)
  {
    return partial.content;
  }

  const available = sections.map((section) => `${section.slug} (${section.title})`).join(", ");
  return `Unknown section "${query}". Available sections: ${available}`;
}

export function FormatSectionList(sections: DocSection[]): string
{
  return sections.map((section) => `- **${section.slug}** — ${section.title}`).join("\n");
}
