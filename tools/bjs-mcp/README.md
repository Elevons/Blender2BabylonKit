# bjs-mcp — MCP server for Babylon Level Kit behavior authoring

An [MCP](https://modelcontextprotocol.io/) server that helps local models write
behavior scripts with less cognitive load: planning, recipes, templates,
validation, scene grounding, and reference examples — backed by
`docs/LLM_KERNEL.md`, `docs/LLM_SCRIPTING_CONTEXT.md`, and `docs/STYLE_GUIDE.md`.

## Setup

```bash
cd tools/bjs-mcp
npm install
npm run build
```

From the repo root (after adding the workspace):

```bash
npm install
npm run mcp:build
```

## Cursor configuration

Add to `~/.cursor/mcp.json` (or project MCP settings):

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

Replace paths with your checkout location.

## Resources

| URI | Content |
|-----|---------|
| `bjs://docs/kernel` | `docs/LLM_KERNEL.md` — **start here** (~80 lines) |
| `bjs://docs/scripting-context` | `docs/LLM_SCRIPTING_CONTEXT.md` — full contract |
| `bjs://docs/style-guide` | `docs/STYLE_GUIDE.md` |
| `bjs://behaviors/{Name}` | `apps/playground/src/behaviors/{Name}.ts` |

## Tools

| Tool | Purpose |
|------|---------|
| `get_kernel` | Minimal authoring kernel — call first |
| `plan_behavior` | Intent → recipes, sections, fragments, steps |
| `get_style_guide` | Full style guide or a section |
| `get_scripting_context` | Full contract or a section (exposed, input, physics, cameras, **scene-look**, …) |
| `list_recipes` | All behavior patterns |
| `suggest_recipe` | Match intent → recipe |
| `get_recipe_template` | Full valid skeleton for a recipe + class name |
| `get_exposed_field_snippet` | Blender-safe `@exposed` one-liner |
| `list_input_actions` | Maps and actions from playground |
| `list_scene_entities` | Entity names/components/light types + enabled atmosphere / post-processing from a level manifest |
| `get_behavior` | Full source of an example behavior by stem |
| `find_similar_behavior` | Search example behaviors by keyword |
| `validate_behavior` | Check draft against parse/style/physics rules |
| `get_fragment` | Paste-in code blocks (hinge motor, Path3D, …) |

## Workflow for small models

1. `get_kernel` — invariant contracts (or rely on `.cursor/rules/behavior-authoring.mdc`)
2. `plan_behavior(intent, className)` — structured plan
3. `get_recipe_template` — valid skeleton from the plan's primary recipe
4. `list_input_actions` / `list_scene_entities` — real names from the project
5. `find_similar_behavior` / `get_behavior` — copy proven patterns for novel logic
6. `get_scripting_context(section=…)` — pull only needed API sections
7. `get_fragment` / `get_exposed_field_snippet` — paste-in blocks
8. `validate_behavior` — fix errors; **revalidate until valid**

## Recipes

### Core

- `minimal-behavior` — empty shell
- `look-at-target` — face another entity
- `constant-rotate` — spin on axis
- `waypoint-path` — interpolate through vector3 points
- `patrol-oscillate` — sine ease between two positions
- `input-poll-move` — WASD / stick via Input Actions
- `on-message-handler` — triggers / SendMessage
- `animation-cycle` — clip cycling
- `kinematic-body-move` — physics-safe motion template
- `trigger-logger` — overlap logging

### Advanced (multi-domain)

- `constraint-hinge-motor` — drive Blender HINGE constraints (see `CarController.ts`)
- `path-follow-advanced` — Path3D + throttle + tangent facing (see `TrainBehavior.ts`)
- `camera-follow` — orbiting `UniversalCamera` (see `TrainCamera.ts`)
- `geospatial-camera-flyto` — fly the authored `GeospatialCamera` to a point (Blender Camera component **Geospatial**)
- `message-state-handler` — OnMessage-driven state machine

## Fragments

`ease-smoothstep`, `move-by-input-vector2`, `subscribe-jump-performed`,
`make-body-kinematic`, `animated-body-sync`, `enable-trigger-logging`,
`cleanup-keyboard-observer`, `play-animation`, `send-message`,
`resolve-hinge-constraint`, `set-hinge-motor-velocity`, `path3d-from-entities`,
`orbit-camera-around-target`, `geospatial-camera-flyto-point`,
`geospatial-camera-flyto-properties`

## Validation

`validate_behavior` checks:

- Export default, class/filename match, `@exposed` / `@inputMap` casing
- PascalCase lifecycle hooks, single-line `@exposed` defaults
- Entity field hints, empty entity lists
- Physics anti-pattern: `node.position` in `OnUpdate` without `ANIMATED`
- Unknown `FindAction("…")` names vs playground input catalog
- Raw key codes when Input Actions are available
- Scene atmosphere / post-processing / MSDF text APIs in behaviors (`Atmosphere`, `VolumetricLightScatteringPostProcess`, `TextRenderer`, etc.) — author in Blender
- Allman brace style, observer cleanup in `OnDestroy`
