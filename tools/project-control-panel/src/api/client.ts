export interface ProjectPublishSettings
{
  platform: "web" | "tauri";
  title: string;
  version: string;
  destination: string;
  levels: string[];
  encryptAssets: boolean;
  includeServer: boolean;
}

export interface ProjectSummary
{
  name: string;
  title: string;
  entryLevel?: string;
  defaultLevel?: string;
  devPort: number;
  blenderExportPath: string;
  publish?: ProjectPublishSettings;
  hasManifest: boolean;
  hasLevels: boolean;
}

export interface DevServerStatus
{
  app: string;
  port: number;
  running: boolean;
  /** The listener on `port` answers requests for this project's app shell. */
  healthy: boolean;
  pid?: number;
  url?: string;
  managed?: boolean;
  error?: string;
}

export interface McpStatus
{
  /** False only when the kit installation has no bjs-mcp build. */
  available: boolean;
  /** True only in the kit checkout, where MCP sources can be rebuilt. */
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

export interface ServicesStatus
{
  dev: DevServerStatus;
  mcp: McpStatus;
}

export interface DocsStatus
{
  /** False only when the kit installation has no versioned documentation. */
  available: boolean;
  built: boolean;
  indexPath: string;
  url: string;
}

export interface LevelManifestEntry
{
  level: string;
  file: string;
  url: string;
}

export interface ReferencedAsset
{
  reference: string;
  workspaceFolder: string | null;
  workspaceFile: string | null;
  sourceAvailable: boolean;
  deployedAvailable: boolean;
}

export interface PublishOptions
{
  platform: "web" | "tauri";
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

async function Request<T>(url: string, init?: RequestInit): Promise<T>
{
  const response = await fetch(url, init);
  if (!response.ok)
  {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  getCurrentProject: () => Request<ProjectSummary>("/api/project"),
  createProject: (body: { name: string; title?: string; level?: string }) =>
    Request<{ name: string; path: string }>("/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  setEntryLevel: (manifestUrl: string) =>
    Request<ProjectSummary>("/api/project/entry-level", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manifestUrl }),
    }),
  setPublishSettings: (settings: ProjectPublishSettings) =>
    Request<ProjectSummary>("/api/project/publish", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }),
  getLevels: (app: string) => Request<string[]>(`/api/projects/${encodeURIComponent(app)}/levels`),
  getLevelManifests: (app: string) =>
    Request<LevelManifestEntry[]>(`/api/projects/${encodeURIComponent(app)}/manifests`),
  listAssets: (app: string, level: string, folder?: string) =>
  {
    const query = folder ? `?folder=${encodeURIComponent(folder)}` : "";
    return Request<string[] | Record<string, string[]>>(
      `/api/projects/${encodeURIComponent(app)}/assets/${encodeURIComponent(level)}${query}`,
    );
  },
  ListReferencedAssets: (app: string, level: string) =>
    Request<ReferencedAsset[]>(
      `/api/projects/${encodeURIComponent(app)}/assets/${encodeURIComponent(level)}/references`,
    ),
  ReloadReferencedAsset: (app: string, level: string, reference: string) =>
    Request<ReferencedAsset>(
      `/api/projects/${encodeURIComponent(app)}/assets/${encodeURIComponent(level)}/reload`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      },
    ),
  getDevStatus: (app: string) =>
    Request<DevServerStatus>(`/api/dev/${encodeURIComponent(app)}`),
  startDev: (app: string) =>
    Request<DevServerStatus>(`/api/dev/${encodeURIComponent(app)}/start`, { method: "POST" }),
  stopDev: (app: string) =>
    Request<DevServerStatus>(`/api/dev/${encodeURIComponent(app)}/stop`, { method: "POST" }),
  getMcpStatus: () => Request<McpStatus>("/api/mcp"),
  buildMcp: () => Request<McpStatus>("/api/mcp/build", { method: "POST" }),
  startMcp: () => Request<McpStatus>("/api/mcp/start", { method: "POST" }),
  stopMcp: () => Request<McpStatus>("/api/mcp/stop", { method: "POST" }),
  getServices: (app: string) =>
    Request<ServicesStatus>(`/api/services/${encodeURIComponent(app)}`),
  startAllServices: (app: string) =>
    Request<ServicesStatus>(`/api/services/${encodeURIComponent(app)}/start-all`, { method: "POST" }),
  stopAllServices: (app: string) =>
    Request<ServicesStatus>(`/api/services/${encodeURIComponent(app)}/stop-all`, { method: "POST" }),
  getDocsStatus: () => Request<DocsStatus>("/api/docs"),
  getPublishStatus: (app: string) =>
    Request<PublishStatus>(`/api/publish/${encodeURIComponent(app)}`),
  startPublish: (app: string, body: PublishOptions) =>
    Request<PublishStatus>(`/api/publish/${encodeURIComponent(app)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  cancelPublish: (app: string) =>
    Request<PublishStatus>(`/api/publish/${encodeURIComponent(app)}/cancel`, {
      method: "POST",
    }),
};
