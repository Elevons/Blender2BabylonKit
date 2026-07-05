# bjs-mcp — MCP server for Babylon Level Kit behavior authoring

An [MCP](https://modelcontextprotocol.io/) server that guides LLMs through behavior
scripting with **task routing**, playbooks tied to human docs, validation with fix
hints, and zero-guess grounding (scene entities, input actions, physics movement).

**Start here for any behavior:** `route_task(intent, className)`

Backed by:
- `docs/LLM_PLAYBOOK.md` — task recipes (Blender + MCP steps)
- `docs/LLM_SCRIPTING_CONTEXT.md` — full API contract
- `docs/LLM_KERNEL.md` — minimal invariant rules
- `docs/engine/*.html` — engine prose (via `get_engine_basics`)

## Setup

```bash
npm run mcp:build   # from repo root
```

## Cursor configuration

```json
{
  "mcpServers": {
    "bjs-level-kit": {
      "command": "node",
      "args": ["/absolute/path/to/Blender2BabylonKit/tools/bjs-mcp/dist/index.js"],
      "cwd": "/absolute/path/to/Blender2BabylonKit"
    }
  }
}
```

Or use **Babylon Launcher** → Services → Copy Cursor Config.

## Resources

| URI | Content |
|-----|---------|
| `bjs://docs/playbook` | `docs/LLM_PLAYBOOK.md` |
| `bjs://docs/kernel` | `docs/LLM_KERNEL.md` |
| `bjs://docs/scripting-context` | `docs/LLM_SCRIPTING_CONTEXT.md` |
| `bjs://docs/style-guide` | `docs/STYLE_GUIDE.md` |
| `bjs://behaviors/{Name}` | Playground example `.ts` |

## Tools (v1.5)

### Route first (weak models)

| Tool | Purpose |
|------|---------|
| **`route_task`** | **START HERE** — intent → playbook + numbered MCP steps |
| `preflight_behavior` | Checklist before writing code |
| `get_do_not_list` | Silent failures + which tool fixes each |
| `get_playbook` / `list_playbooks` | One task recipe from LLM_PLAYBOOK.md |
| `get_engine_basics` | Architecture, frame loop, Blender vs behavior |

### Human docs (full prose, as markdown)

| Tool | Purpose |
|------|---------|
| `search_docs` | Full-text search across every doc (engine, Blender, launcher, contracts) |
| `list_doc_chapters` | Slugs for every chapter |
| `get_doc_chapter` | One chapter (or one section) converted to markdown |

### Scaffold & ground

| Tool | Purpose |
|------|---------|
| `plan_behavior` | Recipes, sections, fragments, steps |
| `get_recipe_template` | Valid TypeScript skeleton |
| `list_levels` / `list_scene_entities` | Real entity names from scene.json |
| `list_input_actions` | Real action names |
| `list_behaviors` / `get_behavior` / `find_similar_behavior` | Examples |

### API & physics

| Tool | Purpose |
|------|---------|
| `get_scripting_context` | Full contract or one section |
| `get_physics_movement` | Decision tree for moving bodies |
| `get_fragment` / `list_fragments` | Paste-in code |
| `get_exposed_field_snippet` | Blender-safe @exposed |
| `get_style_guide` | Allman braces, naming |

### Finish

| Tool | Purpose |
|------|---------|
| `validate_behavior` | Required before save — includes fix hints |

Also: `get_authoring_workflow`, `get_kernel`, `list_recipes`, `suggest_recipe`.

## Workflow (dumb-model safe)

```
route_task("rover drives with wasd", "RoverDrive")
  → preflight_behavior(same)
  → get_do_not_list()
  → get_recipe_template("rover-wheel-drive", "RoverDrive")
  → list_input_actions()
  → list_scene_entities(level="…", filter="wheel")
  → get_physics_movement()
  → edit template (do NOT blank-page)
  → validate_behavior(source, "RoverDrive.ts")  # repeat until valid
```

## Playbooks (16 tasks)

`first-behavior`, `player-mover`, `trigger-reaction`, `moving-platform`,
`waypoint-patrol`, `train-on-path`, `rover-drive`, `spin-object`,
`look-at-target`, `animation-cycle`, `reveal-on-trigger`, `sound-on-trigger`,
`update-msdf-label`, `orbit-camera`, `geospatial-flyto`, `debug-triggers`

Full text: `docs/LLM_PLAYBOOK.md` or `get_playbook(name="…")`.

## Human documentation map

| Question | Doc | MCP tool |
|----------|-----|----------|
| What task am I doing? | `docs/LLM_PLAYBOOK.md` | `route_task` / `get_playbook` |
| What API exists? | `docs/LLM_SCRIPTING_CONTEXT.md` | `get_scripting_context` |
| How does the engine work? | `docs/engine/00-INDEX.html` | `get_engine_basics` / `get_doc_chapter` |
| API tables | `docs/engine/14-API-GUIDE.html` | `get_doc_chapter(chapter="engine/14-api-guide")` |
| Does the kit support X? | `docs/engine/13-FEATURE-LIST.html` | `get_doc_chapter(chapter="engine/13-feature-list")` |
| Frame loop | `docs/engine/02-RUNTIME-BASICS.html` | `get_doc_chapter(chapter="engine/02-runtime-basics")` |
| Anything else | — | `search_docs(query)` |

Cursor rule: `.cursor/rules/behavior-authoring.mdc`
