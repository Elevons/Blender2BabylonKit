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

const LIFECYCLE_HOOKS = ["OnStart", "OnUpdate", "OnDestroy", "OnMessage"] as const;

const LOWERCASE_HOOK_PATTERN = /\b(onStart|onUpdate|onDestroy|onMessage)\s*\(/g;
const WRONG_EXPOSED_PATTERN = /@Exposed\b/g;
const WRONG_INPUT_MAP_PATTERN = /@InputMap\b/g;
const EXPORT_DEFAULT_CLASS = /export\s+default\s+class\s+([A-Za-z_]\w*)/;

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
      message: "Lifecycle hooks must be PascalCase: OnStart, OnUpdate, OnDestroy, OnMessage.",
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

  return {
    valid: issues.filter((issue) => issue.severity === "error").length === 0,
    issues,
  };
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

export function FormatValidationResult(result: ValidationResult): string
{
  if (result.issues.length === 0)
  {
    return "Valid — no issues found.";
  }

  const lines = result.issues.map(
    (issue) => `[${issue.severity.toUpperCase()}] ${issue.code}: ${issue.message}`
  );

  return `${result.valid ? "Warnings only" : "Invalid"}:\n${lines.join("\n")}`;
}
