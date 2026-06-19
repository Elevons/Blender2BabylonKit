import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PLAYGROUND_LEVELS } from "./paths.js";

export interface SceneEntitySummary
{
  id: string;
  name: string;
  parent: string | null;
  tag: string;
  componentTypes: string[];
  script?: string;
  bodyType?: string;
  constraintTypes?: string[];
}

export interface SceneSummary
{
  level: string;
  path: string;
  entityCount: number;
  entities: SceneEntitySummary[];
}

interface SceneEntityJson
{
  id: string;
  name: string;
  parent?: string | null;
  components?: Array<{
    type: string;
    script?: string;
    tag?: string;
    bodyType?: string;
    constraintType?: string;
  }>;
}

interface SceneJson
{
  entities?: SceneEntityJson[];
}

/** List exported level folder names under the playground public levels directory. */
export function ListLevels(): string[]
{
  if (!existsSync(PLAYGROUND_LEVELS))
  {
    return [];
  }

  return readdirSync(PLAYGROUND_LEVELS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function ResolveSceneJsonPath(level: string): string | undefined
{
  const direct = join(PLAYGROUND_LEVELS, level, `${level}.scene.json`);
  if (existsSync(direct))
  {
    return direct;
  }

  const levelDirectory = join(PLAYGROUND_LEVELS, level);
  if (!existsSync(levelDirectory))
  {
    return undefined;
  }

  const sceneFiles = readdirSync(levelDirectory).filter((file) => file.endsWith(".scene.json"));
  if (sceneFiles.length === 0)
  {
    return undefined;
  }

  return join(levelDirectory, sceneFiles[0]);
}

function ParseEntity(entity: SceneEntityJson): SceneEntitySummary
{
  const components = entity.components ?? [];
  const componentTypes = components.map((component) => component.type);

  let tag = "Untagged";
  let script: string | undefined;
  let bodyType: string | undefined;
  const constraintTypes: string[] = [];

  for (const component of components)
  {
    if (component.type === "TAG" && component.tag !== undefined)
    {
      tag = component.tag;
    }

    if (component.type === "SCRIPT" && component.script !== undefined)
    {
      script = component.script;
    }

    if (component.type === "RIGIDBODY" && component.bodyType !== undefined)
    {
      bodyType = component.bodyType;
    }

    if (component.type === "CONSTRAINT" && component.constraintType !== undefined)
    {
      constraintTypes.push(component.constraintType);
    }
  }

  return {
    id: entity.id,
    name: entity.name,
    parent: entity.parent ?? null,
    tag,
    componentTypes,
    script,
    bodyType,
    constraintTypes: constraintTypes.length > 0 ? constraintTypes : undefined,
  };
}

/** Load entity summaries from a level's scene.json manifest. */
export function LoadSceneSummary(level: string, filter?: string): SceneSummary | undefined
{
  const scenePath = ResolveSceneJsonPath(level);
  if (scenePath === undefined)
  {
    return undefined;
  }

  const raw = JSON.parse(readFileSync(scenePath, "utf-8")) as SceneJson;
  let entities = (raw.entities ?? []).map(ParseEntity);

  if (filter !== undefined && filter.trim().length > 0)
  {
    const normalized = filter.toLowerCase();
    entities = entities.filter(
      (entity) =>
        entity.name.toLowerCase().includes(normalized) ||
        entity.tag.toLowerCase().includes(normalized) ||
        entity.componentTypes.some((type) => type.toLowerCase().includes(normalized)) ||
        (entity.script?.toLowerCase().includes(normalized) ?? false) ||
        (entity.constraintTypes?.some((type) => type.toLowerCase().includes(normalized)) ?? false) ||
        (entity.bodyType?.toLowerCase().includes(normalized) ?? false)
    );
  }

  return {
    level,
    path: scenePath,
    entityCount: entities.length,
    entities,
  };
}

export function FormatSceneSummary(summary: SceneSummary, maxEntities = 80): string
{
  const lines = [
    `Level: ${summary.level}`,
    `Manifest: ${summary.path}`,
    `Entities: ${summary.entityCount}`,
    "",
  ];

  const slice = summary.entities.slice(0, maxEntities);

  for (const entity of slice)
  {
    const parts = [
      `- **${entity.name}**`,
      `id=${entity.id}`,
      `tag=${entity.tag}`,
      `components=[${entity.componentTypes.join(", ")}]`,
    ];

    if (entity.script !== undefined)
    {
      parts.push(`script=${entity.script}`);
    }

    if (entity.bodyType !== undefined)
    {
      parts.push(`body=${entity.bodyType}`);
    }

    if (entity.constraintTypes !== undefined)
    {
      parts.push(`constraints=[${entity.constraintTypes.join(", ")}]`);
    }

    lines.push(parts.join(" · "));
  }

  if (summary.entities.length > maxEntities)
  {
    lines.push(`\n… ${summary.entities.length - maxEntities} more (narrow with filter=)`);
  }

  return lines.join("\n");
}
