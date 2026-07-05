import { readFileSync, existsSync } from "node:fs";
import { DOCS } from "./paths.js";
import { FindRecipesByIntent, GetRecipeByName } from "./recipes.js";

export interface PlaybookRoute
{
  id: string;
  title: string;
  keywords: string[];
  recipe: string;
  referenceBehavior: string;
  needsInput: boolean;
  needsSceneEntities: boolean;
  needsPhysics: boolean;
}

/** Keyword routing table — full steps live in docs/LLM_PLAYBOOK.md per id. */
export const PLAYBOOK_ROUTES: PlaybookRoute[] = [
  {
    id: "first-behavior",
    title: "Your first empty behavior",
    keywords: ["first", "empty", "hello", "starter", "new", "minimal", "test"],
    recipe: "minimal-behavior",
    referenceBehavior: "",
    needsInput: false,
    needsSceneEntities: false,
    needsPhysics: false,
  },
  {
    id: "player-mover",
    title: "WASD / gamepad character mover",
    keywords: ["wasd", "walk", "move", "player", "character", "mover", "stick", "fps"],
    recipe: "input-poll-move",
    referenceBehavior: "InputMover",
    needsInput: true,
    needsSceneEntities: false,
    needsPhysics: false,
  },
  {
    id: "trigger-reaction",
    title: "React when player enters a trigger",
    keywords: ["trigger", "overlap", "enter", "zone", "pad", "door", "message", "onmessage"],
    recipe: "on-message-handler",
    referenceBehavior: "MessageLogger",
    needsInput: false,
    needsSceneEntities: true,
    needsPhysics: false,
  },
  {
    id: "moving-platform",
    title: "Kinematic platform that moves back and forth",
    keywords: ["platform", "elevator", "patrol", "oscillate", "kinematic", "moving", "bob"],
    recipe: "patrol-oscillate",
    referenceBehavior: "Patrol",
    needsInput: false,
    needsSceneEntities: false,
    needsPhysics: true,
  },
  {
    id: "waypoint-patrol",
    title: "Move through a list of 3D points",
    keywords: ["waypoint", "patrol", "points", "lerp", "path", "route"],
    recipe: "waypoint-path",
    referenceBehavior: "Waypoints",
    needsInput: false,
    needsSceneEntities: false,
    needsPhysics: true,
  },
  {
    id: "train-on-path",
    title: "Train / vehicle on Path3D with throttle",
    keywords: ["train", "rail", "path3d", "throttle", "spline", "tangent", "acceleration"],
    recipe: "path-follow-advanced",
    referenceBehavior: "TrainBehavior",
    needsInput: true,
    needsSceneEntities: true,
    needsPhysics: true,
  },
  {
    id: "rover-drive",
    title: "Wheeled rover with hinge motors",
    keywords: ["rover", "wheel", "car", "vehicle", "drive", "hinge", "motor", "tank"],
    recipe: "rover-wheel-drive",
    referenceBehavior: "CarController",
    needsInput: true,
    needsSceneEntities: true,
    needsPhysics: true,
  },
  {
    id: "spin-object",
    title: "Spin on an axis",
    keywords: ["spin", "rotate", "turntable", "rpm", "constant"],
    recipe: "constant-rotate",
    referenceBehavior: "Rotator",
    needsInput: false,
    needsSceneEntities: false,
    needsPhysics: false,
  },
  {
    id: "look-at-target",
    title: "Face another object each frame",
    keywords: ["look", "face", "aim", "turret", "track", "at"],
    recipe: "look-at-target",
    referenceBehavior: "LookAt",
    needsInput: false,
    needsSceneEntities: true,
    needsPhysics: false,
  },
  {
    id: "animation-cycle",
    title: "Cycle animation clips on an armature",
    keywords: ["animation", "clip", "walk", "idle", "armature", "nla"],
    recipe: "animation-cycle",
    referenceBehavior: "ClipSwitcher",
    needsInput: false,
    needsSceneEntities: false,
    needsPhysics: false,
  },
  {
    id: "reveal-on-trigger",
    title: "Show a hidden object when triggered",
    keywords: ["reveal", "show", "hidden", "invisible", "appear"],
    recipe: "reveal-on-message",
    referenceBehavior: "",
    needsInput: false,
    needsSceneEntities: false,
    needsPhysics: false,
  },
  {
    id: "sound-on-trigger",
    title: "Play a sound when triggered",
    keywords: ["sound", "audio", "sfx", "play", "door"],
    recipe: "sound-on-message",
    referenceBehavior: "",
    needsInput: false,
    needsSceneEntities: false,
    needsPhysics: false,
  },
  {
    id: "update-msdf-label",
    title: "Change MSDF 3D label text at runtime",
    keywords: ["msdf", "text", "label", "score", "hud", "font"],
    recipe: "msdf-label-update",
    referenceBehavior: "",
    needsInput: false,
    needsSceneEntities: false,
    needsPhysics: false,
  },
  {
    id: "orbit-camera",
    title: "Script-built camera orbiting a target",
    keywords: ["camera", "orbit", "follow", "spectator", "cinematic"],
    recipe: "camera-follow",
    referenceBehavior: "TrainCamera",
    needsInput: false,
    needsSceneEntities: true,
    needsPhysics: false,
  },
  {
    id: "geospatial-flyto",
    title: "Fly globe camera to a marker",
    keywords: ["geospatial", "globe", "planet", "map", "flyto", "fly to", "earth"],
    recipe: "geospatial-camera-flyto",
    referenceBehavior: "",
    needsInput: false,
    needsSceneEntities: true,
    needsPhysics: false,
  },
  {
    id: "debug-triggers",
    title: "Log physics trigger overlaps",
    keywords: ["debug", "log", "trigger", "collision", "test"],
    recipe: "trigger-logger",
    referenceBehavior: "TriggerLogger",
    needsInput: false,
    needsSceneEntities: false,
    needsPhysics: false,
  },
];

function Tokenize(text: string): string[]
{
  return text.toLowerCase().split(/\W+/).filter((token) => token.length > 1);
}

/** Pick the best playbook for a plain-English intent. */
export function MatchPlaybook(intent: string): PlaybookRoute
{
  const normalized = intent.toLowerCase();
  const tokens = Tokenize(intent);

  let best: PlaybookRoute = PLAYBOOK_ROUTES[0];
  let bestScore = 0;

  for (const route of PLAYBOOK_ROUTES)
  {
    let score = 0;

    if (normalized.includes(route.id.replace(/-/g, " ")))
    {
      score += 15;
    }

    for (const keyword of route.keywords)
    {
      if (normalized.includes(keyword))
      {
        score += 6;
      }

      for (const token of tokens)
      {
        if (keyword.includes(token) || token.includes(keyword))
        {
          score += 2;
        }
      }
    }

    if (score > bestScore)
    {
      bestScore = score;
      best = route;
    }
  }

  // Also boost via recipe matcher
  const recipeMatch = FindRecipesByIntent(intent)[0];
  if (recipeMatch !== undefined)
  {
    const byRecipe = PLAYBOOK_ROUTES.find((route) => route.recipe === recipeMatch.name);
    if (byRecipe !== undefined && bestScore < 8)
    {
      return byRecipe;
    }
  }

  return best;
}

export function GetPlaybookRoute(id: string): PlaybookRoute | undefined
{
  const normalized = id.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return PLAYBOOK_ROUTES.find(
    (route) => route.id === normalized || route.id.includes(normalized)
  );
}

/** Read one playbook section from docs/LLM_PLAYBOOK.md. */
export function ReadPlaybookMarkdown(id: string): string | undefined
{
  if (!existsSync(DOCS.playbook))
  {
    return undefined;
  }

  const markdown = readFileSync(DOCS.playbook, "utf-8");
  const pattern = new RegExp(`## Playbook: ${id}\\b([\\s\\S]*?)(?=\\n## |$)`, "i");
  const match = markdown.match(pattern);

  if (match === null)
  {
    return undefined;
  }

  return `## Playbook: ${id}${match[1]}`.trim();
}

export function ListPlaybooksMarkdown(): string
{
  const lines = [
    "# Playbooks",
    "",
    "| Slug | Title | Recipe | Reference |",
    "|------|-------|--------|-----------|",
  ];

  for (const route of PLAYBOOK_ROUTES)
  {
    lines.push(
      `| \`${route.id}\` | ${route.title} | \`${route.recipe}\` | ${route.referenceBehavior || "—"} |`
    );
  }

  lines.push("", "Call `get_playbook(name=\"…\")` or `route_task(intent)` for full steps.");
  return lines.join("\n");
}

function BuildMandatorySteps(route: PlaybookRoute, className: string, intent: string): string[]
{
  const steps: string[] = [
    `get_do_not_list() — skim silent failures`,
    `get_engine_basics(topic="components-vs-behaviors") — if first behavior this session`,
    `plan_behavior(intent="${intent.replace(/"/g, '\\"')}", className="${className}")`,
    `get_recipe_template(recipe="${route.recipe}", className="${className}")`,
  ];

  if (route.needsInput)
  {
    steps.push(`list_input_actions() — copy real action names into FindAction calls`);
  }

  if (route.needsSceneEntities)
  {
    steps.push(`list_levels() then list_scene_entities(level="…", filter="…") — real entity names for @exposed`);
  }

  if (route.needsPhysics)
  {
    steps.push(`get_physics_movement() — read decision tree before any node.position writes`);
  }

  const recipe = GetRecipeByName(route.recipe);
  if (recipe !== undefined)
  {
    for (const section of ["lifecycle", "exposed"])
    {
      if (!steps.some((step) => step.includes(section)))
      {
        // add scripting sections from recipe pitfalls - skip, plan_behavior covers it
      }
    }
  }

  if (route.referenceBehavior.length > 0)
  {
    steps.push(`find_similar_behavior(query="${route.referenceBehavior}", includeSource=true)`);
  }

  steps.push(`Edit the template — do NOT blank-page rewrite`);
  steps.push(`get_scripting_context(section="…") — only sections plan_behavior lists`);
  steps.push(`validate_behavior(source, "${className}.ts") — fix ALL errors; repeat until valid`);

  return steps;
}

/** Full routed guide for an intent — primary entry point for weak models. */
export function FormatRouteTask(intent: string, className: string): string
{
  const route = MatchPlaybook(intent);
  const playbookBody = ReadPlaybookMarkdown(route.id);
  const mandatory = BuildMandatorySteps(route, className, intent);

  const lines = [
    `# Routed task`,
    ``,
    `**Your intent:** ${intent}`,
    `**Class / file:** \`${className}.ts\` (class name MUST equal stem)`,
    `**Matched playbook:** \`${route.id}\` — ${route.title}`,
    `**Recipe:** \`${route.recipe}\``,
    ``,
    `## MCP steps — execute in order (do not skip)`,
    ``,
  ];

  for (const [index, step] of mandatory.entries())
  {
    lines.push(`${index + 1}. \`${step}\``);
  }

  lines.push(
    ``,
    `## Human docs (if stuck)`,
    `- Playbook: \`docs/LLM_PLAYBOOK.md\` › Playbook: ${route.id}`,
    `- Engine: \`docs/engine/14-API-GUIDE.html\``,
    `- Feature list: \`docs/engine/13-FEATURE-LIST.html\``,
    `- Frame loop: \`docs/engine/02-RUNTIME-BASICS.html\``,
    ``
  );

  if (playbookBody !== undefined)
  {
    lines.push(`---`, ``, playbookBody);
  }
  else
  {
    lines.push(
      `---`,
      ``,
      `(Playbook section not found in LLM_PLAYBOOK.md — use recipe \`${route.recipe}\` and reference \`${route.referenceBehavior || "minimal-behavior"}\`.)`
    );
  }

  return lines.join("\n");
}

export function FormatPlaybook(id: string): string
{
  const route = GetPlaybookRoute(id);
  const body = ReadPlaybookMarkdown(id);

  if (route === undefined && body === undefined)
  {
    const available = PLAYBOOK_ROUTES.map((entry) => entry.id).join(", ");
    return `Unknown playbook "${id}". Available: ${available}\n\nCall list_playbooks() for the table.`;
  }

  const lines = [`# Playbook: ${id}`, ``];

  if (route !== undefined)
  {
    lines.push(`**Title:** ${route.title}`);
    lines.push(`**Recipe:** \`${route.recipe}\``);
    lines.push(`**Reference behavior:** ${route.referenceBehavior || "none"}`);
    lines.push(``);
  }

  if (body !== undefined)
  {
    lines.push(body);
  }

  return lines.join("\n");
}
