import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { PROJECT_DIR, REPO_ROOT } from "./paths.js";
import { GetProjectSummary } from "./project.js";

export type PublishTarget = "web" | "desktop" | "android";

export interface PublishJobStatus
{
  target: PublishTarget | null;
  running: boolean;
  exitCode: number | null;
  logLines: string[];
}

export interface ArtifactInfo
{
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
}

const MAX_LOG_LINES = 500;

let publishProcess: ChildProcess | null = null;
let currentTarget: PublishTarget | null = null;
let lastExitCode: number | null = null;
const logLines: string[] = [];

function PushLog(line: string): void
{
  logLines.push(line);
  if (logLines.length > MAX_LOG_LINES)
  {
    logLines.splice(0, logLines.length - MAX_LOG_LINES);
  }
  console.log(`[publish] ${line}`);
}

/**
 * Spawn a publish script for the current project. Rejects if a job is already running.
 */
export async function RunPublish(target: PublishTarget): Promise<PublishJobStatus>
{
  if (publishProcess !== null)
  {
    throw new Error("A publish job is already running");
  }

  const project = GetProjectSummary();
  const scriptPath = path.join(REPO_ROOT, "scripts", "publish", `${target}.mjs`);
  if (!fs.existsSync(scriptPath))
  {
    throw new Error(`Publish script missing: ${scriptPath}`);
  }

  logLines.length = 0;
  lastExitCode = null;
  currentTarget = target;
  PushLog(`starting ${target} for ${project.name}`);

  const child = spawn(
    "node",
    [scriptPath, "--app", project.name],
    {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  publishProcess = child;

  child.stdout?.on("data", (chunk: Buffer) =>
  {
    for (const line of chunk.toString().split("\n").filter(Boolean))
    {
      PushLog(line);
    }
  });
  child.stderr?.on("data", (chunk: Buffer) =>
  {
    for (const line of chunk.toString().split("\n").filter(Boolean))
    {
      PushLog(line);
    }
  });
  child.on("close", (code) =>
  {
    lastExitCode = code;
    publishProcess = null;
    PushLog(`finished ${target} with exit code ${code}`);
  });
  child.on("error", (error) =>
  {
    lastExitCode = 1;
    publishProcess = null;
    PushLog(`failed to start: ${error.message}`);
  });

  return GetPublishStatus();
}

export function GetPublishStatus(): PublishJobStatus
{
  return {
    target: currentTarget,
    running: publishProcess !== null,
    exitCode: lastExitCode,
    logLines: [...logLines],
  };
}

/**
 * List files and folders under the project's output folder.
 */
export function ListArtifacts(): ArtifactInfo[]
{
  const summary = GetProjectSummary();
  const relative = summary.outputDir ?? "release";
  const releaseDir = path.isAbsolute(relative)
    ? relative
    : path.resolve(PROJECT_DIR, relative);

  if (!fs.existsSync(releaseDir))
  {
    return [];
  }

  return fs.readdirSync(releaseDir, { withFileTypes: true })
    .map((entry) =>
    {
      const filePath = path.join(releaseDir, entry.name);
      const stats = fs.statSync(filePath);
      const fileName = entry.isDirectory() ? `${entry.name}/` : entry.name;
      return {
        fileName,
        sizeBytes: entry.isDirectory() ? 0 : stats.size,
        modifiedAt: stats.mtime.toISOString(),
      };
    })
    .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
}

/**
 * Run publish:icon for the current project.
 */
export function ApplyProjectIcon(): { ok: boolean; log: string }
{
  const project = GetProjectSummary();
  const scriptPath = path.join(REPO_ROOT, "scripts", "publish", "icon.mjs");
  const result = spawnSync(
    "node",
    [scriptPath, "--app", project.name],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );
  const log = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return { ok: result.status === 0, log };
}
