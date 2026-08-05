import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

import { ResolveKitRepoRoot, ResolveProjectRoot } from "./paths.js";

export interface McpStatus
{
  /** False only when neither the package nor kit checkout contains bjs-mcp. */
  available: boolean;
  /** True in the kit checkout, where MCP TypeScript sources can be rebuilt. */
  buildable: boolean;
  built: boolean;
  running: boolean;
  pid?: number;
  entryPath: string;
  repoRoot: string;
  cursorConfig: {
    mcpServers: {
      "bjs-level-kit": {
        command: string;
        args: string[];
        cwd: string;
      };
    };
  };
}

const UNAVAILABLE_MESSAGE = "This kit installation does not contain bjs-mcp.";

let mcpProcess: ChildProcess | null = null;

function PackageRoot(): string
{
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function McpEntry(): string
{
  const kitRoot = ResolveKitRepoRoot();
  if (kitRoot !== null)
  {
    return path.join(kitRoot, "tools", "bjs-mcp", "dist", "index.js");
  }

  return path.join(PackageRoot(), "mcp", "dist", "index.js");
}

function IsMcpAvailable(): boolean
{
  return fs.existsSync(McpEntry());
}

function IsMcpBuilt(): boolean
{
  const entry = McpEntry();
  return entry.length > 0 && fs.existsSync(entry);
}

async function FindMcpPidAsync(): Promise<number | undefined>
{
  const entry = McpEntry();
  if (entry.length === 0)
  {
    return undefined;
  }

  return new Promise((resolve) =>
  {
    try
    {
      const child = spawn("pgrep", ["-f", entry], { stdio: ["ignore", "pipe", "ignore"] });
      let stdout = "";
      child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
      child.on("close", () =>
      {
        const pid = parseInt(stdout.trim().split("\n")[0] ?? "", 10);
        resolve(Number.isFinite(pid) ? pid : undefined);
      });
      child.on("error", () => resolve(undefined));
    }
    catch
    {
      resolve(undefined);
    }
  });
}

export function GetMcpCursorConfig()
{
  return {
    mcpServers: {
      "bjs-level-kit": {
        command: "node",
        args: [McpEntry()],
        cwd: ResolveProjectRoot(),
      },
    },
  };
}

export async function GetMcpStatus(): Promise<McpStatus>
{
  if (!IsMcpAvailable())
  {
    return {
      available: false,
      buildable: false,
      built: false,
      running: false,
      entryPath: "",
      repoRoot: ResolveProjectRoot(),
      cursorConfig: GetMcpCursorConfig(),
    };
  }

  const pgrepPid = await FindMcpPidAsync();
  const running = Boolean(mcpProcess?.pid && !mcpProcess.killed) || pgrepPid !== undefined;
  return {
    available: true,
    buildable: ResolveKitRepoRoot() !== null,
    built: IsMcpBuilt(),
    running,
    pid: mcpProcess?.pid ?? pgrepPid,
    entryPath: McpEntry(),
    repoRoot: ResolveProjectRoot(),
    cursorConfig: GetMcpCursorConfig(),
  };
}

export async function BuildMcp(): Promise<McpStatus>
{
  const kitRoot = ResolveKitRepoRoot();
  if (kitRoot === null)
  {
    throw new Error("bjs-mcp is prebuilt in installed kit packages.");
  }

  await new Promise<void>((resolve, reject) =>
  {
    const child = spawn("npm", ["run", "mcp:build"], {
      cwd: kitRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("close", (code) =>
    {
      if (code === 0) { resolve(); }
      else { reject(new Error(`mcp:build failed (${code})`)); }
    });
  });
  return GetMcpStatus();
}

export async function StartMcp(): Promise<McpStatus>
{
  if (!IsMcpAvailable())
  {
    throw new Error(UNAVAILABLE_MESSAGE);
  }

  if (!IsMcpBuilt())
  {
    if (ResolveKitRepoRoot() !== null)
    {
      await BuildMcp();
    }
    else
    {
      throw new Error(UNAVAILABLE_MESSAGE);
    }
  }

  const status = await GetMcpStatus();
  if (status.running)
  {
    return status;
  }

  mcpProcess = spawn("node", [McpEntry()], {
    cwd: ResolveProjectRoot(),
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
  });
  mcpProcess.unref();

  await new Promise((r) => setTimeout(r, 300));
  return GetMcpStatus();
}

export async function StopMcp(): Promise<McpStatus>
{
  if (!IsMcpAvailable())
  {
    return GetMcpStatus();
  }

  if (mcpProcess?.pid)
  {
    try
    {
      process.kill(-mcpProcess.pid, "SIGTERM");
    }
    catch
    {
      try { mcpProcess.kill("SIGTERM"); } catch { /* already stopped */ }
    }
    mcpProcess = null;
  }

  const pgrepPid = await FindMcpPidAsync();
  if (pgrepPid)
  {
    try { process.kill(pgrepPid, "SIGTERM"); } catch { /* ignore */ }
  }

  await new Promise((r) => setTimeout(r, 200));
  return GetMcpStatus();
}
