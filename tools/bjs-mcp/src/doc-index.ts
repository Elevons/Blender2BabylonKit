import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EMBED_MODEL } from "./embed.js";

/** One searchable documentation section with a precomputed embedding. */
export interface DocIndexEntry
{
  id: string;
  chapterSlug: string;
  sectionSlug: string;
  chapterTitle: string;
  sectionTitle: string;
  snippet: string;
  embedding: number[];
}

export interface DocIndex
{
  model: string;
  dimensions: number;
  builtAt: string;
  entries: DocIndexEntry[];
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(moduleDirectory, "..");
const INDEX_PATH = join(PACKAGE_ROOT, "data/doc-embeddings.json");

let indexCache: DocIndex | null = null;

/** Load the prebuilt doc embedding index from disk. */
export function LoadDocIndex(): DocIndex | null
{
  if (indexCache !== null)
  {
    return indexCache;
  }

  if (!existsSync(INDEX_PATH))
  {
    return null;
  }

  indexCache = JSON.parse(readFileSync(INDEX_PATH, "utf-8")) as DocIndex;
  return indexCache;
}

export function GetDocIndexPath(): string
{
  return INDEX_PATH;
}

/** Dot product for L2-normalized vectors equals cosine similarity. */
export function CosineSimilarity(left: number[], right: number[]): number
{
  let sum = 0;

  for (let index = 0; index < left.length; index++)
  {
    sum += left[index] * right[index];
  }

  return sum;
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

/** Keyword score for hybrid ranking — boosts exact API names and titles. */
export function KeywordScore(
  entry: DocIndexEntry,
  terms: string[],
  sectionContent: string
): number
{
  const titleBlob = `${entry.chapterTitle} ${entry.sectionTitle}`.toLowerCase();
  const body = sectionContent.toLowerCase();
  let score = 0;

  for (const term of terms)
  {
    score += CountOccurrences(titleBlob, term) * 4;
    score += CountOccurrences(body, term);
  }

  return score;
}

/** Normalize keyword scores to 0–1 for blending with cosine similarity. */
export function NormalizeKeywordScores(scores: number[]): number[]
{
  const maxScore = Math.max(...scores, 1);
  return scores.map((score) => score / maxScore);
}

export interface RankedDocHit
{
  entry: DocIndexEntry;
  score: number;
  vectorScore: number;
  keywordScore: number;
  snippet: string;
}

/** Rank index entries with hybrid vector + keyword scoring. */
export function RankDocIndexEntries(
  index: DocIndex,
  queryEmbedding: number[],
  terms: string[],
  sectionContentById: Map<string, string>,
  maxResults: number
): RankedDocHit[]
{
  const keywordScores = index.entries.map((entry) =>
    KeywordScore(entry, terms, sectionContentById.get(entry.id) ?? entry.snippet)
  );
  const normalizedKeyword = NormalizeKeywordScores(keywordScores);

  const hits: RankedDocHit[] = index.entries.map((entry, index) =>
  {
    const vectorScore = CosineSimilarity(queryEmbedding, entry.embedding);
    const keywordScore = normalizedKeyword[index];
    const score = vectorScore * 0.75 + keywordScore * 0.25;

    return {
      entry,
      score,
      vectorScore,
      keywordScore,
      snippet: entry.snippet,
    };
  });

  hits.sort((left, right) => right.score - left.score);
  return hits.slice(0, maxResults);
}

/** Default index metadata when writing a fresh index file. */
export function CreateDocIndex(entries: DocIndexEntry[]): DocIndex
{
  return {
    model: EMBED_MODEL,
    dimensions: entries[0]?.embedding.length ?? 384,
    builtAt: new Date().toISOString(),
    entries,
  };
}
