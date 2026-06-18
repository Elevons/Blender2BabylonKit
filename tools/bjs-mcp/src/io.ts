import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { INPUT_ACTIONS_JSON, INPUT_ACTIONS_TS, PLAYGROUND_BEHAVIORS } from "./paths.js";

export interface InputActionInfo
{
  name: string;
  type?: string;
}

export interface InputMapInfo
{
  name: string;
  actions: InputActionInfo[];
}

export interface InputActionsCatalog
{
  source: "json" | "typescript" | "none";
  maps: InputMapInfo[];
  constantsFile?: string;
}

export function ListInputActions(): InputActionsCatalog
{
  if (existsSync(INPUT_ACTIONS_JSON))
  {
    return ParseInputActionsJson();
  }

  if (existsSync(INPUT_ACTIONS_TS))
  {
    return ParseInputActionsTypeScript();
  }

  return { source: "none", maps: [] };
}

function ParseInputActionsJson(): InputActionsCatalog
{
  const raw = JSON.parse(readFileSync(INPUT_ACTIONS_JSON, "utf-8")) as {
    maps?: Array<{
      name: string;
      actions?: Array<{ name: string; type?: string }>;
    }>;
  };

  const maps: InputMapInfo[] = (raw.maps ?? []).map((map) => ({
    name: map.name,
    actions: (map.actions ?? []).map((action) => ({
      name: action.name,
      type: action.type,
    })),
  }));

  return {
    source: "json",
    maps,
    constantsFile: "apps/playground/src/InputActions.ts",
  };
}

function ParseInputActionsTypeScript(): InputActionsCatalog
{
  const source = readFileSync(INPUT_ACTIONS_TS, "utf-8");
  const maps: InputMapInfo[] = [];

  const mapBlock = source.match(/export const Maps = \{([^}]+)\}/s);
  const actionBlock = source.match(/export const PlayerActions = \{([^}]+)\}/s);

  if (mapBlock !== null)
  {
    const mapNames = [...mapBlock[1].matchAll(/(\w+):\s*"([^"]+)"/g)].map((match) => match[2]);
    const actions =
      actionBlock !== null
        ? [...actionBlock[1].matchAll(/(\w+):\s*"([^"]+)"/g)].map((match) => ({ name: match[2] }))
        : [];

    for (const mapName of mapNames)
    {
      maps.push({ name: mapName, actions });
    }
  }

  return {
    source: "typescript",
    maps,
    constantsFile: "apps/playground/src/InputActions.ts",
  };
}

export function FormatInputActions(catalog: InputActionsCatalog): string
{
  if (catalog.maps.length === 0)
  {
    return "No input actions found. Run `npm run input:gen` or check apps/playground/input.inputactions.json.";
  }

  const lines = [`Source: ${catalog.source}`];
  if (catalog.constantsFile !== undefined)
  {
    lines.push(`Constants: ${catalog.constantsFile}`);
    lines.push(`Import: import { PlayerActions } from "../InputActions";`);
  }

  for (const map of catalog.maps)
  {
    lines.push(`\nMap: ${map.name}`);
    for (const action of map.actions)
    {
      const typeSuffix = action.type !== undefined ? ` (${action.type})` : "";
      lines.push(`  - ${action.name}${typeSuffix}`);
    }
  }

  return lines.join("\n");
}

export function ListBehaviorFiles(): string[]
{
  if (!existsSync(PLAYGROUND_BEHAVIORS))
  {
    return [];
  }

  return readdirSync(PLAYGROUND_BEHAVIORS)
    .filter((file) => file.endsWith(".ts"))
    .sort();
}

export function ReadBehaviorFile(name: string): string | undefined
{
  const stem = name.replace(/\.tsx?$/i, "");
  const filePath = join(PLAYGROUND_BEHAVIORS, `${stem}.ts`);

  if (!existsSync(filePath))
  {
    return undefined;
  }

  return readFileSync(filePath, "utf-8");
}

export function FindSimilarBehavior(query: string): { name: string; score: number }[]
{
  const files = ListBehaviorFiles();
  const normalized = query.toLowerCase();
  const tokens = normalized.split(/\W+/).filter((token) => token.length > 1);

  return files
    .map((file) =>
    {
      const stem = file.replace(/\.ts$/, "");
      let score = 0;

      if (normalized === stem.toLowerCase())
      {
        score += 20;
      }

      if (stem.toLowerCase().includes(normalized))
      {
        score += 10;
      }

      for (const token of tokens)
      {
        if (stem.toLowerCase().includes(token))
        {
          score += 3;
        }
      }

      const content = ReadBehaviorFile(stem)?.toLowerCase() ?? "";
      for (const token of tokens)
      {
        if (content.includes(token))
        {
          score += 1;
        }
      }

      return { name: stem, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
}
