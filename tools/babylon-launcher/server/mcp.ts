import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

import { REPO_ROOT } from "./paths.js";

export interface McpStatus
{
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

const MCP_ENTRY = path.join(REPO_ROOT, "tools", "bjs-mcp", "dist", "index.js");
let mcpProcess: ChildProcess | null = null;

function IsMcpBuilt(): boolean
{
  return fs.existsSync(MCP_ENTRY);
}

async function FindMcpPidAsync(): Promise<number | undefined>
{
  return new Promise((resolve) =>
  {
    try
    {
      const child = spawn("pgrep", ["-f", MCP_ENTRY], { stdio: ["ignore", "pipe", "ignore"] });
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
        args: [MCP_ENTRY],
        cwd: REPO_ROOT,
      },
    },
  };
}

export async function GetMcpStatus(): Promise<McpStatus>
{
  const pgrepPid = await FindMcpPidAsync();
  const running = Boolean(mcpProcess?.pid && !mcpProcess.killed) || pgrepPid !== undefined;
  return {
    built: IsMcpBuilt(),
    running,
    pid: mcpProcess?.pid ?? pgrepPid,
    entryPath: MCP_ENTRY,
    repoRoot: REPO_ROOT,
    cursorConfig: GetMcpCursorConfig(),
  };
}

export async function BuildMcp(): Promise<McpStatus>
{
  await new Promise<void>((resolve, reject) =>
  {
    const child = spawn("npm", ["run", "mcp:build"], {
      cwd: REPO_ROOT,
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
  if (!IsMcpBuilt())
  {
    await BuildMcp();
  }

  const status = await GetMcpStatus();
  if (status.running)
  {
    return status;
  }

  mcpProcess = spawn("node", [MCP_ENTRY], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
  });
  mcpProcess.unref();

  await new Promise((r) => setTimeout(r, 300));
  return GetMcpStatus();
}

export async function StopMcp(): Promise<McpStatus>
{
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
