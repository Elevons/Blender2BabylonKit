/** Recommended MCP tool order for behavior authoring — returned by get_authoring_workflow. */
export function FormatAuthoringWorkflow(): string
{
  return `# Behavior authoring workflow (bjs-mcp)

**Weak model?** Call \`route_task(intent, className)\` first — it picks a playbook and lists exact steps.
Then \`preflight_behavior\` for the checklist. Skim \`get_do_not_list\` once per session.

## 0. Route (do this first)

| Tool | When |
|------|------|
| \`route_task(intent, className)\` | **Any new behavior** — matched playbook + ordered MCP steps |
| \`preflight_behavior(intent, className)\` | Checklist before typing code |
| \`get_do_not_list\` | Silent failures (onStart, DYNAMIC+position, …) |

## 1. Orient

| Tool | When |
|------|------|
| \`get_kernel\` | Invariant rules only (~90 lines) |
| \`get_engine_basics(topic?)\` | How the engine works (architecture, frame loop, …) |
| \`search_docs(query)\` | Semantic search across all human docs (local embeddings) |
| \`list_doc_chapters\` / \`get_doc_chapter(chapter, section?)\` | Full engine/Blender prose chapters as markdown |
| \`get_authoring_workflow\` | This page |
| \`plan_behavior(intent, className)\` | Recipes, sections, fragments, pitfalls |

## 2. Scaffold

| Tool | When |
|------|------|
| \`get_playbook(name)\` / \`list_playbooks\` | Full Blender + MCP steps for one task |
| \`suggest_recipe\` / \`list_recipes\` | Pick a code pattern |
| \`get_recipe_template(recipe, className)\` | Valid TypeScript skeleton |
| \`get_behavior(name)\` / \`find_similar_behavior(…, includeSource=true)\` | Copy playground examples |

## 3. Ground in the project

| Tool | When |
|------|------|
| \`list_levels\` | Exported level folder names |
| \`list_scene_entities(level, filter?)\` | Real entity names, scripts, constraints |
| \`list_input_actions\` | Real action names — **never invent** |
| \`list_behaviors\` | All playground example behaviors |

## 4. API detail (on demand)

| Tool | When |
|------|------|
| \`get_scripting_context(section?)\` | Full contract or one section — \`section="list"\` |
| \`get_physics_movement(mode?)\` | **Before any body motion** |
| \`get_fragment(name)\` / \`list_fragments\` | Paste-in code blocks |
| \`get_exposed_field_snippet(…)\` | Blender-safe @exposed line |
| \`get_style_guide(section?)\` | Allman braces, naming |

## 5. Finish

| Tool | When |
|------|------|
| \`validate_behavior(source, filename?)\` | **Required** — fix every error; revalidate until valid |

## Documentation map

| Layer | File / tool |
|-------|-------------|
| Task recipes | \`docs/LLM_PLAYBOOK.md\` · \`route_task\` · \`get_playbook\` |
| API contract | \`docs/LLM_SCRIPTING_CONTEXT.md\` · \`get_scripting_context\` |
| Minimal rules | \`docs/LLM_KERNEL.md\` · \`get_kernel\` |
| Engine concepts | \`get_engine_basics\` → \`docs/engine/*.html\` |
| Full prose chapters | \`list_doc_chapters\` · \`get_doc_chapter\` (engine + blender + launcher as markdown) |
| Anything else | \`search_docs(query)\` — semantic search across every doc |
| API tables | \`get_doc_chapter(chapter="engine/14-api-guide")\` or \`docs/engine/14-API-GUIDE.html\` |
| Feature inventory | \`get_doc_chapter(chapter="engine/13-feature-list")\` or \`docs/engine/13-FEATURE-LIST.html\` |
| Frame loop | \`get_doc_chapter(chapter="engine/02-runtime-basics")\` or \`docs/engine/02-RUNTIME-BASICS.html\` |
| Doc index | \`docs/engine/00-INDEX.html\` |

## Resources (attach in Cursor)

| URI | Content |
|-----|---------|
| \`bjs://docs/playbook\` | \`docs/LLM_PLAYBOOK.md\` |
| \`bjs://docs/kernel\` | \`docs/LLM_KERNEL.md\` |
| \`bjs://docs/scripting-context\` | \`docs/LLM_SCRIPTING_CONTEXT.md\` |
| \`bjs://docs/style-guide\` | \`docs/STYLE_GUIDE.md\` |
| \`bjs://behaviors/{Name}\` | Playground example behaviors |
`;
}
