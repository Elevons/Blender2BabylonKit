import { MatchPlaybook } from "./playbooks.js";
import { PlanBehavior, FormatBehaviorPlan } from "./plan.js";

/** Pre-flight checklist before writing any behavior source. */
export function FormatPreflight(intent: string, className: string): string
{
  const route = MatchPlaybook(intent);
  const plan = PlanBehavior(intent, className);

  const lines = [
    `# Pre-flight: ${className}.ts`,
    ``,
    `Complete every checkbox **using MCP tools** before typing behavior logic.`,
    ``,
    `## Identity`,
    `- [ ] Filename will be \`src/behaviors/${className}.ts\``,
    `- [ ] \`export default class ${className} extends Behavior\` — exact name match`,
    `- [ ] Import from \`@bjs/engine\` (and Babylon only when needed)`,
    ``,
    `## Route`,
    `- [ ] Called \`route_task(intent, className)\` OR read playbook \`${route.id}\``,
    `- [ ] Primary recipe: \`${route.recipe}\``,
    ``,
    `## Grounding (do not guess strings)`,
  ];

  if (route.needsInput)
  {
    lines.push(`- [ ] \`list_input_actions()\` — use returned names in FindAction`);
  }
  else
  {
    lines.push(`- [ ] Input not required for this playbook`);
  }

  if (route.needsSceneEntities)
  {
    lines.push(`- [ ] \`list_scene_entities(level=…)\` — @exposed entity picks use real names`);
  }

  if (route.needsPhysics)
  {
    lines.push(`- [ ] \`get_physics_movement()\` — read before any movement code`);
  }

  lines.push(
    `- [ ] \`get_do_not_list()\` — skim once per session`,
    ``,
    `## Scaffold`,
    `- [ ] \`get_recipe_template(recipe="${route.recipe}", className="${className}")\``,
    `- [ ] Edit template in place — do not delete the class shell`,
    ``
  );

  if (route.referenceBehavior.length > 0)
  {
    lines.push(
      `## Reference`,
      `- [ ] \`get_behavior("${route.referenceBehavior}")\` or find_similar_behavior`,
      ``
    );
  }

  lines.push(
    `## Blender (human / already exported)`,
    `- [ ] SCRIPT component on the correct object (armature for skinned characters)`,
    `- [ ] Press **Sync** on Script component if @exposed fields changed in code`,
    `- [ ] Level exported — entities exist in scene.json`,
    ``,
    `## Finish`,
    `- [ ] \`validate_behavior(source, "${className}.ts")\` — zero errors`,
    `- [ ] Revalidate after every fix until clean`,
    ``,
    `---`,
    ``,
    `## plan_behavior preview`,
    ``,
    FormatBehaviorPlan(plan)
  );

  return lines.join("\n");
}
