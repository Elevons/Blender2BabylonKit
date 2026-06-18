# bjs-mcp — MCP server for Babylon Level Kit behavior authoring

An [MCP](https://modelcontextprotocol.io/) server that helps local models write
behavior scripts with less cognitive load: recipes, templates, validation, and
reference examples — backed by `docs/LLM_SCRIPTING_CONTEXT.md` and
`docs/STYLE_GUIDE.md`.

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
| `bjs://docs/scripting-context` | `docs/LLM_SCRIPTING_CONTEXT.md` |
| `bjs://docs/style-guide` | `docs/STYLE_GUIDE.md` |
| `bjs://behaviors/{Name}` | `apps/playground/src/behaviors/{Name}.ts` |

## Tools

| Tool | Purpose |
|------|---------|
| `get_style_guide` | Full style guide or a section (naming, braces, null checks, …) |
| `get_scripting_context` | Full behavior contract or a section (exposed, input, physics, …) |
| `list_recipes` | All behavior patterns |
| `suggest_recipe` | Match intent → recipe |
| `get_recipe_template` | Full valid skeleton for a recipe + class name |
| `get_exposed_field_snippet` | Blender-safe `@exposed` one-liner |
| `list_input_actions` | Maps and actions from playground |
| `find_similar_behavior` | Search example behaviors by keyword |
| `validate_behavior` | Check draft against parse/style rules |
| `get_fragment` | Paste-in code blocks (easing, input move, etc.) |

## Suggested workflow for small models

1. `suggest_recipe` — pick a pattern
2. `get_recipe_template` — get the skeleton
3. `list_input_actions` / `find_similar_behavior` — ground in real names
4. Customize logic (or `get_fragment` for common blocks)
5. `validate_behavior` — catch silent failures before saving

## Recipes

- `minimal-behavior` — empty shell
- `look-at-target` — face another entity
- `constant-rotate` — spin on axis
- `waypoint-path` — interpolate through points
- `patrol-oscillate` — sine ease between two positions
- `input-poll-move` — WASD / stick via Input Actions
- `on-message-handler` — triggers / SendMessage
- `animation-cycle` — clip cycling
- `kinematic-body-move` — physics-safe motion template
- `trigger-logger` — overlap logging
