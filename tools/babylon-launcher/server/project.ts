import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";

import {
  PROJECT_DIR,
  ReadProjectManifest,
  type BabylonProjectManifest,
} from "./paths.js";

export interface ProjectSummary
{
  name: string;
  title: string;
  defaultLevel?: string;
  devPort: number;
  blenderExportPath: string;
  manifest?: BabylonProjectManifest;
  hasLevels: boolean;
  hasTauri: boolean;
  hasAndroid: boolean;
  publishVersion?: string;
  webBase?: string;
  desktopTargets?: string;
  desktopTargetsPreset?: string;
  icon?: string;
  productName?: string;
  identifier?: string;
  outputDir?: string;
}

export interface DevServerStatus
{
  app: string;
  port: number;
  running: boolean;
  pid?: number;
  url?: string;
  managed: boolean;
  error?: string;
}

export interface LevelsBlockUpdate
{
  include: string[];
  start: string;
  startManifest?: string;
}

export interface PublishBlockUpdate
{
  productName?: string;
  identifier?: string;
  version?: string;
  icon?: string;
  outputDir?: string;
  webBase?: string;
  desktopTargetsPreset?: string;
  desktopTargets?: string;
}

let devProcess: ChildProcess | null = null;

function AttachDevServerLogs(child: ChildProcess): void
{
  const prefix = `[${path.basename(PROJECT_DIR)}:dev]`;
  child.stdout?.on("data", (chunk: Buffer) =>
  {
    for (const line of chunk.toString().split("\n").filter(Boolean))
    {
      console.log(`${prefix} ${line}`);
    }
  });
  child.stderr?.on("data", (chunk: Buffer) =>
  {
    for (const line of chunk.toString().split("\n").filter(Boolean))
    {
      console.error(`${prefix} ${line}`);
    }
  });
  child.on("exit", (code, signal) =>
  {
    devProcess = null;
    if (code !== null && code !== 0)
    {
      console.error(`${prefix} exited with code ${code}${signal ? ` (${signal})` : ""}`);
    }
  });
  child.on("error", (error) =>
  {
    devProcess = null;
    console.error(`${prefix} failed to start: ${error.message}`);
  });
}

async function KillProcessOnPort(port: number): Promise<void>
{
  if (process.platform === "win32")
  {
    return;
  }
  await new Promise<void>((resolve) =>
  {
    const child = spawn("fuser", ["-k", `${port}/tcp`], { stdio: "ignore" });
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
}

function HasLevels(): boolean
{
  const levelsDir = path.join(PROJECT_DIR, "public", "levels");
  if (!fs.existsSync(levelsDir))
  {
    return false;
  }
  return fs.readdirSync(levelsDir).some((entry) =>
  {
    const full = path.join(levelsDir, entry);
    return fs.statSync(full).isDirectory();
  });
}

/**
 * Summary for the single project this launcher instance serves.
 */
export function GetProjectSummary(): ProjectSummary
{
  const manifest = ReadProjectManifest(PROJECT_DIR);
  const name = manifest?.name ?? path.basename(PROJECT_DIR);
  const title = manifest?.title ?? name;
  const relativeFromRepo = path.relative(
    path.resolve(PROJECT_DIR, "../.."),
    path.join(PROJECT_DIR, "public", "levels"),
  );

  return {
    name,
    title,
    defaultLevel: manifest?.defaultLevel ?? manifest?.levels?.start,
    devPort: manifest?.dev.port ?? 5173,
    blenderExportPath: manifest?.blenderExportPath
      ?? `${relativeFromRepo.replace(/\\/g, "/")}/`,
    manifest: manifest ?? undefined,
    hasLevels: HasLevels(),
    hasTauri: fs.existsSync(path.join(PROJECT_DIR, "src-tauri", "tauri.conf.json")),
    hasAndroid: fs.existsSync(path.join(PROJECT_DIR, "src-tauri", "gen", "android")),
    publishVersion: manifest?.publish?.version,
    webBase: manifest?.publish?.web?.base,
    desktopTargets: typeof manifest?.publish?.desktop?.targets === "string"
      ? manifest.publish.desktop.targets
      : Array.isArray(manifest?.publish?.desktop?.targets)
        ? manifest.publish.desktop.targets.join(",")
        : "all",
    desktopTargetsPreset: manifest?.publish?.desktop?.targetsPreset ?? "all",
    icon: manifest?.publish?.icon ?? "",
    productName: manifest?.publish?.productName ?? title,
    identifier: manifest?.publish?.identifier ?? `com.bjs.${name}`,
    outputDir: manifest?.publish?.outputDir ?? "release",
  };
}

/**
 * Exported level folder names under public/levels/.
 */
export function ListLevels(): string[]
{
  const levelsDir = path.join(PROJECT_DIR, "public", "levels");
  if (!fs.existsSync(levelsDir))
  {
    return [];
  }

  return fs.readdirSync(levelsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

/**
 * Write the levels include / start block back to babylon-project.json.
 */
export function UpdateLevelsBlock(update: LevelsBlockUpdate): BabylonProjectManifest
{
  const manifestPath = path.join(PROJECT_DIR, "babylon-project.json");
  const existing = ReadProjectManifest(PROJECT_DIR);
  if (existing === null)
  {
    throw new Error("babylon-project.json missing");
  }

  const next: BabylonProjectManifest = {
    ...existing,
    levels: {
      include: update.include,
      start: update.start,
      ...(update.startManifest !== undefined ? { startManifest: update.startManifest } : {}),
    },
    defaultLevel: update.start,
  };

  fs.writeFileSync(manifestPath, JSON.stringify(next, null, 2) + "\n");
  return next;
}

/**
 * Desktop target presets (installer formats). Matches scripts/publish/config.mjs.
 */
export const DESKTOP_TARGET_PRESETS = [
  { id: "all", label: "All platforms", targets: "all" },
  { id: "windows", label: "Windows only (msi)", targets: "msi" },
  { id: "macos", label: "macOS only (dmg)", targets: "dmg" },
  { id: "linux", label: "Linux only (deb + appimage)", targets: "deb,appimage" },
  { id: "windows-macos", label: "Windows + macOS", targets: "msi,dmg" },
  { id: "windows-linux", label: "Windows + Linux", targets: "msi,deb,appimage" },
  { id: "macos-linux", label: "macOS + Linux", targets: "dmg,deb,appimage" },
  { id: "none", label: "None (skip desktop bundles)", targets: "none" },
] as const;

/**
 * Write publish identity / desktop / web settings back to babylon-project.json.
 */
export function UpdatePublishBlock(update: PublishBlockUpdate): BabylonProjectManifest
{
  const manifestPath = path.join(PROJECT_DIR, "babylon-project.json");
  const existing = ReadProjectManifest(PROJECT_DIR);
  if (existing === null)
  {
    throw new Error("babylon-project.json missing");
  }

  const publish = { ...(existing.publish ?? {}) };

  if (update.productName !== undefined)
  {
    publish.productName = update.productName.trim() || existing.title || existing.name;
  }
  if (update.identifier !== undefined)
  {
    const identifier = update.identifier.trim();
    if (identifier !== "" && !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(identifier))
    {
      throw new Error(
        `Invalid identifier "${identifier}" — use reverse-DNS form like com.bjs.playground`,
      );
    }
    publish.identifier = identifier || publish.identifier;
  }
  if (update.version !== undefined)
  {
    publish.version = update.version.trim() || "0.1.0";
  }
  if (update.icon !== undefined)
  {
    publish.icon = update.icon;
  }
  if (update.outputDir !== undefined)
  {
    publish.outputDir = update.outputDir.trim() || "release";
  }
  if (update.webBase !== undefined)
  {
    let base = update.webBase.trim() || "/";
    if (!base.startsWith("/"))
    {
      base = `/${base}`;
    }
    if (!base.endsWith("/"))
    {
      base = `${base}/`;
    }
    publish.web = { ...(publish.web ?? {}), base };
  }

  const desktop = { ...(publish.desktop ?? {}) };
  if (update.desktopTargetsPreset !== undefined)
  {
    desktop.targetsPreset = update.desktopTargetsPreset;
    const preset = DESKTOP_TARGET_PRESETS.find((entry) => entry.id === update.desktopTargetsPreset);
    if (preset !== undefined)
    {
      desktop.targets = preset.targets;
    }
  }
  if (update.desktopTargets !== undefined)
  {
    desktop.targets = update.desktopTargets;
  }
  publish.desktop = desktop;

  const next: BabylonProjectManifest = {
    ...existing,
    publish,
    // Keep project title in sync when the product name changes.
    ...(update.productName !== undefined && update.productName.trim() !== ""
      ? { title: update.productName.trim() }
      : {}),
  };

  fs.writeFileSync(manifestPath, JSON.stringify(next, null, 2) + "\n");
  return next;
}

export async function IsPortOpen(port: number): Promise<boolean>
{
  return new Promise((resolve) =>
  {
    const socket = net.createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () =>
    {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

export async function GetDevServerStatus(): Promise<DevServerStatus>
{
  const project = GetProjectSummary();
  const port = project.devPort;
  const running = await IsPortOpen(port);
  return {
    app: project.name,
    port,
    running,
    pid: devProcess?.pid,
    url: running ? `http://localhost:${port}` : undefined,
    managed: Boolean(devProcess?.pid),
  };
}

export async function StartDevServer(): Promise<DevServerStatus>
{
  const status = await GetDevServerStatus();
  if (status.running)
  {
    return status;
  }

  if (devProcess !== null)
  {
    devProcess = null;
  }

  const child = spawn(
    "npm",
    ["run", "dev"],
    {
      cwd: PROJECT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      shell: process.platform === "win32",
    },
  );
  AttachDevServerLogs(child);
  child.unref();
  devProcess = child;

  for (let attempt = 0; attempt < 40; attempt++)
  {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const next = await GetDevServerStatus();
    if (next.running)
    {
      return next;
    }
    if (child.exitCode !== null)
    {
      return {
        ...next,
        error: `Dev server exited before port ${next.port} opened (code ${child.exitCode})`,
      };
    }
  }

  const failed = await GetDevServerStatus();
  return {
    ...failed,
    error: failed.running
      ? undefined
      : `Dev server did not start on port ${failed.port} within 10s — check launcher terminal output`,
  };
}

export async function StopDevServer(): Promise<DevServerStatus>
{
  if (devProcess?.pid)
  {
    try
    {
      process.kill(-devProcess.pid, "SIGTERM");
    }
    catch
    {
      try { devProcess.kill("SIGTERM"); } catch { /* already stopped */ }
    }
    devProcess = null;
  }

  const status = await GetDevServerStatus();
  if (status.running)
  {
    await KillProcessOnPort(status.port);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return GetDevServerStatus();
}
