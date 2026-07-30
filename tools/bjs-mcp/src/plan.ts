import { FindSimilarBehavior } from "./io.js";
import { MatchPlaybook } from "./playbooks.js";
import { FindRecipesByIntent, GetRecipeByName, type Recipe } from "./recipes.js";

export interface PlannedRecipe
{
  name: string;
  description: string;
  role: string;
}

export interface BehaviorPlan
{
  intent: string;
  recipes: PlannedRecipe[];
  sections: string[];
  fragments: string[];
  referenceBehavior: string;
  exposedHints: string[];
  pitfalls: string[];
  steps: string[];
}

interface SectionRule
{
  keywords: string[];
  section: string;
}

const SECTION_RULES: SectionRule[] = [
  { keywords: ["physics", "body", "collider", "rigid", "kinematic", "animated", "impulse", "velocity"], section: "physics" },
  { keywords: ["constraint", "hinge", "joint", "spring", "6dof", "motor", "wheel", "trailer"], section: "physics" },
  { keywords: ["trigger", "overlap", "collision"], section: "physics" },
  { keywords: ["input", "wasd", "keyboard", "gamepad", "jump", "move", "stick", "throttle"], section: "input" },
  { keywords: ["exposed", "inspector", "blender", "dropdown", "enum", "picker", "file picker", "lut file"], section: "exposed" },
  { keywords: ["fog zone", "fogchanger", "aces lut", "zone lut", "underwater lut"], section: "scene-look" },
  { keywords: ["animation", "clip", "armature", "walk", "idle", "nla", "animator", "fsm", "state machine", "locomotion"], section: "animation" },
  { keywords: ["message", "trigger event", "sendmessage", "onclick", "door"], section: "audio" },
  { keywords: ["gui", "hud", "button", "particle", "3d gui", "holographic"], section: "gui" },
  { keywords: ["msdf", "text", "label", "font", "score"], section: "gui" },
  { keywords: ["sound", "audio", "sfx", "play"], section: "audio" },
  { keywords: ["hover", "bob", "float", "levitate"], section: "lifecycle" },
  { keywords: ["reveal", "show", "hidden"], section: "visibility" },
  { keywords: ["setactive", "set active", "enable object", "disable object", "toggle entity"], section: "visibility" },
  { keywords: ["attachment", "getbehavior", "entity api", "component"], section: "entity" },
  { keywords: ["camera", "geospatial", "globe", "planet", "map", "orbit", "follow"], section: "cameras" },
  { keywords: ["atmosphere", "physical sky", "aerial perspective", "rayleigh", "mie", "skybox", "sky"], section: "scene-look" },
  { keywords: ["volumetric", "light shaft", "god ray", "sun ray", "scattering", "post-processing", "postprocess", "bloom", "ssao", "dof", "vignette", "color grading", "color grade", "lut", "cube lut", ".cube", "3dl"], section: "scene-look" },
  { keywords: ["lifecycle", "onstart", "onpostready", "onupdate", "ondestroy"], section: "lifecycle" },
  { keywords: ["visible", "visibility", "hidden", "hide", "isvisible", "eye icon", "viewport"], section: "visibility" },
  { keywords: ["spawn", "prefab", "scatter", "instance", "populate", "spawner", "duplicate"], section: "prefab-spawn" },
  { keywords: ["pool", "interval", "grow", "shrink", "lifetime", "recycle", "animalspawner"], section: "prefab-spawn" },
];

const FRAGMENT_RULES: Array<{ keywords: string[]; fragment: string }> = [
  { keywords: ["ease", "smooth", "lerp", "interpolat"], fragment: "ease-smoothstep" },
  { keywords: ["wasd", "move", "walk", "vector2", "stick"], fragment: "move-by-input-vector2" },
  { keywords: ["jump"], fragment: "subscribe-jump-performed" },
  { keywords: ["kinematic", "animated", "platform", "patrol", "path", "train"], fragment: "make-body-kinematic" },
  { keywords: ["trigger", "overlap", "zone", "inside", "volume", "poll"], fragment: "poll-trigger-volume" },
  { keywords: ["setactive", "set active", "enable object", "disable object", "toggle entity", "underwater toggle"], fragment: "set-entity-active" },
  { keywords: ["reveal", "show hidden", "eye icon"], fragment: "reveal-entity" },
  { keywords: ["trigger", "overlap", "collision log"], fragment: "enable-trigger-logging" },
  { keywords: ["keyboard", "key", "observable"], fragment: "cleanup-keyboard-observer" },
  { keywords: ["animation", "clip", "walk"], fragment: "play-animation" },
  { keywords: ["animator", "setfloat", "fsm", "locomotion"], fragment: "set-animator-float" },
  { keywords: ["trigger", "settrigger", "jump"], fragment: "set-animator-trigger" },
  { keywords: ["sendmessage", "message", "door"], fragment: "send-message" },
  { keywords: ["hinge", "motor", "wheel", "constraint"], fragment: "resolve-hinge-constraint" },
  { keywords: ["hinge", "motor", "wheel"], fragment: "set-hinge-motor-velocity" },
  { keywords: ["path", "waypoint", "train", "tangent"], fragment: "path3d-from-entities" },
  { keywords: ["camera", "orbit", "follow"], fragment: "orbit-camera-around-target" },
  { keywords: ["fov", "lens", "clip", "script camera", "copy lens"], fragment: "copy-lens-from-authored-camera" },
  { keywords: ["geospatial", "globe", "planet", "map", "earth", "flyto", "fly to"], fragment: "geospatial-camera-flyto-point" },
  { keywords: ["teleport", "lift", "snap", "checkpoint", "respawn", "reset"], fragment: "move-animated-body" },
  { keywords: ["reveal", "show", "hidden", "invisible"], fragment: "reveal-entity" },
  { keywords: ["sound", "audio", "sfx", "play"], fragment: "play-sound" },
  { keywords: ["lut", "color grade", "color grading", "underwater", "fog zone"], fragment: "zone-lut-swap" },
  { keywords: ["msdf", "label", "score", "text"], fragment: "update-msdf-text" },
  { keywords: ["hover", "bob", "sine"], fragment: "ease-smoothstep" },
  { keywords: ["spawn", "prefab", "scatter", "instance", "populate", "spawner"], fragment: "spawn-prefab-instance" },
  { keywords: ["paint", "vertex", "color", "colormap", "populate", "scatter"], fragment: "paint-scatter-vertex-colors" },

];

const RECIPE_ROLES: Record<string, string> = {
  "minimal-behavior": "base shell — always start here for novel logic",
  "constraint-hinge-motor": "drive Blender-authored hinge constraints (wheels, doors)",
  "path-follow-advanced": "Path3D motion with acceleration and tangent facing",
  "camera-follow": "manual ArcRotateCamera on a target with optional probe collision clamp",
  "geospatial-camera-flyto": "fly authored GeospatialCamera to a point (Blender CAMERA component GEOSPATIAL)",
  "on-message-handler": "react to triggers / SendMessage / GUI clicks",
  "message-state-handler": "OnMessage-driven state machine with enum state",
  "hover-bob": "sine vertical bob with optional look-at",
  "reveal-on-message": "disable in OnStart, SetEntityActive(true) when a message arrives",
  "toggle-entity-active": "SetEntityActive on target list (full disable — ToggleInWater pattern)",
  "sound-on-message": "play AUDIO stem on matching OnMessage",
  "msdf-label-update": "update MSDF_TEXT paragraphs at runtime",
  "rover-wheel-drive": "multiple hinge motors for wheeled vehicles",
  "input-poll-move": "poll named Input Actions each frame",
  "kinematic-body-move": "per-frame node motion when a physics body exists",
  "waypoint-path": "simple vector3 waypoint lerp (no Path3D)",
  "patrol-oscillate": "sine ease between two positions",
  "animation-cycle": "cycle animation clips on an interval",
  "look-at-target": "face another entity each frame",
  "constant-rotate": "spin on a fixed axis",
  "trigger-logger": "debug physics trigger overlaps via OnTriggerEnter/OnTriggerExit",
  "scatter-prefab-spawner": "spawn template instances at points or paint-scatter; batch shadows with deferShadowRefresh + FlushSpawnShadowRefresh",
  "pool-prefab-spawner": "interval pool with grow/shrink lifecycle — parent: null, no deferShadowRefresh; see animalSpawner.ts",
  "animator-driver": "thin SCRIPT driver for ANIMATOR SetFloat/SetTrigger — FSM authored in Blender",
};

function Tokenize(text: string): string[]
{
  return text.toLowerCase().split(/\W+/).filter((token) => token.length > 1);
}

function MatchSections(intent: string): string[]
{
  const normalized = intent.toLowerCase();
  const tokens = Tokenize(intent);
  const matched = new Set<string>();

  for (const rule of SECTION_RULES)
  {
    for (const keyword of rule.keywords)
    {
      if (normalized.includes(keyword) || tokens.some((token) => keyword.includes(token) || token.includes(keyword)))
      {
        matched.add(rule.section);
        break;
      }
    }
  }

  if (matched.size === 0)
  {
    matched.add("lifecycle");
    matched.add("exposed");
  }

  return [...matched];
}

function MatchFragments(intent: string): string[]
{
  const normalized = intent.toLowerCase();
  const matched = new Set<string>();

  for (const rule of FRAGMENT_RULES)
  {
    for (const keyword of rule.keywords)
    {
      if (normalized.includes(keyword))
      {
        matched.add(rule.fragment);
        break;
      }
    }
  }

  return [...matched];
}

function PickReferenceBehavior(recipes: Recipe[], intent: string): string
{
  const playbook = MatchPlaybook(intent);
  if (playbook.referenceBehavior.length > 0)
  {
    return playbook.referenceBehavior.replace(/\.ts$/, "");
  }

  for (const recipe of recipes)
  {
    if (recipe.referenceBehavior.length > 0)
    {
      return recipe.referenceBehavior.replace(/\.ts$/, "");
    }
  }

  const similar = FindSimilarBehavior(intent);
  if (similar.length > 0)
  {
    return similar[0].name;
  }

  return "";
}

function BuildRecipeList(intent: string): PlannedRecipe[]
{
  const playbook = MatchPlaybook(intent);
  const playbookRecipe =
    playbook.recipe.length > 0 ? GetRecipeByName(playbook.recipe) : undefined;
  const matches = FindRecipesByIntent(intent);

  const chosen: Recipe[] = [];

  if (playbookRecipe !== undefined)
  {
    chosen.push(playbookRecipe);
  }

  for (const recipe of matches)
  {
    if (!chosen.some((entry) => entry.name === recipe.name))
    {
      chosen.push(recipe);
    }
  }

  if (chosen.length === 0)
  {
    chosen.push(GetRecipeByName("minimal-behavior")!);
  }

  const slice = chosen.slice(0, 3);

  return slice.map((recipe, index) => ({
    name: recipe.name,
    description: recipe.description,
    role:
      index === 0
        ? RECIPE_ROLES[recipe.name] ?? "primary pattern"
        : RECIPE_ROLES[recipe.name] ?? "compose with primary",
  }));
}

function CollectPitfalls(recipes: Recipe[]): string[]
{
  const pitfalls = new Set<string>();

  for (const recipe of recipes)
  {
    for (const pitfall of recipe.pitfalls)
    {
      pitfalls.add(pitfall);
    }
  }

  pitfalls.add("Call validate_behavior before saving; fix errors and revalidate.");
  pitfalls.add("Class name must match filename stem; use export default.");

  return [...pitfalls];
}

function CollectExposedHints(recipes: Recipe[]): string[]
{
  const hints = new Set<string>();

  for (const recipe of recipes)
  {
    for (const field of recipe.exposedFields)
    {
      hints.add(field);
    }
  }

  return [...hints];
}

function BuildSteps(plan: Omit<BehaviorPlan, "steps">, className: string): string[]
{
  const primaryRecipe = plan.recipes[0]?.name ?? "minimal-behavior";
  const steps = [
    `plan_behavior — done (this plan)`,
    `get_recipe_template(recipe="${primaryRecipe}", className="${className}")`,
  ];

  if (plan.sections.includes("input"))
  {
    steps.push("list_input_actions — use real action names (never key codes)");
  }

  if (plan.intent.toLowerCase().match(/entity|wheel|target|waypoint|camera/))
  {
    steps.push('list_scene_entities(level="Train Scene", filter=…) — ground @exposed entity picks');
  }

  if (plan.referenceBehavior.length > 0)
  {
    steps.push(`find_similar_behavior(query="${plan.referenceBehavior}", includeSource=true)`);
  }

  for (const section of plan.sections)
  {
    steps.push(`get_scripting_context(section="${section}")`);
  }

  for (const fragment of plan.fragments)
  {
    steps.push(`get_fragment(name="${fragment}")`);
  }

  steps.push("Merge templates + fragments; customize logic");
  steps.push(`validate_behavior(source, "${className}.ts") — repeat until valid`);
  steps.push("get_style_guide if validation reports brace/void warnings");

  return steps;
}

/** Build a structured implementation plan for a behavior intent. */
export function PlanBehavior(intent: string, className = "MyBehavior"): BehaviorPlan
{
  const recipeMatches = FindRecipesByIntent(intent);
  const recipes = BuildRecipeList(intent);
  const sections = MatchSections(intent);
  const fragments = MatchFragments(intent);
  const referenceBehavior = PickReferenceBehavior(recipeMatches, intent);
  const exposedHints = CollectExposedHints(recipeMatches);
  const pitfalls = CollectPitfalls(recipeMatches);

  const partial = {
    intent,
    recipes,
    sections,
    fragments,
    referenceBehavior,
    exposedHints,
    pitfalls,
  };

  return {
    ...partial,
    steps: BuildSteps(partial, className),
  };
}

export function FormatBehaviorPlan(plan: BehaviorPlan): string
{
  const playbook = MatchPlaybook(plan.intent);
  const lines: string[] = [
    `# Behavior plan`,
    ``,
    `**Intent:** ${plan.intent}`,
    ``,
    `**Matched playbook:** \`${playbook.id}\` — ${playbook.title}`,
  ];

  if (playbook.recipe.length > 0)
  {
    lines.push(`**Primary recipe:** \`${playbook.recipe}\``);
  }

  if (playbook.referenceBehavior.length > 0)
  {
    lines.push(`**Reference behavior:** ${playbook.referenceBehavior.replace(/\.ts$/, "")}.ts`);
  }

  lines.push(``, `## Recipes`);

  for (const recipe of plan.recipes)
  {
    lines.push(`- **${recipe.name}** — ${recipe.description}`);
    lines.push(`  - Role: ${recipe.role}`);
  }

  lines.push(``, `## Scripting sections to fetch`);
  for (const section of plan.sections)
  {
    lines.push(`- \`${section}\` → get_scripting_context(section="${section}")`);
  }

  if (plan.fragments.length > 0)
  {
    lines.push(``, `## Fragments`);
    for (const fragment of plan.fragments)
    {
      lines.push(`- \`${fragment}\``);
    }
  }

  if (plan.referenceBehavior.length > 0)
  {
    lines.push(``, `## Reference behavior`, `- ${plan.referenceBehavior}.ts`);
  }

  if (plan.exposedHints.length > 0)
  {
    lines.push(``, `## Suggested @exposed fields`);
    for (const hint of plan.exposedHints)
    {
      lines.push(`- \`${hint}\``);
    }
  }

  lines.push(``, `## Pitfalls`);
  for (const pitfall of plan.pitfalls)
  {
    lines.push(`- ${pitfall}`);
  }

  lines.push(``, `## Steps`);
  for (const [index, step] of plan.steps.entries())
  {
    lines.push(`${index + 1}. ${step}`);
  }

  return lines.join("\n");
}
