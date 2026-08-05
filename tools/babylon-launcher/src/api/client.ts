export interface ProjectSummary
{
  name: string;
  title: string;
  defaultLevel?: string;
  devPort: number;
  blenderExportPath: string;
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
  manifest?: {
    levels?: {
      include?: string[];
      start?: string;
      startManifest?: string;
    };
    publish?: {
      productName?: string;
      identifier?: string;
      version?: string;
      icon?: string;
      outputDir?: string;
      web?: { base?: string };
      desktop?: {
        targetsPreset?: string;
        targets?: string | string[];
      };
    };
  };
}

export interface DevServerStatus
{
  app: string;
  port: number;
  running: boolean;
  pid?: number;
  url?: string;
  managed?: boolean;
  error?: string;
}

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

export interface ServicesStatus
{
  dev: DevServerStatus;
  mcp: McpStatus;
}

export interface DocsStatus
{
  built: boolean;
  indexPath: string;
  url: string;
}

export interface PublishJobStatus
{
  target: "web" | "desktop" | "android" | null;
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
  getProject: () => Request<ProjectSummary>("/api/project"),
  getLevels: () => Request<string[]>("/api/project/levels"),
  updateLevels: (body: { include: string[]; start: string; startManifest?: string }) =>
    Request<unknown>("/api/project/levels", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  getDesktopTargetPresets: () =>
    Request<Array<{ id: string; label: string; targets: string }>>("/api/project/publish/presets"),
  updatePublish: (body: {
    productName?: string;
    identifier?: string;
    version?: string;
    icon?: string;
    outputDir?: string;
    webBase?: string;
    desktopTargetsPreset?: string;
    desktopTargets?: string;
  }) =>
    Request<unknown>("/api/project/publish", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  applyIcon: () =>
    Request<{ ok: boolean; log: string }>("/api/project/publish/icon", { method: "POST" }),
  listAssets: (level: string, folder?: string) =>
  {
    const query = folder ? `?folder=${encodeURIComponent(folder)}` : "";
    return Request<string[] | Record<string, string[]>>(
      `/api/project/assets/${encodeURIComponent(level)}${query}`,
    );
  },
  getDevStatus: () => Request<DevServerStatus>("/api/dev"),
  startDev: () => Request<DevServerStatus>("/api/dev/start", { method: "POST" }),
  stopDev: () => Request<DevServerStatus>("/api/dev/stop", { method: "POST" }),
  getMcpStatus: () => Request<McpStatus>("/api/mcp"),
  buildMcp: () => Request<McpStatus>("/api/mcp/build", { method: "POST" }),
  startMcp: () => Request<McpStatus>("/api/mcp/start", { method: "POST" }),
  stopMcp: () => Request<McpStatus>("/api/mcp/stop", { method: "POST" }),
  getServices: () => Request<ServicesStatus>("/api/services"),
  startAllServices: () =>
    Request<ServicesStatus>("/api/services/start-all", { method: "POST" }),
  stopAllServices: () =>
    Request<ServicesStatus>("/api/services/stop-all", { method: "POST" }),
  getDocsStatus: () => Request<DocsStatus>("/api/docs"),
  buildDocs: () => Request<DocsStatus>("/api/docs/build", { method: "POST" }),
  startPublish: (target: "web" | "desktop" | "android") =>
    Request<PublishJobStatus>(`/api/project/publish/${target}`, { method: "POST" }),
  getPublishStatus: () => Request<PublishJobStatus>("/api/project/publish/status"),
  getArtifacts: () => Request<ArtifactInfo[]>("/api/project/publish/artifacts"),
};
