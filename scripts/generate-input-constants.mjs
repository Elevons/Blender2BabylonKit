#!/usr/bin/env node
/**
 * Generate typed input constants from an *.inputactions.json asset (the Unity
 * "generated class" equivalent):
 *
 *   npm run input:gen
 *   npm run input:gen -- --map path/to/input.inputactions.json
 *
 * Reads game/input.inputactions.json (or --map) and writes
 * game/src/InputActions.ts with a `Maps` constant object plus one
 * `<Map>Actions` object per Action Map, so behaviors write
 * map.FindAction(PlayerActions.Jump) instead of a raw string — a typo becomes
 * a compile error instead of a silent runtime warning.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");

function ParseArgs(argv)
{
  const args = {};
  for (let index = 0; index < argv.length; index++)
  {
    if (argv[index] === "--app") { args.app = argv[++index]; }
    else if (argv[index] === "--map") { args.map = argv[++index]; }
    else { console.error(`Unknown argument: ${argv[index]}`); process.exit(1); }
  }
  return args;
}

const args = ParseArgs(process.argv.slice(2));
const appName = args.app ?? "game";
const appDir = path.join(ROOT, appName);
const mapPath = args.map !== undefined ? path.resolve(args.map) : path.join(appDir, "input.inputactions.json");
if (!fs.existsSync(mapPath))
{
  console.error(`No asset at ${mapPath}`);
  console.error(`Save one from Blender's Input Actions panel ("Save Asset (.json)") into ${appName}/input.inputactions.json`);
  process.exit(1);
}

const asset = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const maps = asset.maps ?? [];
if (maps.length === 0)
{
  console.error("Asset has no action maps — nothing to generate");
  process.exit(1);
}

/** "Move X" / "move-x" -> a safe identifier ("MoveX"); collisions fail loudly. */
function ToIdentifier(name)
{
  const identifier = name.replace(/[^A-Za-z0-9]+(.)?/g, (_, ch) => (ch ?? "").toUpperCase())
    .replace(/^[a-z]/, (ch) => ch.toUpperCase());
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier))
  {
    console.error(`Can't make an identifier from "${name}"`);
    process.exit(1);
  }
  return identifier;
}

function BuildEntries(items, kind)
{
  const seen = new Map();
  const lines = items.map((item) =>
  {
    const identifier = ToIdentifier(item.name);
    if (seen.has(identifier))
    {
      console.error(`${kind} "${item.name}" and "${seen.get(identifier)}" both map to identifier "${identifier}"`);
      process.exit(1);
    }
    seen.set(identifier, item.name);
    return `  ${identifier}: ${JSON.stringify(item.name)},`;
  });
  return lines.join("\n");
}

const blocks = [];

blocks.push(`export const Maps = {
${BuildEntries(maps, "map")}
} as const;`);

for (const map of maps)
{
  const mapIdentifier = ToIdentifier(map.name);
  blocks.push(`export const ${mapIdentifier}Actions = {
${BuildEntries(map.actions ?? [], `action in map "${map.name}"`)}
} as const;`);
}

const generated = `// GENERATED from ${path.relative(ROOT, mapPath)} — do not edit by hand.
// Regenerate: npm run input:gen
// Usage: import { PlayerActions } from '../InputActions';
//        this.player.FindAction(PlayerActions.Jump)?.IsPressed();

${blocks.join("\n\n")}

export type MapName = (typeof Maps)[keyof typeof Maps];
`;

const outPath = path.join(appDir, "src", "InputActions.ts");
fs.writeFileSync(outPath, generated);
const actionCount = maps.reduce((sum, map) => sum + (map.actions ?? []).length, 0);
console.log(`Wrote ${path.relative(ROOT, outPath)}: ${maps.length} map(s), ${actionCount} action(s)`);
