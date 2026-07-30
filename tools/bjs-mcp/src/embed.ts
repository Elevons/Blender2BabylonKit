import { pipeline } from "@huggingface/transformers";

/** Small sentence-transformer — runs in-process via ONNX, no external server. */
export const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";

type EmbedPipeline = Awaited<ReturnType<typeof LoadEmbedPipeline>>;

let extractorPromise: Promise<EmbedPipeline> | null = null;

async function LoadEmbedPipeline()
{
  return pipeline("feature-extraction", EMBED_MODEL);
}

/** Lazy-load the embedding pipeline once per MCP process. */
function GetExtractor(): Promise<EmbedPipeline>
{
  if (extractorPromise === null)
  {
    extractorPromise = LoadEmbedPipeline();
  }

  return extractorPromise;
}

/** Convert one text string to a normalized 384-d embedding vector. */
export async function EmbedText(text: string): Promise<number[]>
{
  const extractor = await GetExtractor();
  const tensor = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(tensor.data as Float32Array);
}
