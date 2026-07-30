#!/usr/bin/env node
/**
 * Cross-language component registry sync check.
 *
 * Component types are declared in four places that must agree:
 *   1. blender_addon/components/constants.py   COMPONENT_TYPES (authoring enum)
 *   2. blender_addon/export/component_serializers.py  SERIALIZERS (export)
 *   3. blender_addon/ui/component_bodies.py    BODY_DRAWERS (inspector UI)
 *   4. packages/engine/src/core/loader/componentRegistry.ts  COMPONENT_HANDLERS
 *      (runtime), whose discriminants come from the Component union in types/components.ts
 *
 * Also verifies the manifest schema version: SCHEMA_VERSION in
 * blender_addon/export/level.py must equal SUPPORTED_SCHEMA_VERSION in
 * packages/engine/src/core/loader/manifest.ts.
 *
 * Run: node scripts/check-component-types.mjs   (wired into `npm run typecheck`)
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function Read(relativePath)
{
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

/** Parse a Python set/list literal of quoted identifiers: {'A', 'B'} -> Set. */
function ParsePythonNameSet(source, variableName)
{
  const match = source.match(new RegExp(`${variableName}\\s*=\\s*[{\\[]([^}\\]]*)[}\\]]`, "s"));
  if (match === null)
  {
    throw new Error(`could not find ${variableName}`);
  }
  return new Set([...match[1].matchAll(/'([A-Z0-9_]+)'/g)].map((entry) => entry[1]));
}

/** COMPONENT_TYPES enum identifiers (skipping ("", "Section", "") separators). */
function ParseComponentTypesEnum(constantsSource)
{
  const match = constantsSource.match(/COMPONENT_TYPES\s*=\s*\[(.*?)\n\]/s);
  if (match === null)
  {
    throw new Error("could not find COMPONENT_TYPES in constants.py");
  }
  return new Set([...match[1].matchAll(/^\s*\(\s*'([A-Z0-9_]+)'/gm)].map((entry) => entry[1]));
}

/**
 * Keys of a Python registry dict, expanding the GUI3D family spreads
 * (`**{t: fn for t in GUI3D_CONTROLS}`) using sets parsed from constants.py.
 */
function ParsePythonRegistryKeys(source, dictName, familySets)
{
  const match = source.match(new RegExp(`${dictName}\\s*=\\s*\\{(.*)\\n\\}`, "s"));
  if (match === null)
  {
    throw new Error(`could not find ${dictName}`);
  }
  const body = match[1];

  const keys = new Set([...body.matchAll(/^\s*'([A-Z0-9_]+)'\s*:/gm)].map((entry) => entry[1]));

  for (const [familyName, members] of Object.entries(familySets))
  {
    if (body.includes(`for comp_type in ${familyName}`))
    {
      for (const member of members)
      {
        keys.add(member);
      }
    }
  }

  return keys;
}

/**
 * Discriminants of the TS Component union: resolve each member of
 * `export type Component = ...` to its interface's `type: "..."` literal,
 * following one level of type-alias unions (Gui3DComponent).
 */
function ParseTsComponentUnion(typesSource)
{
  const unionMatch = typesSource.match(/export type Component =([^;]*);/s);
  if (unionMatch === null)
  {
    throw new Error("could not find `export type Component =` in types/components.ts");
  }

  const discriminants = new Set();
  const pending = [...unionMatch[1].matchAll(/([A-Za-z0-9_]+)/g)].map((entry) => entry[1]);

  while (pending.length > 0)
  {
    const memberName = pending.pop();

    // `[^{]*` skips an optional `extends Base` clause before the body.
    const interfaceMatch = typesSource.match(
      new RegExp(`export interface ${memberName}\\b[^{]*\\{[^}]*?type:\\s*"([A-Z0-9_]+)"`, "s")
    );
    if (interfaceMatch !== null)
    {
      discriminants.add(interfaceMatch[1]);
      continue;
    }

    const aliasMatch = typesSource.match(
      new RegExp(`export type ${memberName} =([^;]*);`, "s")
    );
    if (aliasMatch !== null)
    {
      pending.push(...[...aliasMatch[1].matchAll(/([A-Za-z0-9_]+)/g)].map((entry) => entry[1]));
      continue;
    }

    throw new Error(`could not resolve Component union member "${memberName}"`);
  }

  return discriminants;
}

/** Every discriminant claimed by a handler's `types: [...]` array in the runtime registry. */
function ParseTsHandlerTypes(registrySource)
{
  const claimed = new Set();
  for (const arrayMatch of registrySource.matchAll(/types:\s*\[([^\]]*)\]/gs))
  {
    for (const literal of arrayMatch[1].matchAll(/"([A-Z0-9_]+)"/g))
    {
      claimed.add(literal[1]);
    }
  }
  return claimed;
}

/** Single integer constant, e.g. SCHEMA_VERSION = 4 or SUPPORTED_SCHEMA_VERSION = 4. */
function ParseIntConstant(source, constantName)
{
  const match = source.match(new RegExp(`${constantName}\\s*=\\s*(\\d+)`));
  if (match === null)
  {
    throw new Error(`could not find ${constantName}`);
  }
  return Number(match[1]);
}

function FormatSetDifference(label, missing)
{
  return `  ${label}: ${[...missing].sort().join(", ")}`;
}

function CompareSets(referenceName, reference, otherName, other, problems)
{
  const missingFromOther = [...reference].filter((entry) => !other.has(entry));
  const extraInOther = [...other].filter((entry) => !reference.has(entry));

  if (missingFromOther.length > 0)
  {
    problems.push(
      `${otherName} is missing types declared in ${referenceName}:\n` +
        FormatSetDifference("missing", missingFromOther)
    );
  }
  if (extraInOther.length > 0)
  {
    problems.push(
      `${otherName} declares types absent from ${referenceName}:\n` +
        FormatSetDifference("extra", extraInOther)
    );
  }
}

const constantsSource = Read("blender_addon/components/constants.py");
const serializersSource = Read("blender_addon/export/component_serializers.py");
const bodiesSource = Read("blender_addon/ui/component_bodies.py");
const typesSource = Read("packages/engine/src/core/types/components.ts");
const registrySource = Read("packages/engine/src/core/loader/componentRegistry.ts");
const levelPySource = Read("blender_addon/export/level.py");
const manifestTsSource = Read("packages/engine/src/core/loader/manifest.ts");

const familySets = {
  GUI3D_CONTROLS: ParsePythonNameSet(constantsSource, "GUI3D_CONTROLS"),
  GUI3D_PANELS: ParsePythonNameSet(constantsSource, "GUI3D_PANELS"),
};

const enumTypes = ParseComponentTypesEnum(constantsSource);
const serializerTypes = ParsePythonRegistryKeys(serializersSource, "SERIALIZERS", familySets);
const drawerTypes = ParsePythonRegistryKeys(bodiesSource, "BODY_DRAWERS", familySets);
const tsUnionTypes = ParseTsComponentUnion(typesSource);
const tsHandlerTypes = ParseTsHandlerTypes(registrySource);

const problems = [];
CompareSets("COMPONENT_TYPES (constants.py)", enumTypes, "SERIALIZERS (component_serializers.py)", serializerTypes, problems);
CompareSets("COMPONENT_TYPES (constants.py)", enumTypes, "BODY_DRAWERS (component_bodies.py)", drawerTypes, problems);
CompareSets("COMPONENT_TYPES (constants.py)", enumTypes, "Component union (types/components.ts)", tsUnionTypes, problems);
CompareSets("COMPONENT_TYPES (constants.py)", enumTypes, "COMPONENT_HANDLERS (componentRegistry.ts)", tsHandlerTypes, problems);

const exporterVersion = ParseIntConstant(levelPySource, "SCHEMA_VERSION");
const runtimeVersion = ParseIntConstant(manifestTsSource, "SUPPORTED_SCHEMA_VERSION");
if (exporterVersion !== runtimeVersion)
{
  problems.push(
    `Manifest schema version mismatch: exporter SCHEMA_VERSION = ${exporterVersion} ` +
      `(blender_addon/export/level.py) vs runtime SUPPORTED_SCHEMA_VERSION = ${runtimeVersion} ` +
      `(packages/engine/src/core/loader/manifest.ts)`
  );
}

if (problems.length > 0)
{
  console.error("[check-component-types] registries out of sync:\n");
  for (const problem of problems)
  {
    console.error(problem + "\n");
  }
  process.exit(1);
}

console.log(
  `[check-component-types] OK — ${enumTypes.size} component types in sync across ` +
    `constants.py, SERIALIZERS, BODY_DRAWERS, types/components.ts, componentRegistry.ts; ` +
    `schema version ${exporterVersion}.`
);
