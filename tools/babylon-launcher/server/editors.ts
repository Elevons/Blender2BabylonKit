import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { REPO_ROOT } from "./paths.js";

export interface EditorPackageInfo
{
  name: string;
  version: string;
  editorId: string;
}

const EDITOR_PACKAGES: Array<{ editorId: string; packageName: string }> = [
  { editorId: "gui", packageName: "@babylonjs/gui-editor" },
  { editorId: "npe", packageName: "@babylonjs/node-particle-editor" },
  { editorId: "nme", packageName: "@babylonjs/node-editor" },
  { editorId: "nge", packageName: "@babylonjs/node-geometry-editor" },
  { editorId: "nrge", packageName: "@babylonjs/node-render-graph-editor" },
  { editorId: "sfe", packageName: "@babylonjs/smart-filters" },
];

function ReadInstalledVersion(packageName: string): string
{
  const launcherPkg = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "package.json",
  );
  const deps = JSON.parse(fs.readFileSync(launcherPkg, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  return deps.dependencies?.[packageName] ?? "unknown";
}

export function GetEditorVersions(): EditorPackageInfo[]
{
  return EDITOR_PACKAGES.map(({ editorId, packageName }) => ({
    editorId,
    name: packageName,
    version: ReadInstalledVersion(packageName),
  }));
}

export function GetEngineVersion(): string
{
  const enginePkg = path.join(REPO_ROOT, "packages", "engine", "package.json");
  if (!fs.existsSync(enginePkg))
  {
    return "unknown";
  }
  const peer = JSON.parse(fs.readFileSync(enginePkg, "utf8")) as {
    peerDependencies?: Record<string, string>;
  };
  return peer.peerDependencies?.["@babylonjs/core"] ?? "unknown";
}

export interface CompatibilityReport
{
  engineCore: string;
  editors: EditorPackageInfo[];
  aligned: boolean;
  warnings: string[];
}

export function CheckEditorCompatibility(): CompatibilityReport
{
  const engineCore = GetEngineVersion();
  const editors = GetEditorVersions();
  const warnings: string[] = [];
  const engineMajor = engineCore.replace(/[^\d].*$/, "");

  for (const editor of editors)
  {
    const editorMajor = editor.version.replace(/[^\d].*$/, "");
    if (engineMajor && editorMajor && engineMajor !== editorMajor)
    {
      warnings.push(
        `${editor.name} (${editor.version}) major version differs from engine core (${engineCore})`,
      );
    }
  }

  return {
    engineCore,
    editors,
    aligned: warnings.length === 0,
    warnings,
  };
}

export async function UpdateEditorPackages(target?: string): Promise<{ stdout: string; stderr: string }>
{
  const packages = EDITOR_PACKAGES.map((e) => e.packageName);
  const versionSuffix = target ?? "latest";
  const args = [
    "install",
    ...packages.map((pkg) => `${pkg}@${versionSuffix}`),
    "--workspace",
    "@bjs/babylon-launcher",
  ];

  return new Promise((resolve, reject) =>
  {
    const child = spawn("npm", args, {
      cwd: REPO_ROOT,
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) =>
    {
      if (code === 0)
      {
        resolve({ stdout, stderr });
      }
      else
      {
        reject(new Error(stderr || stdout || `npm install failed (${code})`));
      }
    });
  });
}
