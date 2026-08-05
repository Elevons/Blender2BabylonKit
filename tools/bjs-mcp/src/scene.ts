import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GAME_LEVELS } from "./paths.js";

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
  lightType?: string;
  /** Number of states when an ANIMATOR component is present. */
  animatorStates?: number;
}

export interface SceneSummary
{
  level: string;
  path: string;
  entityCount: number;
  atmosphere?: string;
  postProcessing?: string[];
  entities: SceneEntitySummary[];
}

interface SceneEntityJson
{
  id: string;
  name: string;
  parent?: string | null;
  light?: { type: string };
  components?: Array<{
    type: string;
    script?: string;
    tag?: string;
    bodyType?: string;
    constraintType?: string;
    states?: Array<{ id?: string }>;
  }>;
}

interface AtmosphereJson
{
  sunLightId?: string;
  pbrSunIntensity?: boolean;
  useLuts?: boolean;
  multiScatteringIntensity?: number;
  minimumMultiScatteringIntensity?: number;
}

interface SceneJson
{
  scene?: {
    atmosphere?: AtmosphereJson | null;
    postProcessing?: PostProcessingJson | null;
  };
  entities?: SceneEntityJson[];
}

interface PostProcessingJson
{
  defaultPipeline?: boolean;
  ssao?: boolean;
  bloom?: { enabled?: boolean };
  sharpen?: { enabled?: boolean };
  depthOfField?: { enabled?: boolean };
  chromaticAberration?: { enabled?: boolean };
  grain?: { enabled?: boolean };
  glow?: { enabled?: boolean };
  vignette?: { enabled?: boolean };
  colorGrading?: { enabled?: boolean; file?: string };
  colorCurves?: { enabled?: boolean };
}

/** List exported level folder names under the game public levels directory. */
export function ListLevels(): string[]
{
  if (!existsSync(GAME_LEVELS))
  {
    return [];
  }

  return readdirSync(GAME_LEVELS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function ResolveSceneJsonPath(level: string): string | undefined
{
  const direct = join(GAME_LEVELS, level, `${level}.scene.json`);
  if (existsSync(direct))
  {
    return direct;
  }

  const levelDirectory = join(GAME_LEVELS, level);
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
  let animatorStates: number | undefined;
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

    if (component.type === "ANIMATOR" && Array.isArray(component.states))
    {
      animatorStates = component.states.length;
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
    lightType: entity.light?.type,
    animatorStates,
  };
}

function SummarizeAtmosphere(
  atmosphere: AtmosphereJson | null | undefined,
  entities: SceneEntitySummary[]
): string | undefined
{
  if (atmosphere === undefined || atmosphere === null)
  {
    return undefined;
  }

  const parts = ["enabled"];

  if (atmosphere.sunLightId !== undefined && atmosphere.sunLightId.length > 0)
  {
    const sun = entities.find((entity) => entity.id === atmosphere.sunLightId);
    parts.push(sun !== undefined ? `sun=${sun.name}` : `sunLightId=${atmosphere.sunLightId}`);
  }
  else
  {
    const sun = entities.find((entity) => entity.lightType === "SUN");
    if (sun !== undefined)
    {
      parts.push(`sun=${sun.name} (auto)`);
    }
  }

  if (atmosphere.pbrSunIntensity !== false)
  {
    parts.push("pbrSunIntensity");
  }

  if (atmosphere.useLuts === false)
  {
    parts.push("rayMarching");
  }

  if (atmosphere.multiScatteringIntensity !== undefined)
  {
    parts.push(`multiScattering=${atmosphere.multiScatteringIntensity}`);
  }

  if (atmosphere.minimumMultiScatteringIntensity !== undefined)
  {
    parts.push(`nightAmbient=${atmosphere.minimumMultiScatteringIntensity}`);
  }

  return parts.join(", ");
}

function SummarizePostProcessing(
  post: PostProcessingJson | null | undefined,
  entities: SceneEntitySummary[]
): string[] | undefined
{
  if (post === undefined || post === null)
  {
    return undefined;
  }

  const enabled: string[] = [];

  if (post.defaultPipeline === true)
  {
    enabled.push("defaultPipeline");
  }
  if (post.ssao === true)
  {
    enabled.push("ssao");
  }
  if (post.bloom?.enabled === true)
  {
    enabled.push("bloom");
  }
  if (post.sharpen?.enabled === true)
  {
    enabled.push("sharpen");
  }
  if (post.depthOfField?.enabled === true)
  {
    enabled.push("depthOfField");
  }
  if (post.chromaticAberration?.enabled === true)
  {
    enabled.push("chromaticAberration");
  }
  if (post.grain?.enabled === true)
  {
    enabled.push("grain");
  }
  if (post.glow?.enabled === true)
  {
    enabled.push("glow");
  }
  if (post.vignette?.enabled === true)
  {
    enabled.push("vignette");
  }
  if (post.colorGrading?.enabled === true)
  {
    const lutFile = post.colorGrading.file?.trim();
    enabled.push(lutFile !== undefined && lutFile.length > 0 ? `colorGrading(${lutFile})` : "colorGrading");
  }
  if (post.colorCurves?.enabled === true)
  {
    enabled.push("colorCurves");
  }

  return enabled.length > 0 ? enabled : undefined;
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
  const allEntities = (raw.entities ?? []).map(ParseEntity);
  let entities = allEntities;

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
        (entity.bodyType?.toLowerCase().includes(normalized) ?? false) ||
        (entity.lightType?.toLowerCase().includes(normalized) ?? false)
    );
  }

  return {
    level,
    path: scenePath,
    entityCount: entities.length,
    atmosphere: SummarizeAtmosphere(raw.scene?.atmosphere, allEntities),
    postProcessing: SummarizePostProcessing(raw.scene?.postProcessing, allEntities),
    entities,
  };
}

export function FormatSceneSummary(summary: SceneSummary, maxEntities = 80): string
{
  const lines = [
    `Level: ${summary.level}`,
    `Manifest: ${summary.path}`,
    `Entities: ${summary.entityCount}`,
  ];

  if (summary.atmosphere !== undefined)
  {
    lines.push(`Atmosphere: ${summary.atmosphere}`);
  }

  if (summary.postProcessing !== undefined)
  {
    lines.push(`Post-processing: ${summary.postProcessing.join(", ")}`);
  }

  lines.push("");

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

    if (entity.animatorStates !== undefined)
    {
      parts.push(`animatorStates=${entity.animatorStates}`);
    }

    if (entity.bodyType !== undefined)
    {
      parts.push(`body=${entity.bodyType}`);
    }

    if (entity.constraintTypes !== undefined)
    {
      parts.push(`constraints=[${entity.constraintTypes.join(", ")}]`);
    }

    if (entity.lightType !== undefined)
    {
      parts.push(`light=${entity.lightType}`);
    }

    lines.push(parts.join(" · "));
  }

  if (summary.entities.length > maxEntities)
  {
    lines.push(`\n… ${summary.entities.length - maxEntities} more (narrow with filter=)`);
  }

  return lines.join("\n");
}
