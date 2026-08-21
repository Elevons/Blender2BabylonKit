import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { GAME_BEHAVIORS, INPUT_ACTIONS_JSON, INPUT_ACTIONS_TS } from "./paths.js";

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
    constantsFile: "game/src/InputActions.ts",
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
    constantsFile: "game/src/InputActions.ts",
  };
}

export function FormatInputActions(catalog: InputActionsCatalog): string
{
  if (catalog.maps.length === 0)
  {
    return "No input actions found. Run `npm run input:gen` or check game/input.inputactions.json.";
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

/**
 * Walk behaviors/ recursively and return posix-relative .ts paths
 * (e.g. "Rotator.ts", "player/Rotator.ts").
 */
function CollectBehaviorFiles(directory: string, relativePrefix: string): string[]
{
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true }))
  {
    const relativePath = relativePrefix === "" ? entry.name : `${relativePrefix}/${entry.name}`;

    if (entry.isDirectory())
    {
      files.push(...CollectBehaviorFiles(join(directory, entry.name), relativePath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts"))
    {
      files.push(relativePath);
    }
  }

  return files;
}

/** Filename stem used as the BehaviorRegistry / Blender SCRIPT key. */
function BehaviorStem(relativePath: string): string
{
  const fileName = relativePath.replace(/\\/g, "/").split("/").pop() ?? relativePath;
  return fileName.replace(/\.tsx?$/i, "");
}

/** Relative path from game/src/behaviors without extension. */
function BehaviorRelativeStem(relativePath: string): string
{
  return relativePath.replace(/\\/g, "/").replace(/\.tsx?$/i, "");
}

/**
 * List every behavior .ts file under game/src/behaviors/, including subfolders.
 * Paths are posix-relative to that folder.
 */
export function ListBehaviorFiles(): string[]
{
  if (!existsSync(GAME_BEHAVIORS))
  {
    return [];
  }

  return CollectBehaviorFiles(GAME_BEHAVIORS, "").sort();
}

export interface BehaviorCatalogEntry
{
  name: string;
  summary: string;
  hooks: string[];
}

/** Summarize each playground behavior for list_behaviors. */
export function ListBehaviorCatalog(): BehaviorCatalogEntry[]
{
  const entries: BehaviorCatalogEntry[] = [];

  for (const file of ListBehaviorFiles())
  {
    const name = BehaviorRelativeStem(file);
    const source = ReadBehaviorFile(name) ?? "";
    const docMatch = source.match(/\/\*\*\s*([^*]+?)\s*\*\//);
    const summary = docMatch?.[1]?.replace(/\s+/g, " ").trim() ?? `${name} behavior`;

    const hooks: string[] = [];
    if (/\bOnStart\s*\(/.test(source))
    {
      hooks.push("OnStart");
    }
    if (/\bOnPostReady\s*\(/.test(source))
    {
      hooks.push("OnPostReady");
    }
    if (/\bOnUpdate\s*\(/.test(source))
    {
      hooks.push("OnUpdate");
    }
    if (/\bOnDestroy\s*\(/.test(source))
    {
      hooks.push("OnDestroy");
    }
    if (/\bOnMessage\s*\(/.test(source))
    {
      hooks.push("OnMessage");
    }

    entries.push({ name, summary, hooks });
  }

  return entries;
}

export function FormatBehaviorCatalog(entries: BehaviorCatalogEntry[]): string
{
  if (entries.length === 0)
  {
    return "No behaviors found under game/src/behaviors/.";
  }

  return entries
    .map((entry) =>
    {
      const hookSuffix = entry.hooks.length > 0 ? ` · hooks: ${entry.hooks.join(", ")}` : "";
      return `- **${entry.name}** — ${entry.summary}${hookSuffix}`;
    })
    .join("\n");
}

/**
 * Resolve a relative path under behaviors/ from a stem ("Rotator") or a nested
 * path ("player/Rotator" / "player/Rotator.ts"). Stem lookup matches the
 * filename so nested files stay addressable by the Blender SCRIPT key.
 */
export function ResolveBehaviorRelativePath(name: string): string | undefined
{
  const normalized = name.replace(/\\/g, "/").replace(/\.tsx?$/i, "");
  const directRelativePath = `${normalized}.ts`;
  const directPath = join(GAME_BEHAVIORS, ...directRelativePath.split("/"));

  if (existsSync(directPath))
  {
    return directRelativePath;
  }

  const requestedStem = BehaviorStem(normalized);
  for (const relativePath of ListBehaviorFiles())
  {
    if (BehaviorStem(relativePath) === requestedStem)
    {
      return relativePath;
    }
  }

  return undefined;
}

export function ReadBehaviorFile(name: string): string | undefined
{
  const relativePath = ResolveBehaviorRelativePath(name);
  if (relativePath === undefined)
  {
    return undefined;
  }

  return readFileSync(join(GAME_BEHAVIORS, ...relativePath.split("/")), "utf-8");
}

export function FindSimilarBehavior(query: string): { name: string; score: number }[]
{
  const files = ListBehaviorFiles();
  const normalized = query.toLowerCase();
  const tokens = normalized.split(/\W+/).filter((token) => token.length > 1);

  return files
    .map((file) =>
    {
      const relativeStem = BehaviorRelativeStem(file);
      const stem = BehaviorStem(file);
      let score = 0;

      if (normalized === stem.toLowerCase() || normalized === relativeStem.toLowerCase())
      {
        score += 20;
      }

      if (stem.toLowerCase().includes(normalized) || relativeStem.toLowerCase().includes(normalized))
      {
        score += 10;
      }

      for (const token of tokens)
      {
        if (stem.toLowerCase().includes(token) || relativeStem.toLowerCase().includes(token))
        {
          score += 3;
        }
      }

      const content = ReadBehaviorFile(relativeStem)?.toLowerCase() ?? "";
      for (const token of tokens)
      {
        if (content.includes(token))
        {
          score += 1;
        }
      }

      return { name: relativeStem, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
}
