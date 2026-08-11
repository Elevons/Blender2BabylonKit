import { ListInputActions } from "./io.js";

export interface ValidationIssue
{
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult
{
  valid: boolean;
  issues: ValidationIssue[];
}

const LIFECYCLE_HOOKS = ["OnStart", "OnPostReady", "OnUpdate", "OnDestroy", "OnMessage"] as const;

const LOWERCASE_HOOK_PATTERN = /\b(onStart|onUpdate|onDestroy|onMessage)\s*\(/g;
const WRONG_EXPOSED_PATTERN = /@Exposed\b/g;
const WRONG_INPUT_MAP_PATTERN = /@InputMap\b/g;
const EXPORT_DEFAULT_CLASS = /export\s+default\s+class\s+([A-Za-z_]\w*)/;
const FIND_ACTION_PATTERN = /FindAction\s*\(\s*["']([^"']+)["']\s*\)/g;
const NODE_POSITION_WRITE_PATTERN =
  /this\.node\.position\s*=|this\.node\.position\.addInPlace|this\.node\.position\.addInPlaceFromFloats/;
const K_AND_R_BRACE_PATTERN = /\b(if|for|while)\s*\([^)]*\)\s*\{/g;
const RAW_KEY_PATTERN =
  /\b(KeyW|KeyA|KeyS|KeyD|KeyQ|KeyE|KeyboardEventTypes|onKeyDown|onKeyUp|window\.addEventListener)\b/;
const SCENE_POST_PROCESS_PATTERN =
  /\b(DefaultRenderingPipeline|SSAO2RenderingPipeline|ApplyPostProcessing|ApplyAtmosphere|@babylonjs\/addons\/atmosphere|TextRenderer|FontAsset|@babylonjs\/addons\/msdfText)\b/;

/**
 * Validate a behavior draft against Blender-parse rules and project conventions.
 * Mirrors checks from blender_addon/core/script_parse.py where practical.
 */
export function ValidateBehavior(source: string, filename?: string): ValidationResult
{
  const issues: ValidationIssue[] = [];

  if (!source.includes('from "@bjs/engine"'))
  {
    issues.push({
      code: "missing-engine-import",
      message: 'Import from "@bjs/engine" (Behavior, exposed, etc.).',
      severity: "error",
    });
  }

  if (!source.includes("export default class"))
  {
    issues.push({
      code: "missing-export-default",
      message: "Behavior must use `export default class ClassName extends Behavior`.",
      severity: "error",
    });
  }

  const classMatch = source.match(EXPORT_DEFAULT_CLASS);
  if (classMatch !== null && filename !== undefined)
  {
    const expectedStem = filename.replace(/\.tsx?$/i, "");
    if (classMatch[1] !== expectedStem)
    {
      issues.push({
        code: "class-filename-mismatch",
        message: `Class name "${classMatch[1]}" must match filename stem "${expectedStem}".`,
        severity: "error",
      });
    }
  }

  for (const hook of LIFECYCLE_HOOKS)
  {
    if (!source.includes(`${hook}(`))
    {
      continue;
    }

    const wrongPattern = new RegExp(`\\b${hook.charAt(0).toLowerCase()}${hook.slice(1)}\\s*\\(`, "g");
    if (wrongPattern.test(source))
    {
      issues.push({
        code: "lowercase-lifecycle",
        message: `Lifecycle hooks must be PascalCase (${hook}, not ${hook.charAt(0).toLowerCase()}${hook.slice(1)}).`,
        severity: "error",
      });
    }
  }

  if (LOWERCASE_HOOK_PATTERN.test(source))
  {
    issues.push({
      code: "lowercase-lifecycle",
      message: "Lifecycle hooks must be PascalCase: OnStart, OnPostReady, OnUpdate, OnDestroy, OnMessage.",
      severity: "error",
    });
  }

  if (WRONG_EXPOSED_PATTERN.test(source))
  {
    issues.push({
      code: "wrong-exposed-decorator",
      message: "Decorator must be lowercase @exposed (Blender parses the literal token).",
      severity: "error",
    });
  }

  if (WRONG_INPUT_MAP_PATTERN.test(source))
  {
    issues.push({
      code: "wrong-inputmap-decorator",
      message: 'Decorator must be lowercase @inputMap("MapName").',
      severity: "error",
    });
  }

  CheckExposedDefaults(source, issues);
  CheckEntityFields(source, issues);
  CheckEntityLists(source, issues);
  CheckVoidReturnTypes(source, issues);
  CheckPhysicsAntiPattern(source, issues);
  CheckInputActionNames(source, issues);
  CheckRawInput(source, issues);
  CheckBraceStyle(source, issues);
  CheckKeyboardObserverCleanup(source, issues);
  CheckScenePostProcessInBehavior(source, issues);
  CheckPageReloadForRestart(source, issues);
  CheckTargetTransformLoop(source, issues);
  CheckManualPrefabClone(source, issues);
  CheckEnumerableBjsEntityAssign(source, issues);

  return {
    valid: issues.filter((issue) => issue.severity === "error").length === 0,
    issues,
  };
}

function ExtractMethodBody(source: string, methodName: string): string | undefined
{
  const signature = new RegExp(`\\b${methodName}\\s*\\([^)]*\\)\\s*(?::\\s*[A-Za-z<>\\[\\] |]+)?\\s*\\{`);
  const match = signature.exec(source);
  if (match === null)
  {
    return undefined;
  }

  let depth = 1;
  let index = match.index + match[0].length;

  while (index < source.length && depth > 0)
  {
    const char = source[index];
    if (char === "{")
    {
      depth++;
    }
    else if (char === "}")
    {
      depth--;
    }
    index++;
  }

  return source.slice(match.index + match[0].length, index - 1);
}

function CheckTargetTransformLoop(source: string, issues: ValidationIssue[]): void
{
  if (!source.includes("setTargetTransform"))
  {
    return;
  }

  const updateBody = ExtractMethodBody(source, "OnUpdate");
  const calledEveryFrame = updateBody !== undefined && updateBody.includes("setTargetTransform");

  if (!calledEveryFrame)
  {
    issues.push({
      code: "target-transform-once",
      message:
        "setTargetTransform sets a velocity to reach the target, so it must be called every frame from OnUpdate. Called once (from OnStart or a toggle/one-shot handler), a kinematic body keeps that velocity and drifts forever. For a one-shot move, set disablePreStep = false and write this.node.position instead.",
      severity: "warning",
    });
  }
}
function CheckExposedDefaults(source: string, issues: ValidationIssue[]): void
{
  const decoratorPattern = /@exposed\s*\([^)]*\)[^;{]*=\s*([^;\n]+)/g;
  let match: RegExpExecArray | null;

  while ((match = decoratorPattern.exec(source)) !== null)
  {
    const defaultLiteral = match[1].trim();

    if (defaultLiteral.includes("\n"))
    {
      issues.push({
        code: "multiline-exposed-default",
        message: `@exposed default must be a single-line literal; got: ${defaultLiteral.slice(0, 40)}…`,
        severity: "error",
      });
    }

    if (defaultLiteral.startsWith("new ") && !defaultLiteral.startsWith("new Color3"))
    {
      issues.push({
        code: "computed-exposed-default",
        message: `@exposed default should be a literal, not a constructor call: ${defaultLiteral}`,
        severity: "warning",
      });
    }
  }
}

function CheckEntityFields(source: string, issues: ValidationIssue[]): void
{
  const entityFieldWithoutHint = /@exposed\s*\(\s*\)\s*[\s\S]*?:\s*Entity/g;
  if (entityFieldWithoutHint.test(source))
  {
    issues.push({
      code: "entity-missing-type-hint",
      message: 'Entity reference fields need @exposed({ type: "entity" }).',
      severity: "error",
    });
  }

  const entityHintPattern = /@exposed\s*\(\s*\{[^}]*type\s*:\s*["']entity["'][^}]*\}\s*\)/g;
  const hasEntityHint = entityHintPattern.test(source);
  const hasEntityType = /:\s*Entity\s*\|\s*null/.test(source);

  if (hasEntityType && !hasEntityHint && source.includes("@exposed"))
  {
    issues.push({
      code: "entity-missing-type-hint",
      message: 'Fields typed Entity | null need @exposed({ type: "entity" }).',
      severity: "warning",
    });
  }
}

function CheckEntityLists(source: string, issues: ValidationIssue[]): void
{
  const entityListPattern =
    /@exposed\s*\(\s*\{[^}]*of\s*:\s*["']entity["'][^}]*\}\s*\)[\s\S]*?=\s*(\[[^\]]*\])/g;
  let match: RegExpExecArray | null;

  while ((match = entityListPattern.exec(source)) !== null)
  {
    const listLiteral = match[1].replace(/\s/g, "");
    if (listLiteral !== "[]")
    {
      issues.push({
        code: "entity-list-not-empty",
        message: "Entity lists must start empty ([]); objects are picked in Blender.",
        severity: "error",
      });
    }
  }
}

function CheckVoidReturnTypes(source: string, issues: ValidationIssue[]): void
{
  for (const hook of LIFECYCLE_HOOKS)
  {
    const hookPattern = new RegExp(`${hook}\\s*\\([^)]*\\)\\s*(?!:\\s*void)`, "g");
    if (hookPattern.test(source))
    {
      issues.push({
        code: "missing-void-return",
        message: `${hook}() should declare an explicit : void return type.`,
        severity: "warning",
      });
    }
  }
}

function CheckPhysicsAntiPattern(source: string, issues: ValidationIssue[]): void
{
  if (!source.includes("OnUpdate"))
  {
    return;
  }

  const writesNodePosition = NODE_POSITION_WRITE_PATTERN.test(source);
  const referencesBody = source.includes("entity.body") || source.includes("this.entity.body");
  const setsAnimated =
    source.includes("PhysicsMotionType.ANIMATED") || source.includes("setMotionType(PhysicsMotionType.ANIMATED)");

  if (writesNodePosition && referencesBody && !setsAnimated)
  {
    issues.push({
      code: "dynamic-body-position-fight",
      message:
        "OnUpdate writes this.node.position while a physics body exists — call setMotionType(PhysicsMotionType.ANIMATED) in OnStart first, or use velocity/impulse on DYNAMIC bodies.",
      severity: "warning",
    });
  }

  if (writesNodePosition && !referencesBody && source.includes("RIGIDBODY"))
  {
    issues.push({
      code: "possible-physics-fight",
      message:
        "OnUpdate writes this.node.position — if this entity has a Rigid Body, set PhysicsMotionType.ANIMATED in OnStart before driving the node.",
      severity: "warning",
    });
  }
}

function CheckInputActionNames(source: string, issues: ValidationIssue[]): void
{
  const catalog = ListInputActions();
  const knownActions = new Set<string>();

  for (const map of catalog.maps)
  {
    for (const action of map.actions)
    {
      knownActions.add(action.name);
    }
  }

  if (knownActions.size === 0)
  {
    return;
  }

  const usedActions = new Set<string>();
  let match: RegExpExecArray | null;
  const pattern = new RegExp(FIND_ACTION_PATTERN.source, FIND_ACTION_PATTERN.flags);

  while ((match = pattern.exec(source)) !== null)
  {
    usedActions.add(match[1]);
  }

  for (const actionName of usedActions)
  {
    if (!knownActions.has(actionName))
    {
      issues.push({
        code: "unknown-input-action",
        message: `FindAction("${actionName}") — not in scene input actions. Call list_input_actions for valid names.`,
        severity: "warning",
      });
    }
  }
}

function CheckRawInput(source: string, issues: ValidationIssue[]): void
{
  if (!RAW_KEY_PATTERN.test(source))
  {
    return;
  }

  const usesInputMap = source.includes("@inputMap") || source.includes("this.input") || source.includes("InputActionMap");

  issues.push({
    code: "raw-key-input",
    message: usesInputMap
      ? "Prefer Input Actions (FindAction) over raw key codes / window listeners when a map is available."
      : "Raw key codes or window listeners detected — prefer @inputMap + FindAction, or scene observables with OnDestroy cleanup.",
    severity: "warning",
  });
}

function CheckBraceStyle(source: string, issues: ValidationIssue[]): void
{
  if (K_AND_R_BRACE_PATTERN.test(source))
  {
    issues.push({
      code: "brace-style",
      message: "Use Allman braces — opening brace on its own line after if/for/while (see get_style_guide).",
      severity: "warning",
    });
  }
}

function CheckKeyboardObserverCleanup(source: string, issues: ValidationIssue[]): void
{
  const subscribesKeyboard =
    source.includes("onKeyboardObservable.add") || source.includes("onPointerObservable.add");

  if (subscribesKeyboard && !source.includes("OnDestroy"))
  {
    issues.push({
      code: "missing-observer-cleanup",
      message: "Scene observable subscription without OnDestroy — store the observer and remove it on dispose.",
      severity: "warning",
    });
  }
}

/**
 * Behaviors get a narrow LevelSession as this.session — a page reload throws
 * away the soft-restart path (LevelDirector) for a full browser refresh.
 */
function CheckPageReloadForRestart(source: string, issues: ValidationIssue[]): void
{
  if (!source.includes("location.reload"))
  {
    return;
  }

  issues.push({
    code: "page-reload-for-restart",
    message:
      'window.location.reload() in a behavior — use await this.session.Restart() (or this.session.Load(url)) instead. See get_scripting_context(section="level-session").',
    severity: "warning",
  });
}

function CheckScenePostProcessInBehavior(source: string, issues: ValidationIssue[]): void
{
  if (!SCENE_POST_PROCESS_PATTERN.test(source))
  {
    return;
  }

  issues.push({
    code: "scene-post-in-behavior",
    message:
      "Scene atmosphere, post-processing, and MSDF text (Atmosphere, VLS, Default Pipeline, SSAO, TextRenderer/FontAsset) are authored in Blender — not in behaviors. See get_scripting_context(section=\"scene-look\") or section=\"msdf-text\".",
    severity: "warning",
  });
}

/**
 * node.clone() alone skips physics, scripts, and GUID remapping. Prefer
 * this.spawner.Spawn for prefab instances — that is the legal spawn surface
 * (behaviors get narrow spawner + session surfaces, not a full Level handle).
 */
function CheckManualPrefabClone(source: string, issues: ValidationIssue[]): void
{
  const clonesNode =
    /\.clone\s*\(/.test(source) &&
    (source.includes("node.clone") ||
      source.includes(".node.clone") ||
      /prefab|template|instance|spawn/i.test(source));

  if (!clonesNode)
  {
    return;
  }

  // Legitimate uses of clone (Vector3/Quaternion/matrices) still match `.clone(` —
  // only warn when the source also looks like it is duplicating entities.
  const looksLikeEntityDuplication =
    /attachments|bjsEntity|RegisterAttachment|CopyAttachment|CloneEntity/i.test(source) ||
    /prefab|template/i.test(source);

  if (!looksLikeEntityDuplication)
  {
    return;
  }

  if (source.includes("this.spawner.Spawn") || source.includes("spawner.Spawn"))
  {
    return;
  }

  issues.push({
    code: "manual-prefab-clone",
    message:
      "Cloning nodes (and copying attachments) does not rebuild physics, scripts, or remapped GUID refs. Use await this.spawner.Spawn(template, { position }) instead.",
    severity: "warning",
  });
}

/**
 * Enumerable `metadata.bjsEntity = entity` (or object-literal spreads) recreate
 * Entity↔node cycles that crash the Babylon Inspector Properties pane.
 */
function CheckEnumerableBjsEntityAssign(source: string, issues: ValidationIssue[]): void
{
  if (source.includes("AssignNodeEntity") || source.includes("AssignSceneLevel"))
  {
    return;
  }

  const assignsEnumerable =
    /metadata\.bjsEntity\s*=/.test(source) ||
    /\.metadata\s*=\s*\{[\s\S]{0,200}?bjsEntity\s*:/.test(source);

  if (!assignsEnumerable)
  {
    return;
  }

  issues.push({
    code: "enumerable-bjs-entity-metadata",
    message:
      'Do not write enumerable metadata.bjsEntity (Inspector "too much recursion"). Use AssignNodeEntity(node, entity) / EntityFromNode(node) from @bjs/engine.',
    severity: "warning",
  });
}

const FIX_HINTS: Record<string, string> = {
  "missing-engine-import": 'Add: import { Behavior, … } from "@bjs/engine";',
  "missing-export-default": "Add: export default class YourName extends Behavior { }",
  "class-filename-mismatch": "Rename class or file so stems match (Patrol.ts → class Patrol).",
  "lowercase-lifecycle": "Rename to PascalCase: OnStart, OnPostReady, OnUpdate, OnDestroy, OnMessage.",
  "wrong-exposed-decorator": "Use lowercase @exposed (not @Exposed).",
  "wrong-inputmap-decorator": "Use lowercase @inputMap (not @InputMap).",
  "target-transform-once":
    "Call setTargetTransform every frame, or use node.position with ANIMATED + disablePreStep.",
  "multiline-exposed-default": "Use single-line literal defaults only for @exposed.",
  "computed-exposed-default": "Replace computed default with a literal (= 5, = true, = null, …).",
  "entity-missing-type-hint": 'Add type: "entity" to @exposed for Entity | null fields.',
  "entity-list-not-empty": "Entity lists must start as [] — authors fill in Blender.",
  "missing-void-return": "Add explicit : void return type on lifecycle methods.",
  "dynamic-body-position-fight":
    "Call get_physics_movement — use velocity on DYNAMIC or ANIMATED + disablePreStep.",
  "possible-physics-fight": "Call get_physics_movement before writing node.position in OnUpdate.",
  "unknown-input-action": "Call list_input_actions; use exact names or PlayerActions constants.",
  "raw-key-input": "Use @inputMap + FindAction, or scene observable + OnDestroy cleanup.",
  "brace-style": "Call get_style_guide — Allman braces (opening brace on its own line).",
  "missing-observer-cleanup": "Store observer in OnStart; remove in OnDestroy.",
  "scene-post-in-behavior":
    'Author in Blender Scene panels — get_scripting_context(section="scene-look").',
  "manual-prefab-clone":
    'Use await this.spawner.Spawn(template, { position }) — get_fragment(name="spawn-prefab-instance").',
  "enumerable-bjs-entity-metadata":
    "Use AssignNodeEntity(node, entity) / EntityFromNode(node) from @bjs/engine (non-enumerable metadata).",
  "paint-color-kind":
    'Leave color kind blank or use COLOR_1; luminance ~0.5 — get_fragment(name="paint-scatter-vertex-colors").',
};

export function FormatValidationResult(result: ValidationResult): string
{
  if (result.issues.length === 0)
  {
    return "Valid — no issues found.\n\nNext: save to src/behaviors/ and attach SCRIPT in Blender if not already.";
  }

  const lines = result.issues.map((issue) =>
  {
    const hint = FIX_HINTS[issue.code];
    const hintLine = hint !== undefined ? `\n    → Fix: ${hint}` : "";
    return `[${issue.severity.toUpperCase()}] ${issue.code}: ${issue.message}${hintLine}`;
  });

  const footer = result.valid
    ? "\n\nWarnings only — address before shipping."
    : "\n\nInvalid — fix ALL errors, then call validate_behavior again.";

  return `${result.valid ? "Warnings only" : "Invalid"}:\n${lines.join("\n")}${footer}`;
}
