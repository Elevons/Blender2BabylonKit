export interface ProjectSummary
{
  name: string;
  title: string;
  defaultLevel?: string;
  devPort: number;
  blenderExportPath: string;
  hasLevels: boolean;
}

export interface EditorInfo
{
  id: string;
  name: string;
  folder: string;
}

export interface DevServerStatus
{
  app: string;
  port: number;
  running: boolean;
  pid?: number;
  url?: string;
  managed?: boolean;
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

export interface CompatibilityReport
{
  engineCore: string;
  editors: Array<{ editorId: string; name: string; version: string }>;
  aligned: boolean;
  warnings: string[];
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
  getProjects: () => Request<ProjectSummary[]>("/api/projects"),
  getLevels: (app: string) => Request<string[]>(`/api/projects/${encodeURIComponent(app)}/levels`),
  createProject: (body: {
    name: string;
    title?: string;
    level?: string;
    template?: "empty" | "minimal" | "sample";
  }) => Request<{ name: string; path: string; blenderExportPath: string }>("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  listAssets: (app: string, level: string, folder?: string) =>
  {
    const query = folder ? `?folder=${encodeURIComponent(folder)}` : "";
    return Request<string[] | Record<string, string[]>>(
      `/api/projects/${encodeURIComponent(app)}/assets/${encodeURIComponent(level)}${query}`,
    );
  },
  readAsset: (app: string, level: string, folder: string, file: string) =>
    Request<string>(
      `/api/projects/${encodeURIComponent(app)}/assets/${encodeURIComponent(level)}/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`,
    ).then(async () =>
    {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(app)}/assets/${encodeURIComponent(level)}/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`,
      );
      return response.text();
    }),
  writeAsset: (app: string, level: string, folder: string, file: string, content: string) =>
    Request<{ path: string; relative: string }>(
      `/api/projects/${encodeURIComponent(app)}/assets/${encodeURIComponent(level)}/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: content,
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
  getEditors: () => Request<{ editors: EditorInfo[] }>("/api/editors"),
  getEditorVersions: () =>
    Request<{ compatibility: CompatibilityReport; packages: CompatibilityReport["editors"] }>(
      "/api/editors/versions",
    ),
  updateEditors: (target?: string) =>
    Request<{ ok: boolean; compatibility: CompatibilityReport }>("/api/editors/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    }),
};

export function EditorUrl(
  editorId: string,
  project: string,
  level: string,
  file?: string,
): string
{
  const params = new URLSearchParams({ project, level });
  if (file)
  {
    params.set("file", file);
  }
  return `/editors/${editorId}?${params.toString()}`;
}

export function LauncherDeepLink(
  editorId: string,
  project: string,
  level: string,
  file?: string,
): string
{
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3200";
  return `${origin}${EditorUrl(editorId, project, level, file)}`;
}
