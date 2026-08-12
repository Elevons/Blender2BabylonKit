import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

import { GameDir, IsPathInside, ResolveProjectRoot, KIT_REPO_ROOT } from "./paths.js";
import { ListLevelManifests, ListLevels } from "./projects.js";

export type PublishPlatform = "web" | "tauri";

export interface PublishOptions
{
  platform: PublishPlatform;
  title?: string;
  version?: string;
  destination: string;
  levels: string[];
  startLevel: string;
  encryptAssets: boolean;
  includeServer: boolean;
}

export type PublishPhase =
  | "idle"
  | "building"
  | "filtering"
  | "copying"
  | "encrypting"
  | "done"
  | "error"
  | "cancelled";

export interface PublishStatus
{
  app: string;
  phase: PublishPhase;
  log: string[];
  error?: string;
  destination?: string;
  startedAt?: number;
  finishedAt?: number;
  progress?: number;
}

interface PakIndexEntry
{
  path: string;
  offset: number;
  length: number;
  iv: string;
}

class PublishCancelledError extends Error
{
  constructor()
  {
    super("Publish cancelled");
    this.name = "PublishCancelledError";
  }
}

const jobs = new Map<string, PublishStatus>();
const cancelFlags = new Map<string, boolean>();
const activeChildren = new Map<string, ChildProcess>();

/**
 * Return the latest publish status for an app (or an idle stub).
 */
export function GetPublishStatus(appName: string): PublishStatus
{
  return jobs.get(appName) ?? {
    app: appName,
    phase: "idle",
    log: [],
    progress: 0,
  };
}

/**
 * Validate options and kick off a background publish job. Rejects if one is
 * already running for this app.
 */
export function StartPublish(appName: string, options: PublishOptions): PublishStatus
{
  const current = jobs.get(appName);
  if (current && IsRunningPhase(current.phase))
  {
    throw new Error(`Publish already in progress for "${appName}"`);
  }

  ValidatePublishOptions(appName, options);

  cancelFlags.delete(appName);
  activeChildren.delete(appName);

  const status: PublishStatus = {
    app: appName,
    phase: "building",
    log: [],
    destination: path.resolve(options.destination),
    startedAt: Date.now(),
    progress: ProgressForPhase("building"),
  };
  jobs.set(appName, status);

  void RunPublishJob(appName, options, status).catch((error: Error) =>
  {
    if (error instanceof PublishCancelledError || cancelFlags.get(appName) === true)
    {
      MarkCancelled(status, appName);
      return;
    }

    SetPhase(status, "error");
    status.error = error.message;
    status.finishedAt = Date.now();
    AppendLog(status, `ERROR: ${error.message}`);
    CleanupJobRuntime(appName);
  });

  return status;
}

/**
 * Request cancellation of the running publish job and kill any npm build child.
 */
export function CancelPublish(appName: string): PublishStatus
{
  const status = jobs.get(appName);
  if (status === undefined || !IsRunningPhase(status.phase))
  {
    throw new Error(`No publish job is running for "${appName}"`);
  }

  cancelFlags.set(appName, true);
  AppendLog(status, "Cancel requested…");

  const child = activeChildren.get(appName);
  if (child !== undefined)
  {
    KillChildProcess(child);
  }
  else if (
    status.phase === "filtering"
    || status.phase === "copying"
    || status.phase === "encrypting"
  )
  {
    // Sync phases check the cancel flag between steps; mark finished now.
    MarkCancelled(status, appName);
  }

  return status;
}

function IsRunningPhase(phase: PublishPhase): boolean
{
  return phase === "building"
    || phase === "filtering"
    || phase === "copying"
    || phase === "encrypting";
}

function ProgressForPhase(phase: PublishPhase): number
{
  switch (phase)
  {
    case "building":
      return 25;
    case "filtering":
      return 50;
    case "copying":
      return 70;
    case "encrypting":
      return 85;
    case "done":
    case "error":
      return 100;
    case "cancelled":
    case "idle":
    default:
      return 0;
  }
}

function SetPhase(status: PublishStatus, phase: PublishPhase): void
{
  status.phase = phase;
  if (phase !== "cancelled")
  {
    status.progress = ProgressForPhase(phase);
  }
}

function MarkCancelled(status: PublishStatus, appName: string): void
{
  if (status.phase === "cancelled")
  {
    return;
  }

  status.progress = status.progress ?? ProgressForPhase(status.phase);
  SetPhase(status, "cancelled");
  status.finishedAt = Date.now();
  AppendLog(status, "Publish cancelled.");
  CleanupJobRuntime(appName);
}

function CleanupJobRuntime(appName: string): void
{
  cancelFlags.delete(appName);
  activeChildren.delete(appName);
}

function AssertNotCancelled(appName: string): void
{
  if (cancelFlags.get(appName) === true)
  {
    throw new PublishCancelledError();
  }
}

function KillChildProcess(child: ChildProcess): void
{
  if (child.pid === undefined)
  {
    return;
  }

  try
  {
    if (process.platform === "win32")
    {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    }

    try
    {
      process.kill(-child.pid, "SIGTERM");
    }
    catch
    {
      child.kill("SIGTERM");
    }
  }
  catch
  {
    /* Process may already have exited. */
  }
}

function AppendLog(status: PublishStatus, line: string): void
{
  status.log.push(line);
  if (status.log.length > 500)
  {
    status.log.splice(0, status.log.length - 500);
  }
}

function ValidatePublishOptions(appName: string, options: PublishOptions): void
{
  if (options.platform !== "web")
  {
    throw new Error(`Platform "${options.platform}" is not supported yet (web only in v1)`);
  }

  if (!options.destination || typeof options.destination !== "string")
  {
    throw new Error("destination is required");
  }

  const destination = path.resolve(options.destination);
  if (!path.isAbsolute(destination))
  {
    throw new Error("destination must be an absolute path");
  }

  if (!Array.isArray(options.levels) || options.levels.length === 0)
  {
    throw new Error("at least one level must be included");
  }

  const available = new Set(ListLevels(appName));
  for (const level of options.levels)
  {
    if (!available.has(level))
    {
      throw new Error(`Unknown level "${level}"`);
    }
  }

  if (!options.startLevel || typeof options.startLevel !== "string")
  {
    throw new Error("startLevel is required");
  }

  const startUrl = NormalizeManifestUrl(options.startLevel);
  const manifests = ListLevelManifests(appName);
  const match = manifests.find(
    (entry) => NormalizeManifestUrl(entry.url) === startUrl
  );
  if (!match)
  {
    throw new Error(`Unknown startLevel "${options.startLevel}"`);
  }

  if (!options.levels.includes(match.level))
  {
    throw new Error(`startLevel "${startUrl}" belongs to level "${match.level}", which is not included`);
  }

  if (!fs.existsSync(GameDir()))
  {
    throw new Error(`App "${appName}" not found`);
  }

  AssertSafeDestination(appName, destination);
}

/**
 * Publish-time start level for `VITE_START_LEVEL`. Relative `./levels/…` keeps
 * the folder portable under Vite `base: './'` (any host subdirectory).
 */
function NormalizeManifestUrl(value: string): string
{
  const trimmed = value.trim().replace(/^\/+/, "");
  const relative = trimmed.startsWith("levels/")
    ? trimmed
    : `levels/${trimmed}`;
  return `./${relative}`;
}

/**
 * Include developer tooling when any published level enables Debug Build.
 * Missing debug fields retain the engine's backward-compatible true default.
 */
function PublishedLevelsRequireDeveloperTools(appName: string, includedLevels: string[]): boolean
{
  const includedLevelSet = new Set(includedLevels);
  const manifests = ListLevelManifests(appName);

  for (const manifestEntry of manifests)
  {
    if (!includedLevelSet.has(manifestEntry.level))
    {
      continue;
    }

    const manifestPath = path.join(
      GameDir(),
      "public",
      "levels",
      manifestEntry.level,
      manifestEntry.file,
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { debug?: unknown };
    if (manifest.debug !== false)
    {
      return true;
    }
  }

  return false;
}

async function RunPublishJob(
  appName: string,
  options: PublishOptions,
  status: PublishStatus,
): Promise<void>
{
  const appDir = GameDir();
  const distDir = path.join(appDir, "dist");
  const destination = path.resolve(options.destination);
  const startUrl = NormalizeManifestUrl(options.startLevel);
  const includeDeveloperTools = PublishedLevelsRequireDeveloperTools(appName, options.levels);

  AppendLog(status, `Building ${appName} (start level ${startUrl})…`);
  AppendLog(status, includeDeveloperTools
    ? "Including developer tools (Debug Build enabled)…"
    : "Excluding developer tools (Debug Build disabled)…");
  SetPhase(status, "building");
  await RunNpmBuild(appName, startUrl, includeDeveloperTools, status);
  AssertNotCancelled(appName);

  SetPhase(status, "filtering");
  AppendLog(status, "Filtering levels…");
  FilterDistLevels(distDir, options.levels, status);
  AssertNotCancelled(appName);

  SetPhase(status, "copying");
  AppendLog(status, `Copying to ${destination}…`);
  CopyDistToDestination(distDir, destination);
  AssertNotCancelled(appName);

  if (options.encryptAssets)
  {
    SetPhase(status, "encrypting");
    AppendLog(status, "Encrypting level assets into assets.pak…");
    EncryptLevelAssets(destination, status);
    AssertNotCancelled(appName);
  }

  if (options.includeServer)
  {
    AppendLog(status, "Adding dependency-free Node.js web server…");
    WriteWebServer(destination);
    AssertNotCancelled(appName);
  }

  if (options.title || options.version || options.includeServer)
  {
    WriteBuildMeta(destination, {
      title: options.title,
      version: options.version,
      startLevel: startUrl,
      levels: options.levels,
      encryptAssets: options.encryptAssets,
      includeServer: options.includeServer,
      builtAt: new Date().toISOString(),
    });
  }

  AssertNotCancelled(appName);
  SetPhase(status, "done");
  status.finishedAt = Date.now();
  AppendLog(status, `Done → ${destination}`);
  CleanupJobRuntime(appName);
}

function RunNpmBuild(
  appName: string,
  startLevelUrl: string,
  includeDeveloperTools: boolean,
  status: PublishStatus,
): Promise<void>
{
  return new Promise((resolve, reject) =>
  {
    const child = spawn(
      "npm",
      ["run", "build", "--workspace", "game"],
      {
        cwd: ResolveProjectRoot(),
        env: {
          ...process.env,
          VITE_START_LEVEL: startLevelUrl,
          VITE_INCLUDE_DEVELOPER_TOOLS: includeDeveloperTools ? "true" : "false",
        },
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
        shell: process.platform === "win32",
      },
    );
    activeChildren.set(appName, child);

    child.stdout?.on("data", (chunk: Buffer) =>
    {
      for (const line of chunk.toString().split("\n").filter(Boolean))
      {
        AppendLog(status, line);
      }
    });
    child.stderr?.on("data", (chunk: Buffer) =>
    {
      for (const line of chunk.toString().split("\n").filter(Boolean))
      {
        AppendLog(status, line);
      }
    });
    child.on("error", (error) =>
    {
      activeChildren.delete(appName);
      reject(error);
    });
    child.on("close", (code) =>
    {
      activeChildren.delete(appName);
      if (cancelFlags.get(appName) === true)
      {
        reject(new PublishCancelledError());
        return;
      }
      if (code === 0)
      {
        resolve();
        return;
      }
      reject(new Error(`npm run build exited with code ${code ?? "unknown"}`));
    });
  });
}

/**
 * After vite copies public/levels wholesale, drop any level folders the user
 * did not include in this publish.
 */
function FilterDistLevels(
  distDir: string,
  includedLevels: string[],
  status: PublishStatus,
): void
{
  const levelsDir = path.join(distDir, "levels");
  if (!fs.existsSync(levelsDir))
  {
    AppendLog(status, "No dist/levels folder — nothing to filter");
    return;
  }

  const keep = new Set(includedLevels);
  for (const entry of fs.readdirSync(levelsDir, { withFileTypes: true }))
  {
    if (!entry.isDirectory())
    {
      continue;
    }
    if (keep.has(entry.name))
    {
      continue;
    }
    const fullPath = path.join(levelsDir, entry.name);
    fs.rmSync(fullPath, { recursive: true, force: true });
    AppendLog(status, `Removed excluded level: ${entry.name}`);
  }
}

function CopyDistToDestination(distDir: string, destination: string): void
{
  if (!fs.existsSync(distDir))
  {
    throw new Error(`Build output missing at ${distDir}`);
  }

  fs.mkdirSync(destination, { recursive: true });

  // Clear previous publish contents so stale files do not linger.
  for (const entry of fs.readdirSync(destination))
  {
    fs.rmSync(path.join(destination, entry), { recursive: true, force: true });
  }

  fs.cpSync(distDir, destination, { recursive: true });
}

function WriteBuildMeta(
  destination: string,
  meta: Record<string, unknown>,
): void
{
  fs.writeFileSync(
    path.join(destination, "publish-meta.json"),
    JSON.stringify(meta, null, 2),
    "utf8",
  );
}

/**
 * Add a dependency-free Node.js static server to a published web build.
 * It serves known MIME types and falls back to index.html for browser routes.
 */
export function WriteWebServer(destination: string): void
{
  const serverSource = `import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "0.0.0.0";
const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".env", "application/octet-stream"],
  [".glb", "model/gltf-binary"],
  [".gltf", "model/gltf+json"],
  [".hdr", "application/octet-stream"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".pak", "application/octet-stream"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".wasm", "application/wasm"],
  [".wav", "audio/wav"],
  [".webp", "image/webp"],
]);

function SendFile(request, response, filePath)
{
  const stat = fs.statSync(filePath);
  const contentType = MIME_TYPES.get(path.extname(filePath).toLowerCase())
    ?? "application/octet-stream";
  const cacheControl = filePath.endsWith("index.html") || filePath.endsWith("pak-sw.js")
    ? "no-cache"
    : "public, max-age=3600";
  const rangeHeader = request.headers.range;

  if (typeof rangeHeader === "string")
  {
    const match = /^bytes=(\\d*)-(\\d*)$/i.exec(rangeHeader.trim());
    if (match)
    {
      const size = stat.size;
      let start = match[1] === "" ? 0 : Number(match[1]);
      let end = match[2] === "" ? size - 1 : Number(match[2]);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size)
      {
        response.writeHead(416, {
          "Content-Range": "bytes */" + size,
          "Accept-Ranges": "bytes",
        });
        response.end();
        return;
      }
      end = Math.min(end, size - 1);
      const length = end - start + 1;
      response.writeHead(206, {
        "Content-Type": contentType,
        "Content-Length": length,
        "Content-Range": "bytes " + start + "-" + end + "/" + size,
        "Accept-Ranges": "bytes",
        "Cache-Control": cacheControl,
      });
      if (request.method === "HEAD")
      {
        response.end();
        return;
      }
      fs.createReadStream(filePath, { start, end }).pipe(response);
      return;
    }
  }

  response.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size,
    "Accept-Ranges": "bytes",
    "Cache-Control": cacheControl,
  });

  if (request.method === "HEAD")
  {
    response.end();
    return;
  }

  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) =>
{
  if (request.method !== "GET" && request.method !== "HEAD")
  {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  try
  {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const relativePath = decodedPath === "/"
      ? "index.html"
      : decodedPath.replace(/^\\/+/, "");
    let filePath = path.resolve(ROOT, relativePath);

    if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep))
    {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory())
    {
      filePath = path.join(filePath, "index.html");
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile())
    {
      const acceptsHtml = (request.headers.accept ?? "").includes("text/html");
      if (acceptsHtml)
      {
        filePath = path.join(ROOT, "index.html");
      }
      else
      {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
    }

    SendFile(request, response, filePath);
  }
  catch (error)
  {
    console.error(error);
    response.writeHead(500);
    response.end("Internal server error");
  }
});

server.listen(PORT, HOST, () =>
{
  console.log("Web build: http://" + HOST + ":" + PORT);
});
`;

  const packageJson = {
    name: "b2bkit-web-build",
    private: true,
    version: "1.0.0",
    type: "module",
    scripts: {
      start: "node server.mjs",
    },
  };

  fs.writeFileSync(path.join(destination, "server.mjs"), serverSource, "utf8");
  fs.writeFileSync(
    path.join(destination, "package.json"),
    JSON.stringify(packageJson, null, 2) + "\n",
    "utf8",
  );
}

/**
 * Pack every file under destination/levels into an AES-256-GCM assets.pak,
 * delete the loose files, emit pak-sw.js, and rewrite index.html to bootstrap
 * the service worker before loading the app module.
 */
function EncryptLevelAssets(destination: string, status: PublishStatus): void
{
  const levelsDir = path.join(destination, "levels");
  if (!fs.existsSync(levelsDir))
  {
    AppendLog(status, "No levels to encrypt — skipping pack");
    return;
  }

  const files = CollectFiles(levelsDir);
  if (files.length === 0)
  {
    AppendLog(status, "No level files found — skipping pack");
    return;
  }

  const key = crypto.randomBytes(32);
  const chunks: Buffer[] = [];
  const index: PakIndexEntry[] = [];
  let offset = 0;

  for (const absolutePath of files)
  {
    const relative = path.relative(destination, absolutePath).split(path.sep).join("/");
    const plain = fs.readFileSync(absolutePath);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);

    index.push({
      path: relative,
      offset,
      length: encrypted.length,
      iv: iv.toString("base64"),
    });
    chunks.push(encrypted);
    offset += encrypted.length;
  }

  const payload = Buffer.concat(chunks);
  const indexJson = Buffer.from(JSON.stringify(index), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(indexJson.length, 0);
  const pak = Buffer.concat([header, indexJson, payload]);

  fs.writeFileSync(path.join(destination, "assets.pak"), pak);

  for (const absolutePath of files)
  {
    fs.rmSync(absolutePath, { force: true });
  }
  RemoveEmptyDirs(levelsDir);
  if (fs.existsSync(levelsDir) && fs.readdirSync(levelsDir).length === 0)
  {
    fs.rmSync(levelsDir, { recursive: true, force: true });
  }

  const keyB64 = key.toString("base64");
  fs.writeFileSync(
    path.join(destination, "pak-sw.js"),
    BuildServiceWorkerSource(keyB64),
    "utf8",
  );

  RewriteIndexForPak(destination, keyB64);
  AppendLog(status, `Packed ${files.length} file(s) into assets.pak`);
}

function CollectFiles(rootDir: string): string[]
{
  const results: string[] = [];

  function Walk(directory: string): void
  {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }))
    {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory())
      {
        Walk(fullPath);
      }
      else if (entry.isFile())
      {
        results.push(fullPath);
      }
    }
  }

  Walk(rootDir);
  return results.sort((a, b) => a.localeCompare(b));
}

function RemoveEmptyDirs(directory: string): void
{
  if (!fs.existsSync(directory))
  {
    return;
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true }))
  {
    if (entry.isDirectory())
    {
      RemoveEmptyDirs(path.join(directory, entry.name));
    }
  }

  if (fs.readdirSync(directory).length === 0)
  {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function BuildServiceWorkerSource(keyBase64: string): string
{
  return `/* Generated by project-control-panel publish — AES pack service worker */
const KEY_B64 = ${JSON.stringify(keyBase64)};
const PAK_URL = "./assets.pak";
const CACHE_NAME = "bjs-pak-" + KEY_B64.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);

let pakPromise = null;

async function LoadKey()
{
  const raw = Uint8Array.from(atob(KEY_B64), (char) => char.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
}

async function Broadcast(message)
{
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients)
  {
    client.postMessage(message);
  }
}

async function ClearStalePakCaches()
{
  const keys = await caches.keys();
  await Promise.all(keys.map((key) =>
  {
    if (key.startsWith("bjs-pak-") && key !== CACHE_NAME)
    {
      return caches.delete(key);
    }
    return Promise.resolve();
  }));
}

/**
 * Open the cached pak as a Blob handle. Cache Storage keeps the bytes on disk;
 * we only pull small slices into memory when decrypting an entry.
 */
async function OpenPakBlob()
{
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(PAK_URL);
  if (!cached)
  {
    throw new Error("assets.pak missing from Cache Storage — reload to download again");
  }
  return cached.blob();
}

async function LoadPak()
{
  if (pakPromise)
  {
    return pakPromise.then(async (packed) =>
    {
      await Broadcast({ type: "bjs-pak-ready" });
      return packed;
    });
  }

  pakPromise = (async () =>
  {
    const blob = await OpenPakBlob();
    const header = new DataView(await blob.slice(0, 4).arrayBuffer());
    const indexLength = header.getUint32(0, true);
    if (indexLength <= 0 || indexLength > blob.size - 4)
    {
      throw new Error("Corrupt assets.pak index length");
    }
    const indexBytes = new Uint8Array(await blob.slice(4, 4 + indexLength).arrayBuffer());
    const index = JSON.parse(new TextDecoder().decode(indexBytes));
    const packed = {
      blob,
      index,
      payloadOffset: 4 + indexLength,
      key: await LoadKey(),
    };
    await Broadcast({ type: "bjs-pak-ready" });
    return packed;
  })().catch((error) =>
  {
    pakPromise = null;
    void Broadcast({ type: "bjs-pak-error", message: String(error && error.message ? error.message : error) });
    throw error;
  });

  return pakPromise;
}

function MimeFor(pathName)
{
  const lower = pathName.toLowerCase();
  if (lower.endsWith(".json")) { return "application/json"; }
  if (lower.endsWith(".glb")) { return "model/gltf-binary"; }
  if (lower.endsWith(".gltf")) { return "model/gltf+json"; }
  if (lower.endsWith(".png")) { return "image/png"; }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) { return "image/jpeg"; }
  if (lower.endsWith(".webp")) { return "image/webp"; }
  if (lower.endsWith(".hdr")) { return "application/octet-stream"; }
  if (lower.endsWith(".env")) { return "application/octet-stream"; }
  if (lower.endsWith(".wasm")) { return "application/wasm"; }
  if (lower.endsWith(".mp3")) { return "audio/mpeg"; }
  if (lower.endsWith(".ogg")) { return "audio/ogg"; }
  if (lower.endsWith(".wav")) { return "audio/wav"; }
  return "application/octet-stream";
}

function NormalizeRequestPath(url)
{
  let pathname = new URL(url).pathname;
  try
  {
    pathname = decodeURIComponent(pathname);
  }
  catch (_error)
  {
    // Keep the raw pathname if the request URI is malformed.
  }
  pathname = pathname.replace(/^\\/+/, "");
  if (pathname.startsWith("levels/"))
  {
    return pathname;
  }
  const levelsIndex = pathname.indexOf("/levels/");
  if (levelsIndex >= 0)
  {
    return pathname.slice(levelsIndex + 1);
  }
  return pathname;
}

async function DecryptEntry(pak, entry)
{
  const cipherStart = pak.payloadOffset + entry.offset;
  const cipherBytes = new Uint8Array(
    await pak.blob.slice(cipherStart, cipherStart + entry.length).arrayBuffer()
  );
  if (cipherBytes.length < 16)
  {
    throw new Error("Corrupt pak entry: " + entry.path);
  }
  const ciphertext = cipherBytes.slice(0, cipherBytes.length - 16);
  const tag = cipherBytes.slice(cipherBytes.length - 16);
  const iv = Uint8Array.from(atob(entry.iv), (char) => char.charCodeAt(0));
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext);
  combined.set(tag, ciphertext.length);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, pak.key, combined);
}

self.addEventListener("install", (event) =>
{
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) =>
{
  event.waitUntil((async () =>
  {
    await self.clients.claim();
    await ClearStalePakCaches();
  })());
});

self.addEventListener("message", (event) =>
{
  if (!event.data)
  {
    return;
  }
  if (event.data.type === "SKIP_WAITING")
  {
    self.skipWaiting();
    return;
  }
  if (event.data.type === "bjs-pak-prefetch")
  {
    const replyPort = event.ports && event.ports[0] ? event.ports[0] : null;
    event.waitUntil((async () =>
    {
      try
      {
        await LoadPak();
        if (replyPort)
        {
          replyPort.postMessage({ type: "bjs-pak-ready" });
        }
      }
      catch (error)
      {
        if (replyPort)
        {
          replyPort.postMessage({
            type: "bjs-pak-error",
            message: String(error && error.message ? error.message : error),
          });
        }
        throw error;
      }
    })());
  }
});

self.addEventListener("fetch", (event) =>
{
  const relative = NormalizeRequestPath(event.request.url);
  if (!relative.startsWith("levels/"))
  {
    return;
  }

  event.respondWith((async () =>
  {
    const pak = await LoadPak();
    const entry = pak.index.find((item) => item.path === relative);
    if (!entry)
    {
      return new Response("Not found in assets.pak: " + relative, { status: 404 });
    }
    const plain = await DecryptEntry(pak, entry);
    return new Response(plain, {
      status: 200,
      headers: {
        "Content-Type": MimeFor(relative),
        "Cache-Control": "no-store",
      },
    });
  })());
});
`;
}

/**
 * Replace the Vite module script tag with a bootstrap that registers the SW,
 * reloads once so the page is controlled, then dynamically imports the bundle.
 * Safe to re-run on an already-bootstrapped index.html (picks up MODULE_SRC).
 */
function RewriteIndexForPak(destination: string, keyBase64: string): void
{
  const indexPath = path.join(destination, "index.html");
  if (!fs.existsSync(indexPath))
  {
    throw new Error("index.html missing in publish output");
  }

  let html = fs.readFileSync(indexPath, "utf8");
  const scriptMatch = html.match(/<script\s+type="module"[^>]*\ssrc="([^"]+)"[^>]*>\s*<\/script>/i)
    ?? html.match(/<script\s+type="module"\s+crossorigin\s+src="([^"]+)"><\/script>/i);
  const existingModule = html.match(/var MODULE_SRC = ("[^"]+")/);
  const existingBootstrap = html.match(/<script>\s*\(function \(\) \{\s*var MODULE_SRC = "[^"]+";[\s\S]*?\}\)\(\);\s*<\/script>/);

  let moduleSrc: string;
  let replaceTarget: string;
  if (scriptMatch)
  {
    moduleSrc = scriptMatch[1];
    replaceTarget = scriptMatch[0];
  }
  else if (existingModule && existingBootstrap)
  {
    moduleSrc = JSON.parse(existingModule[1]);
    replaceTarget = existingBootstrap[0];
  }
  else
  {
    throw new Error("Could not find Vite module script in index.html");
  }
  // Query bust so a republish installs a new worker instead of keeping a stale one.
  const swVersion = keyBase64.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
  const bootstrap = `<script>
(function () {
  var MODULE_SRC = ${JSON.stringify(moduleSrc)};
  var SW_URL = "./pak-sw.js?v=${swVersion}";
  var PAK_URL = "./assets.pak";
  var CACHE_NAME = "bjs-pak-${swVersion}";
  var RELOAD_KEY = "bjs-pak-sw-reload";

  function FormatBytes(byteCount) {
    if (byteCount < 1024) { return byteCount + " B"; }
    if (byteCount < 1048576) { return Math.round(byteCount / 1024) + " KB"; }
    return (byteCount / 1048576).toFixed(1) + " MB";
  }

  function SetOverlay(status, ratio, detail) {
    var root = document.getElementById("bjs-loading");
    var statusElement = document.getElementById("bjs-loading-status");
    var bar = document.getElementById("bjs-loading-bar");
    var pct = document.getElementById("bjs-loading-pct");
    if (!root || !bar) { return; }
    root.dataset.hidden = "false";
    root.style.display = "flex";
    root.setAttribute("aria-busy", "true");
    if (statusElement && status) { statusElement.textContent = status; }
    if (ratio === null || ratio === undefined || !isFinite(ratio)) {
      bar.dataset.indeterminate = "true";
      bar.style.width = "40%";
      if (pct) {
        pct.textContent = detail && detail.total > 0
          ? FormatBytes(detail.loaded) + " / " + FormatBytes(detail.total)
          : "";
      }
      return;
    }
    var clamped = Math.min(1, Math.max(0, ratio));
    bar.dataset.indeterminate = "false";
    bar.style.width = (clamped * 100).toFixed(1) + "%";
    if (pct) {
      pct.textContent = detail && detail.total > 0
        ? Math.round(clamped * 100) + "% · " + FormatBytes(detail.loaded) + " / " + FormatBytes(detail.total)
        : Math.round(clamped * 100) + "%";
    }
  }

  function Boot() {
    SetOverlay("Starting…", null);
    var tag = document.createElement("script");
    tag.type = "module";
    tag.src = MODULE_SRC;
    document.head.appendChild(tag);
  }

  function WaitForWorker(worker) {
    if (!worker) {
      return Promise.resolve();
    }
    if (worker.state === "activated") {
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      worker.addEventListener("statechange", function onStateChange() {
        if (worker.state === "activated") {
          worker.removeEventListener("statechange", onStateChange);
          resolve();
        }
      });
    });
  }

  function EnsureControlled() {
    if (navigator.serviceWorker.controller) {
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        resolve();
      }, { once: true });
    });
  }

  /**
   * Stream assets.pak into Cache Storage on the page. Progress comes from a
   * tee'd read of the same body — no 300MB ArrayBuffer, no postMessage transfer.
   */
  function DownloadPakToCache(onProgress) {
    return caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(PAK_URL).then(function (cached) {
        if (cached) {
          return cached.blob().then(function (blob) {
            onProgress(blob.size, blob.size);
          });
        }

        return fetch(PAK_URL, { cache: "no-store" }).then(function (response) {
          if (!response.ok) {
            throw new Error("Failed to fetch assets.pak: " + response.status);
          }
          var total = Number(response.headers.get("content-length") || "0");
          var lastProgressAt = 0;

          function Report(loaded, totalBytes) {
            var now = Date.now();
            if (now - lastProgressAt < 100 && loaded !== totalBytes) {
              return;
            }
            lastProgressAt = now;
            onProgress(loaded, totalBytes);
          }

          if (!response.body || typeof response.body.tee !== "function") {
            return response.arrayBuffer().then(function (buffer) {
              Report(buffer.byteLength, buffer.byteLength);
              var headers = { "Content-Type": "application/octet-stream" };
              headers["Content-Length"] = String(buffer.byteLength);
              return cache.put(PAK_URL, new Response(buffer, { status: 200, headers: headers }));
            });
          }

          var branches = response.body.tee();
          var progressBody = branches[0];
          var cacheBody = branches[1];
          var headers = { "Content-Type": "application/octet-stream" };
          if (total > 0) {
            headers["Content-Length"] = String(total);
          }
          var cachePut = cache.put(PAK_URL, new Response(cacheBody, {
            status: 200,
            headers: headers,
          }));

          var reader = progressBody.getReader();
          var loaded = 0;
          function Pump() {
            return reader.read().then(function (result) {
              if (result.done) {
                Report(total > 0 ? total : loaded, total > 0 ? total : loaded);
                return cachePut;
              }
              loaded += result.value.byteLength;
              Report(loaded, total);
              return Pump();
            });
          }
          return Pump();
        });
      });
    });
  }

  function AskSwToOpenPak() {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var channel = new MessageChannel();
      var timeout = setTimeout(function () {
        Finish(new Error("Service worker did not acknowledge assets.pak"));
      }, 30000);
      function Finish(error) {
        if (settled) { return; }
        settled = true;
        clearTimeout(timeout);
        channel.port1.onmessage = null;
        navigator.serviceWorker.removeEventListener("message", onBroadcast);
        if (error) {
          console.error("[bjs] Pak load failed", error);
          SetOverlay("Download failed — reload to retry", null);
          reject(error);
        }
        else { resolve(); }
      }
      function HandleAck(data) {
        if (!data) { return; }
        if (data.type === "bjs-pak-ready") {
          SetOverlay("Assets ready", 1);
          Finish();
          return;
        }
        if (data.type === "bjs-pak-error") {
          Finish(new Error(data.message || "assets.pak load failed"));
        }
      }
      function onBroadcast(event) {
        HandleAck(event.data);
      }
      channel.port1.onmessage = function (event) {
        HandleAck(event.data);
      };
      navigator.serviceWorker.addEventListener("message", onBroadcast);
      var controller = navigator.serviceWorker.controller;
      if (!controller) {
        Finish(new Error("No service worker controller for pak prefetch"));
        return;
      }
      controller.postMessage({ type: "bjs-pak-prefetch" }, [channel.port2]);
    });
  }

  function PrefetchPak() {
    SetOverlay("Downloading assets…", null);
    var lastProgressAt = Date.now();
    var stallError = null;
    var stallTimer = setInterval(function () {
      if (Date.now() - lastProgressAt > 30000) {
        stallError = new Error("assets.pak download stalled (no progress for 30s)");
      }
    }, 1000);

    return DownloadPakToCache(function (loaded, total) {
      if (stallError) {
        throw stallError;
      }
      lastProgressAt = Date.now();
      var ratio = total > 0 ? loaded / total : null;
      SetOverlay("Downloading assets…", ratio, { loaded: loaded, total: total });
    }).then(function () {
      clearInterval(stallTimer);
      if (stallError) {
        throw stallError;
      }
      SetOverlay("Preparing assets…", 1);
      return AskSwToOpenPak();
    }).catch(function (error) {
      clearInterval(stallTimer);
      console.error("[bjs] Pak prefetch failed", error);
      SetOverlay("Download failed — reload to retry", null);
      throw error;
    });
  }

  if (!("serviceWorker" in navigator)) {
    console.error("[bjs] Encrypted builds require a service worker (serve over http/https, not file://)");
    SetOverlay("Service worker unavailable", null);
    return;
  }

  SetOverlay("Preparing…", null);
  navigator.serviceWorker.register(SW_URL).then(function (registration) {
    // Always check for a newer pak-sw.js (republish) before booting the app.
    return registration.update().then(function () {
      var pending = registration.installing || registration.waiting;
      if (pending) {
        pending.postMessage({ type: "SKIP_WAITING" });
      }
      return WaitForWorker(pending);
    }).then(function () {
      return navigator.serviceWorker.ready;
    }).then(function () {
      if (navigator.serviceWorker.controller) {
        sessionStorage.removeItem(RELOAD_KEY);
        return PrefetchPak().then(Boot);
      }
      if (!sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, "1");
        location.reload();
        return;
      }
      sessionStorage.removeItem(RELOAD_KEY);
      return EnsureControlled().then(function () {
        return PrefetchPak().then(Boot);
      });
    });
  }).catch(function (error) {
    console.error("[bjs] Failed to register pak service worker", error);
    SetOverlay("Failed to prepare assets", null);
  });
})();
</script>`;

  html = html.replace(replaceTarget, bootstrap);
  fs.writeFileSync(indexPath, html, "utf8");
}

/**
 * Re-emit pak-sw.js + index bootstrap for an existing encrypted publish folder
 * without re-packing assets.pak (keeps the current AES key).
 */
export function RefreshEncryptedBootstrap(destination: string, keyBase64: string): void
{
  fs.writeFileSync(
    path.join(destination, "pak-sw.js"),
    BuildServiceWorkerSource(keyBase64),
    "utf8",
  );
  RewriteIndexForPak(destination, keyBase64);
  WriteWebServer(destination);
}

/**
 * Guard used by the API to reject destination paths that would write into the
 * monorepo's source tree by accident. Destination may be anywhere outside
 * game/src and the Project Control Panel itself; writing into game/dist is
 * fine but the UI defaults to an external folder.
 */
export function AssertSafeDestination(appName: string, destination: string): void
{
  const resolved = path.resolve(destination);
  const appSrc = path.join(GameDir(), "src");
  const controlPanelRoot = path.join(KIT_REPO_ROOT, "tools", "project-control-panel");

  if (IsPathInside(resolved, appSrc) || resolved === appSrc)
  {
    throw new Error("destination must not be inside the app src tree");
  }
  if (IsPathInside(resolved, controlPanelRoot) || resolved === controlPanelRoot)
  {
    throw new Error("destination must not be inside the Project Control Panel tree");
  }
}
