#!/usr/bin/env node
/**
 * End-to-end check of the published kit inside a real consumer project.
 *
 *   node scripts/test-kit-in-project.mjs              # pack, install, start, probe
 *   node scripts/test-kit-in-project.mjs --stop       # stop the servers it started
 *   node scripts/test-kit-in-project.mjs --project /path/to/project --panel-port 3207
 *
 * Packs @bjs/engine (prepack rebuilds the docs site and the MCP vector index),
 * installs that tarball into the target project, verifies the bundled assets,
 * then starts the packaged control panel and the game dev server and probes
 * both. Prints the URLs to open.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PROJECT = path.resolve(ROOT, "..", "B2BKitTest");
const DEFAULT_PANEL_PORT = 3207;

/**
 * Read the command line into an options object.
 */
function ParseArguments(argv)
{
  const options = {
    project: DEFAULT_PROJECT,
    panelPort: DEFAULT_PANEL_PORT,
    stop: false,
    skipPack: false,
  };

  for (let index = 0; index < argv.length; index++)
  {
    const flag = argv[index];
    if (flag === "--project")
    {
      options.project = path.resolve(argv[++index]);
    }
    else if (flag === "--panel-port")
    {
      options.panelPort = Number(argv[++index]);
    }
    else if (flag === "--stop")
    {
      options.stop = true;
    }
    else if (flag === "--skip-pack")
    {
      options.skipPack = true;
    }
    else
    {
      console.error(`Unknown argument: ${flag}`);
      process.exit(1);
    }
  }

  return options;
}

/**
 * Run a command and stop the whole check when it fails.
 */
function Run(command, commandArguments, workingDirectory)
{
  console.log(`\n> ${command} ${commandArguments.join(" ")}`);
  const result = spawnSync(command, commandArguments, {
    cwd: workingDirectory,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0)
  {
    process.exit(result.status ?? 1);
  }
}

/**
 * Free a TCP port, ignoring the case where nothing is listening.
 */
function KillPort(port)
{
  if (process.platform === "win32")
  {
    return;
  }
  spawnSync("fuser", ["-k", `${port}/tcp`], { stdio: "ignore" });
}

/**
 * Read the dev-server port the target project is configured to use.
 */
function ReadDevPort(projectRoot)
{
  const manifestPath = path.join(projectRoot, "game", "b2bkit-project.json");
  if (!fs.existsSync(manifestPath))
  {
    return 5173;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return manifest.dev?.port ?? 5173;
}

/**
 * Fetch a URL, returning null instead of throwing when the server is not up.
 */
async function TryFetch(url, requestOptions = {})
{
  try
  {
    return await fetch(url, { signal: AbortSignal.timeout(3000), ...requestOptions });
  }
  catch
  {
    return null;
  }
}

/**
 * Poll the panel until its API answers or the timeout expires.
 */
async function WaitForPanel(port, timeoutMs)
{
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline)
  {
    const response = await TryFetch(`http://127.0.0.1:${port}/api/docs`);
    if (response !== null && response.ok)
    {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

/**
 * Report one pass/fail line and record failures for the exit code.
 */
const failures = [];
function Check(passed, label, detail = "")
{
  const mark = passed ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${label}${detail.length > 0 ? ` — ${detail}` : ""}`);
  if (!passed)
  {
    failures.push(label);
  }
}

/**
 * Build the kit tarball and install it into the consumer project.
 */
function PackAndInstall(projectRoot)
{
  const enginePackage = JSON.parse(
    fs.readFileSync(path.join(ROOT, "packages", "engine", "package.json"), "utf8"),
  );
  const destination = os.tmpdir();
  const tarball = path.join(destination, `bjs-engine-${enginePackage.version}.tgz`);

  fs.rmSync(tarball, { force: true });
  Run("npm", ["pack", "--workspace", "@bjs/engine", "--pack-destination", destination], ROOT);

  if (!fs.existsSync(tarball))
  {
    console.error(`\n[test-kit] Expected tarball at ${tarball}`);
    process.exit(1);
  }

  Run("npm", ["install", tarball], projectRoot);
  return tarball;
}

/**
 * Confirm the installed package carries the docs site, the MCP server, the
 * vector index, and the CLI entry points.
 */
function VerifyInstalledAssets(projectRoot)
{
  const installed = path.join(projectRoot, "node_modules", "@bjs", "engine");
  console.log("\n[test-kit] Bundled assets");

  Check(fs.existsSync(path.join(installed, "docs", "index.html")), "docs site present");
  Check(fs.existsSync(path.join(installed, "mcp", "dist", "index.js")), "MCP server present");
  Check(
    fs.existsSync(path.join(installed, "blender-addon")),
    "Blender add-on zip present",
  );

  const embeddingsPath = path.join(installed, "mcp", "data", "doc-embeddings.json");
  if (fs.existsSync(embeddingsPath))
  {
    const index = JSON.parse(fs.readFileSync(embeddingsPath, "utf8"));
    Check(index.entries.length > 0, "MCP vector index present", `${index.entries.length} sections · ${index.model}`);
    Check(
      Date.now() - new Date(index.builtAt).getTime() < 24 * 60 * 60 * 1000,
      "MCP vector index is fresh",
      `built ${index.builtAt}`,
    );
  }
  else
  {
    Check(false, "MCP vector index present");
  }

  for (const binary of ["b2bkit-control-panel", "b2bkit-addon-path", "b2bkit-mcp"])
  {
    Check(fs.existsSync(path.join(projectRoot, "node_modules", ".bin", binary)), `bin ${binary}`);
  }
}

/**
 * Start the packaged control panel as a detached process.
 */
function StartPanel(projectRoot, panelPort)
{
  const logPath = path.join(os.tmpdir(), `b2bkit-panel-${panelPort}.log`);
  const logHandle = fs.openSync(logPath, "a");

  const child = spawn("npx", ["b2bkit-control-panel"], {
    cwd: projectRoot,
    env: { ...process.env, CONTROL_PANEL_PORT: String(panelPort) },
    stdio: ["ignore", logHandle, logHandle],
    detached: true,
  });
  child.unref();

  return logPath;
}

/**
 * Probe the panel's MCP, docs, and dev-server surfaces.
 */
async function ProbePanel(panelPort, projectRoot)
{
  console.log("\n[test-kit] Panel API");

  const mcpResponse = await TryFetch(`http://127.0.0.1:${panelPort}/api/mcp`);
  const mcp = mcpResponse !== null ? await mcpResponse.json() : null;
  Check(mcp?.available === true, "MCP available");
  Check(mcp?.built === true, "MCP prebuilt");
  Check(mcp?.buildable === false, "MCP not rebuildable from an install", "expected for a packaged kit");
  Check(
    typeof mcp?.entryPath === "string" && mcp.entryPath.startsWith(projectRoot),
    "MCP entry resolves inside the project",
    mcp?.entryPath ?? "",
  );

  const docsResponse = await TryFetch(`http://127.0.0.1:${panelPort}/api/docs`);
  const docs = docsResponse !== null ? await docsResponse.json() : null;
  Check(docs?.available === true && docs?.built === true, "Docs available");
  Check(
    typeof docs?.indexPath === "string" && docs.indexPath.startsWith(projectRoot),
    "Docs served from the installed package",
    docs?.indexPath ?? "",
  );

  const page = await TryFetch(`http://127.0.0.1:${panelPort}/docs/index.html`);
  Check(page !== null && page.ok, "Docs site responds over HTTP");

  const removedEndpoint = await TryFetch(
    `http://127.0.0.1:${panelPort}/api/docs/build`,
    { method: "POST" },
  );
  Check(removedEndpoint !== null && removedEndpoint.status === 404, "Docs build endpoint is gone");
}

/**
 * Ask the panel to start the game dev server and confirm it reports healthy.
 */
async function StartAndProbeDevServer(panelPort, devPort)
{
  console.log("\n[test-kit] Game dev server");

  const startResponse = await TryFetch(
    `http://127.0.0.1:${panelPort}/api/dev/game/start`,
    { method: "POST", signal: AbortSignal.timeout(30000) },
  );
  const status = startResponse !== null ? await startResponse.json() : null;

  Check(status?.healthy === true, "Dev server healthy", status?.error ?? `port ${status?.port ?? devPort}`);

  const app = await TryFetch(`http://127.0.0.1:${devPort}/`);
  Check(app !== null && app.ok, "Game responds over HTTP");
}

/**
 * Stop anything this check started in the target project.
 */
function StopServers(projectRoot, panelPort)
{
  const devPort = ReadDevPort(projectRoot);
  console.log(`[test-kit] Stopping panel (${panelPort}) and dev server (${devPort})`);
  KillPort(panelPort);
  KillPort(devPort);
  console.log("[test-kit] Stopped.");
}

/**
 * Run the full pack → install → verify → serve loop.
 */
async function Main()
{
  const options = ParseArguments(process.argv.slice(2));

  if (!fs.existsSync(path.join(options.project, "package.json")))
  {
    console.error(`[test-kit] No project at ${options.project}`);
    console.error("[test-kit] Pass --project /path/to/consumer-project");
    process.exit(1);
  }

  if (options.stop)
  {
    StopServers(options.project, options.panelPort);
    return;
  }

  const devPort = ReadDevPort(options.project);
  console.log(`[test-kit] Kit:     ${ROOT}`);
  console.log(`[test-kit] Project: ${options.project}`);

  // Clear stale listeners so the panel and Vite bind the ports we probe.
  KillPort(options.panelPort);
  KillPort(devPort);

  if (!options.skipPack)
  {
    PackAndInstall(options.project);
  }

  VerifyInstalledAssets(options.project);

  const logPath = StartPanel(options.project, options.panelPort);
  const ready = await WaitForPanel(options.panelPort, 20000);
  if (!ready)
  {
    console.error(`\n[test-kit] Panel did not start on ${options.panelPort}. Log: ${logPath}`);
    process.exit(1);
  }

  await ProbePanel(options.panelPort, options.project);
  await StartAndProbeDevServer(options.panelPort, devPort);

  console.log("\n[test-kit] Open:");
  console.log(`  Control panel  http://localhost:${options.panelPort}`);
  console.log(`  Documentation  http://localhost:${options.panelPort}/docs/`);
  console.log(`  Game           http://localhost:${devPort}`);
  console.log(`\n[test-kit] Panel log: ${logPath}`);
  console.log(`[test-kit] Stop with: npm run kit:test -- --stop --panel-port ${options.panelPort}`);

  if (failures.length > 0)
  {
    console.error(`\n[test-kit] ${failures.length} check(s) failed: ${failures.join(", ")}`);
    process.exit(1);
  }

  console.log("\n[test-kit] All checks passed.");
}

await Main();
