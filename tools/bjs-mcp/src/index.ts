#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { FormatSectionList, FindDocSection, ParseDocSections, ReadDoc } from "./docs.js";
import { BuildExposedSnippet, GetFragment, FRAGMENTS } from "./fragments.js";
import {
  FindSimilarBehavior,
  FormatBehaviorCatalog,
  FormatInputActions,
  ListBehaviorCatalog,
  ListBehaviorFiles,
  ListInputActions,
  ReadBehaviorFile,
} from "./io.js";
import { FormatBehaviorPlan, PlanBehavior } from "./plan.js";
import { DOCS } from "./paths.js";
import {
  FindRecipesByIntent,
  GetRecipeByName,
  GetRecipeTemplate,
  RECIPES,
} from "./recipes.js";
import { FormatValidationResult, ValidateBehavior } from "./validate.js";
import { FormatSceneSummary, ListLevels, LoadSceneSummary } from "./scene.js";
import { FormatPreflight } from "./preflight.js";
import {
  FormatPlaybook,
  FormatRouteTask,
  ListPlaybooksMarkdown,
  MatchPlaybook,
} from "./playbooks.js";
import { FormatDoNotList } from "./pitfalls.js";
import { GetEngineBasics } from "./engine-basics.js";
import { FormatChapter, FormatChapterList, SearchDocs } from "./human-docs.js";
import { FormatAuthoringWorkflow } from "./workflow.js";
import { SearchBjsDocs, FetchBjsDoc } from "./bjs-docs.js";
import {
  FormatMovementMode,
  FormatMovementOverview,
  GetMovementMode,
  MOVEMENT_MODES,
} from "./physics.js";
import {
  FormatAxisConversion,
} from "./axis-conversion.js";

const server = new McpServer({
  name: "bjs-level-kit",
  version: "1.5.0",
});

// --- Resources -------------------------------------------------------------

server.resource(
  "kernel",
  "bjs://docs/kernel",
  {
    description: "Minimal behavior authoring kernel (LLM_KERNEL.md) — start here for small models",
    mimeType: "text/markdown",
  },
  async () => ({
    contents: [
      {
        uri: "bjs://docs/kernel",
        mimeType: "text/markdown",
        text: readFileSync(DOCS.kernel, "utf-8"),
      },
    ],
  })
);

server.resource(
  "scripting-context",
  "bjs://docs/scripting-context",
  {
    description: "Full behavior authoring contract (LLM_SCRIPTING_CONTEXT.md)",
    mimeType: "text/markdown",
  },
  async () => ({
    contents: [
      {
        uri: "bjs://docs/scripting-context",
        mimeType: "text/markdown",
        text: readFileSync(DOCS.scriptingContext, "utf-8"),
      },
    ],
  })
);

server.resource(
  "playbook",
  "bjs://docs/playbook",
  {
    description: "Task playbooks with Blender setup + MCP steps (LLM_PLAYBOOK.md) — use route_task first",
    mimeType: "text/markdown",
  },
  async () => ({
    contents: [
      {
        uri: "bjs://docs/playbook",
        mimeType: "text/markdown",
        text: readFileSync(DOCS.playbook, "utf-8"),
      },
    ],
  })
);

server.resource(
  "style-guide",
  "bjs://docs/style-guide",
  {
    description: "TypeScript style rules for behaviors and engine code",
    mimeType: "text/markdown",
  },
  async () => ({
    contents: [
      {
        uri: "bjs://docs/style-guide",
        mimeType: "text/markdown",
        text: readFileSync(DOCS.styleGuide, "utf-8"),
      },
    ],
  })
);

for (const behaviorName of ListBehaviorFiles().map((file) => file.replace(/\.ts$/, "")))
{
  const uri = `bjs://behaviors/${behaviorName}`;
  server.resource(
    `behavior-${behaviorName}`,
    uri,
    {
      description: `Example behavior: ${behaviorName}.ts`,
      mimeType: "text/typescript",
    },
    async () => ({
      contents: [
        {
          uri,
          mimeType: "text/typescript",
          text: ReadBehaviorFile(behaviorName) ?? "",
        },
      ],
    })
  );
}

// --- Tools -----------------------------------------------------------------

server.tool(
  "route_task",
  "**START HERE** for any behavior task. Given plain-English intent + class name, returns matched playbook, numbered MCP steps (do not skip), Blender setup, and human doc links. Weaker models should call this before writing code.",
  {
    intent: z.string().describe("What the behavior should do, e.g. 'wasd player mover on rover'"),
    className: z
      .string()
      .describe("PascalCase class and filename stem, e.g. RoverDrive (writes RoverDrive.ts)"),
  },
  async ({ intent, className }) => ({
    content: [{ type: "text", text: FormatRouteTask(intent, className) }],
  })
);

server.tool(
  "preflight_behavior",
  "Checklist before writing behavior source: identity, grounding tools to call, recipe, Blender steps, and a plan_behavior preview. Call immediately after route_task.",
  {
    intent: z.string().describe("What the behavior should do"),
    className: z.string().describe("PascalCase class / filename stem"),
  },
  async ({ intent, className }) => ({
    content: [{ type: "text", text: FormatPreflight(intent, className) }],
  })
);

server.tool(
  "get_playbook",
  "Return one task playbook from docs/LLM_PLAYBOOK.md (Blender setup, MCP steps, do-not list).",
  {
    name: z
      .string()
      .describe(
        'Playbook slug, e.g. "player-mover", "rover-drive", "train-on-path". Call list_playbooks() for all.'
      ),
  },
  async ({ name }) => ({
    content: [{ type: "text", text: FormatPlaybook(name) }],
  })
);

server.tool(
  "list_playbooks",
  "Table of all task playbooks (slug → recipe → reference behavior).",
  {},
  async () => ({
    content: [{ type: "text", text: ListPlaybooksMarkdown() }],
  })
);

server.tool(
  "get_engine_basics",
  "Distilled engine concepts tied to human docs (architecture, frame loop, components vs behaviors, load order, blender vs behavior). For weak models — read before guessing how the engine works.",
  {
    topic: z
      .string()
      .optional()
      .describe(
        'Topic slug: architecture, frame-loop, components-vs-behaviors, load-order, blender-vs-behavior. Omit or "list" for index.'
      ),
  },
  async ({ topic }) => ({
    content: [{ type: "text", text: GetEngineBasics(topic) }],
  })
);

server.tool(
  "list_doc_chapters",
  "List every human documentation chapter (engine, blender, control-panel, quickstart, LLM contracts) with slugs for get_doc_chapter. Use when you need engine/Blender knowledge beyond the scripting contract.",
  {},
  async () => ({
    content: [{ type: "text", text: FormatChapterList() }],
  })
);

server.tool(
  "get_doc_chapter",
  "Return one documentation chapter as markdown — full engine/Blender prose (load pipeline, physics, rendering, components, export, …), not just the LLM contract. Optionally one section.",
  {
    chapter: z
      .string()
      .describe(
        'Chapter slug from list_doc_chapters, e.g. "engine/04-load-pipeline", "blender/02-components", "kernel"'
      ),
    section: z
      .string()
      .optional()
      .describe('Optional section heading slug. Use section="list" to see the chapter\'s sections.'),
  },
  async ({ chapter, section }) => ({
    content: [{ type: "text", text: FormatChapter(chapter, section) }],
  })
);

server.tool(
  "search_docs",
  "Semantic search across ALL documentation (engine + Blender prose chapters, quickstart, LLM contract docs). Uses local embeddings with keyword boosting — no external server. Returns matching sections with fetch commands. Use when you don't know which chapter covers a topic.",
  {
    query: z.string().describe('Search term, e.g. "reflection probe", "disablePreStep", "freeze shadows"'),
    maxResults: z.number().optional().describe("Max sections to return (default 8)"),
  },
  async ({ query, maxResults }) => ({
    content: [{ type: "text", text: await SearchDocs(query, maxResults ?? 8) }],
  })
);

server.tool(
  "get_do_not_list",
  "Silent failures and wrong approaches (onStart, DYNAMIC+position, invented input names, …) with fixes and which MCP tool to call.",
  {},
  async () => ({
    content: [{ type: "text", text: FormatDoNotList() }],
  })
);

server.tool(
  "get_authoring_workflow",
  "Return the recommended bjs-mcp tool order, section slugs, resources, and human doc links. Call when unsure which tool to use next.",
  {},
  async () => ({
    content: [{ type: "text", text: FormatAuthoringWorkflow() }],
  })
);

server.tool(
  "get_kernel",
  "Return docs/LLM_KERNEL.md — minimal behavior contract. Use route_task for task-specific steps; kernel for invariant rules only.",
  {},
  async () => ({
    content: [{ type: "text", text: ReadDoc(DOCS.kernel) }],
  })
);

server.tool(
  "plan_behavior",
  "Build a structured implementation plan for a behavior intent: recipes, doc sections, fragments, reference behavior, pitfalls, and ordered steps. Call this before writing complex scripts.",
  {
    intent: z.string().describe("Plain-English description of what the behavior should do"),
    className: z
      .string()
      .optional()
      .describe("Planned class/filename stem (e.g. TrainDriver). Defaults to MyBehavior."),
  },
  async ({ intent, className }) => ({
    content: [
      {
        type: "text",
        text: FormatBehaviorPlan(PlanBehavior(intent, className ?? "MyBehavior")),
      },
    ],
  })
);

server.tool(
  "get_behavior",
  "Return the full source of a playground example behavior by class/filename stem.",
  {
    name: z.string().describe("Behavior stem, e.g. CarController or CarController.ts"),
  },
  async ({ name }) =>
  {
    const stem = name.replace(/\.tsx?$/i, "");
    const source = ReadBehaviorFile(stem);

    if (source === undefined)
    {
      const available = ListBehaviorFiles().map((file) => file.replace(/\.ts$/, "")).join(", ");
      return {
        content: [
          {
            type: "text",
            text: `Behavior "${stem}" not found. Available: ${available}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: `// ${stem}.ts\n\n${source}` }],
    };
  }
);

server.tool(
  "list_levels",
  "List exported level folder names under game/public/levels/.",
  {},
  async () =>
  {
    const levels = ListLevels();
    return {
      content: [
        {
          type: "text",
          text:
            levels.length > 0
              ? levels.map((entry) => `- ${entry}`).join("\n")
              : "No levels found under game/public/levels/.",
        },
      ],
    };
  }
);

server.tool(
  "list_behaviors",
  "List all playground example behaviors with a one-line summary and lifecycle hooks.",
  {},
  async () => ({
    content: [{ type: "text", text: FormatBehaviorCatalog(ListBehaviorCatalog()) }],
  })
);

server.tool(
  "list_fragments",
  "List all paste-in code fragments (hinge motor, Path3D, MSDF text, reveal, …).",
  {},
  async () => ({
    content: [
      {
        type: "text",
        text: FRAGMENTS.map((fragment) => `- **${fragment.name}** — ${fragment.description}`).join(
          "\n"
        ),
      },
    ],
  })
);

server.tool(
  "list_scene_entities",
  "List entities from a level scene.json manifest — names, tags, component types, scripts, light types, and enabled scene atmosphere / post-processing (incl. volumetric light scattering). Ground @exposed entity picks.",
  {
    level: z
      .string()
      .optional()
      .describe('Level folder name (e.g. "Train Scene"). Omit to list available levels.'),
    filter: z
      .string()
      .optional()
      .describe("Optional substring filter on name, tag, component type, or script"),
  },
  async ({ level, filter }) =>
  {
    if (level === undefined || level.trim().length === 0)
    {
      const levels = ListLevels();
      return {
        content: [
          {
            type: "text",
            text:
              levels.length > 0
                ? `Available levels:\n${levels.map((entry) => `- ${entry}`).join("\n")}\n\nCall again with level="…" for entities.`
                : "No levels found under game/public/levels/.",
          },
        ],
      };
    }

    const summary = LoadSceneSummary(level, filter);
    if (summary === undefined)
    {
      const levels = ListLevels();
      return {
        content: [
          {
            type: "text",
            text: `Level "${level}" not found. Available: ${levels.join(", ") || "(none)"}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: FormatSceneSummary(summary) }],
    };
  }
);

server.tool(
  "get_style_guide",
  "Return docs/STYLE_GUIDE.md — full guide or a single section (naming, braces, types, etc.). Call before writing or reviewing behavior code.",
  {
    section: z
      .string()
      .optional()
      .describe(
        "Optional section slug: overview, naming, braces-and-spacing, functions-and-methods, comments, types-and-null-handling, general, terminology-component-vs-behavior. Omit for the full guide."
      ),
  },
  async ({ section }) =>
  {
    const markdown = ReadDoc(DOCS.styleGuide);
    const sections = ParseDocSections(markdown);

    if (section === "list")
    {
      return {
        content: [
          {
            type: "text",
            text: `STYLE_GUIDE.md sections:\n\n${FormatSectionList(sections)}`,
          },
        ],
      };
    }

    const text = FindDocSection(sections, section);
    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "get_scripting_context",
  "Return docs/LLM_SCRIPTING_CONTEXT.md — full contract or one section (exposed, input, physics, cameras, scene-look, prefab-spawn, visibility, lifecycle, etc.).",
  {
    section: z
      .string()
      .optional()
      .describe(
        'Optional section slug, e.g. "exposed", "input", "physics", "cameras", "scene-look", "prefab-spawn", "level-session". Use section="list" to see all. Omit for the full doc.'
      ),
  },
  async ({ section }) =>
  {
    const markdown = ReadDoc(DOCS.scriptingContext);
    const sections = ParseDocSections(markdown);

    if (section === "list")
    {
      return {
        content: [
          {
            type: "text",
            text: `LLM_SCRIPTING_CONTEXT.md sections:\n\n${FormatSectionList(sections)}`,
          },
        ],
      };
    }

    const text = FindDocSection(sections, section);
    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "list_recipes",
  "List all behavior recipes (patterns) with descriptions and reference behaviors.",
  {},
  async () => ({
    content: [
      {
        type: "text",
        text: RECIPES.map((recipe) =>
          [
            `## ${recipe.name}`,
            recipe.description,
            `Hooks: ${recipe.hooks.length > 0 ? recipe.hooks.join(", ") : "(shell only)"}`,
            `Reference: ${recipe.referenceBehavior || "none"}`,
            `Keywords: ${recipe.keywords.join(", ")}`,
          ].join("\n")
        ).join("\n\n"),
      },
    ],
  })
);

server.tool(
  "suggest_recipe",
  "Suggest behavior recipes for a plain-English intent (e.g. 'train follows waypoints').",
  { intent: z.string().describe("What the behavior should do") },
  async ({ intent }) =>
  {
    const playbook = MatchPlaybook(intent);
    const matches = FindRecipesByIntent(intent);

    if (matches.length === 0 && playbook.recipe.length === 0)
    {
      return {
        content: [
          {
            type: "text",
            text: `No strong recipe match for "${intent}". Try list_recipes or use recipe "minimal-behavior" and find_similar_behavior for examples.`,
          },
        ],
      };
    }

    const header = [
      `**Matched playbook:** \`${playbook.id}\` — ${playbook.title}`,
      playbook.recipe.length > 0 ? `**Primary recipe:** \`${playbook.recipe}\`` : "",
      playbook.referenceBehavior.length > 0
        ? `**Reference:** ${playbook.referenceBehavior.replace(/\.ts$/, "")}.ts`
        : "",
      "",
    ]
      .filter((line) => line.length > 0)
      .join("\n");

    const recipeLines =
      matches.length > 0
        ? matches
            .slice(0, 5)
            .map((recipe, index) =>
              [
                `${index + 1}. **${recipe.name}** — ${recipe.description}`,
                `   Reference: ${recipe.referenceBehavior || "none"}`,
                `   Hooks: ${recipe.hooks.join(", ") || "none"}`,
                `   Pitfalls: ${recipe.pitfalls.join("; ")}`,
              ].join("\n")
            )
            .join("\n\n")
        : `(No additional recipe matches — use playbook \`${playbook.id}\`.)`;

    return {
      content: [{ type: "text", text: `${header}\n## Recipes\n\n${recipeLines}` }],
    };
  }
);

server.tool(
  "get_recipe_template",
  "Return a complete, valid behavior skeleton for a named recipe.",
  {
    recipe: z.string().describe("Recipe name from list_recipes or suggest_recipe"),
    className: z.string().describe("Behavior class name (must match filename stem)"),
  },
  async ({ recipe, className }) =>
  {
    const recipeInfo = GetRecipeByName(recipe);
    if (recipeInfo === undefined)
    {
      return {
        content: [
          {
            type: "text",
            text: `Unknown recipe "${recipe}". Call list_recipes for valid names.`,
          },
        ],
        isError: true,
      };
    }

    const template = GetRecipeTemplate(recipe, className);
    if (template === undefined)
    {
      return {
        content: [{ type: "text", text: `Could not build template for recipe "${recipe}".` }],
        isError: true,
      };
    }

    const header = [
      `Recipe: ${recipe}`,
      `Reference: ${recipeInfo.referenceBehavior || "none"}`,
      `Pitfalls: ${recipeInfo.pitfalls.join("; ")}`,
      "",
    ].join("\n");

    return { content: [{ type: "text", text: header + template }] };
  }
);

server.tool(
  "get_exposed_field_snippet",
  "Return a Blender-parse-safe @exposed field declaration.",
  {
    type: z
      .enum([
        "float",
        "int",
        "bool",
        "string",
        "file",
        "vector3",
        "color",
        "entity",
        "enum",
        "list-float",
        "list-vector3",
        "list-entity",
      ])
      .describe("Exposed field type"),
    name: z.string().optional().describe("Field name (camelCase)"),
    label: z.string().optional().describe("Blender UI label"),
    defaultValue: z.string().optional().describe("Default for scalar/string/enum types"),
    enumOptions: z.array(z.string()).optional().describe("Enum dropdown options"),
    vector: z.tuple([z.number(), z.number(), z.number()]).optional().describe("Vector3/Color components"),
    listDefaults: z.string().optional().describe('Comma-separated floats for list-float, e.g. "1, 2, 3"'),
  },
  async (args) => ({
    content: [{ type: "text", text: BuildExposedSnippet(args.type, args) }],
  })
);

server.tool(
  "list_input_actions",
  "List input action maps and action names from the playground app.",
  {},
  async () => ({
    content: [{ type: "text", text: FormatInputActions(ListInputActions()) }],
  })
);

server.tool(
  "find_similar_behavior",
  "Find example behavior files similar to a keyword or recipe name; optionally return full source.",
  {
    query: z.string().describe("Keyword, recipe name, or behavior stem (e.g. Waypoints)"),
    includeSource: z.boolean().optional().describe("Include full .ts source of the best match"),
  },
  async ({ query, includeSource }) =>
  {
    const matches = FindSimilarBehavior(query);

    if (matches.length === 0)
    {
      const available = ListBehaviorFiles().map((file) => file.replace(/\.ts$/, "")).join(", ");
      return {
        content: [
          {
            type: "text",
            text: `No similar behavior for "${query}". Available: ${available}`,
          },
        ],
      };
    }

    const lines = matches.slice(0, 5).map((match, index) => `${index + 1}. ${match.name} (score ${match.score})`);
    let text = lines.join("\n");

    if (includeSource === true)
    {
      const best = matches[0].name;
      const source = ReadBehaviorFile(best);
      text += `\n\n--- ${best}.ts ---\n\n${source ?? "(not found)"}`;
    }

    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "validate_behavior",
  "Validate a behavior draft against Blender-parse rules and project conventions. Pair with get_style_guide for formatting rules.",
  {
    source: z.string().describe("Full behavior TypeScript source"),
    filename: z
      .string()
      .optional()
      .describe("Optional filename for class/filename stem check (e.g. Patrol.ts)"),
  },
  async ({ source, filename }) =>
  {
    const result = ValidateBehavior(source, filename);
    return {
      content: [{ type: "text", text: FormatValidationResult(result) }],
      isError: !result.valid,
    };
  }
);

server.tool(
  "get_fragment",
  "Return a paste-in code fragment for common behavior patterns.",
  {
    name: z
      .string()
      .describe(`Fragment name. Available: ${FRAGMENTS.map((fragment) => fragment.name).join(", ")}`),
  },
  async ({ name }) =>
  {
    const fragment = GetFragment(name);
    if (fragment === undefined)
    {
      const available = FRAGMENTS.map((entry) => entry.name).join(", ");
      return {
        content: [{ type: "text", text: `Unknown fragment "${name}". Available: ${available}` }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `${fragment.description}\n\n\`\`\`ts\n${fragment.code}\n\`\`\``,
        },
      ],
    };
  }
);

server.tool(
  "get_physics_movement",
  "How to move an entity correctly based on its physics body. Returns a decision tree (no body / DYNAMIC / ANIMATED teleport / ANIMATED continuous / toggle) with copy-in patterns and the disablePreStep + setTargetTransform pitfalls. Call before writing any behavior that moves a body, or when a mesh \"won't move\" or \"moves forever\".",
  {
    mode: z
      .enum([
        "no-body",
        "dynamic",
        "animated-teleport",
        "animated-continuous",
        "toggle-dynamic-animated",
      ])
      .optional()
      .describe("Movement mode to return. Omit for the decision tree + mode list."),
  },
  async ({ mode }) =>
  {
    if (mode === undefined)
    {
      return { content: [{ type: "text", text: FormatMovementOverview() }] };
    }

    const found = GetMovementMode(mode);
    if (found === undefined)
    {
      const available = MOVEMENT_MODES.map((entry) => entry.name).join(", ");
      return {
        content: [{ type: "text", text: `Unknown mode "${mode}". Available: ${available}` }],
        isError: true,
      };
    }

    return { content: [{ type: "text", text: FormatMovementMode(found) }] };
  }
);

server.tool(
  "get_axis_conversion",
  "Blender Z-up vs Babylon Y-up — when manifest physics data is converted vs when node/@exposed values stay Blender-local. Call before lookAt, camera-child HUD arrows, @exposed vector3 offsets, or when rotations look wrong / mesh points sideways. Topics: overview, authoring, export-formula, manifest-vs-local, look-at, exposed-vector3, pitfalls.",
  {
    topic: z
      .enum([
        "overview",
        "authoring",
        "export-formula",
        "manifest-vs-local",
        "look-at",
        "exposed-vector3",
        "pitfalls",
      ])
      .optional()
      .describe(
        'Section to return. Omit for decision tree + topic list. Use "look-at" for Space.WORLD + local +Y rule; "manifest-vs-local" for @exposed vector3 vs collider data.'
      ),
  },
  async ({ topic }) => ({
    content: [{ type: "text", text: FormatAxisConversion(topic) }],
  })
);

// --- BJS Docs ---------------------------------------------------------------

server.tool(
  "search_bjs_docs",
  "Search the official Babylon.js documentation at https://doc.babylonjs.com/ for pages matching a query. Returns matching page paths ranked by relevance with fetch commands.",
  {
    query: z.string().describe('Search term, e.g. "physics havok", "PBR material", "arc rotate camera"'),
    maxResults: z.number().optional().describe("Max results to return (default 10)"),
  },
  async ({ query, maxResults }) => ({
    content: [{ type: "text", text: await SearchBjsDocs(query, maxResults ?? 10) }],
  })
);

server.tool(
  "fetch_bjs_doc",
  "Fetch a page from the official Babylon.js documentation and return it as readable markdown. Use a path from search_bjs_docs results.",
  {
    path: z.string().describe('Doc page path, e.g. "/features/featuresDeepDive/physics/havokPlugin"'),
  },
  async ({ path }) => ({
    content: [{ type: "text", text: await FetchBjsDoc(path) }],
  })
);

// --- Start -----------------------------------------------------------------

async function Main(): Promise<void>
{
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

Main().catch((error) =>
{
  console.error("bjs-mcp failed:", error);
  process.exit(1);
});
