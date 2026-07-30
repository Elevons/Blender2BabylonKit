import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { CreateDocIndex, GetDocIndexPath, type DocIndexEntry } from "./doc-index.js";
import { EmbedText } from "./embed.js";
import { ParseDocSections } from "./docs.js";
import { BuildChunkText, CollectDocChunks, LoadAllChapters } from "./human-docs.js";

/** Build and write the precomputed doc embedding index. */
async function Main(): Promise<void>
{
  const chunks = CollectDocChunks();
  const chapterBySlug = new Map(LoadAllChapters().map((chapter) => [chapter.slug, chapter]));
  const entries: DocIndexEntry[] = [];

  console.log(`Embedding ${chunks.length} doc sections…`);

  for (let index = 0; index < chunks.length; index++)
  {
    const chunk = chunks[index];
    const chapter = chapterBySlug.get(chunk.chapterSlug);
    const section = chapter !== undefined
      ? ParseDocSections(chapter.markdown).find((candidate) => candidate.slug === chunk.sectionSlug)
      : undefined;
    const content = section?.content ?? chunk.snippet;
    const text = BuildChunkText(chunk.chapterTitle, chunk.sectionTitle, content);

    const embedding = await EmbedText(text);
    entries.push({ ...chunk, embedding });

    if ((index + 1) % 25 === 0 || index + 1 === chunks.length)
    {
      console.log(`  ${index + 1}/${chunks.length}`);
    }
  }

  const indexFile = CreateDocIndex(entries);
  const outputPath = GetDocIndexPath();

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(indexFile)}\n`, "utf-8");

  console.log(`Wrote ${entries.length} embeddings → ${outputPath}`);
}

Main().catch((error: unknown) =>
{
  console.error(error);
  process.exit(1);
});
