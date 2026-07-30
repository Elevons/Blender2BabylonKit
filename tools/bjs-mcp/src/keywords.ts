/** Split intent text into lowercase tokens (min length 2). */
export function Tokenize(text: string): string[]
{
  return text.toLowerCase().split(/\W+/).filter((token) => token.length > 1);
}

/**
 * True when a keyword appears in intent text without substring traps
 * (e.g. keyword "at" must not match "armature").
 */
export function IntentIncludesKeyword(text: string, keyword: string): boolean
{
  const normalized = text.toLowerCase();
  const term = keyword.toLowerCase().trim();

  if (term.length === 0)
  {
    return false;
  }

  if (term.includes(" ") || term.includes("-"))
  {
    return normalized.includes(term);
  }

  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[\\W_])${escaped}(?:$|[\\W_])`).test(normalized);
}

/** Score how well keywords match an intent (higher = better). */
export function ScoreKeywordMatches(
  normalized: string,
  tokens: string[],
  keywords: string[]
): number
{
  let score = 0;

  for (const keyword of keywords)
  {
    if (IntentIncludesKeyword(normalized, keyword))
    {
      score += 6;
    }

    const keywordLower = keyword.toLowerCase();

    for (const token of tokens)
    {
      if (token.length >= 3 && keywordLower.length >= 3)
      {
        if (keywordLower.includes(token) || token.includes(keywordLower))
        {
          score += 2;
        }
      }
      else if (token === keywordLower)
      {
        score += 2;
      }
    }
  }

  return score;
}
