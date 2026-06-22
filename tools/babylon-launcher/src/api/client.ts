export interface ProjectSummary
{
  name: string;
  title: string;
  defaultLevel?: string;
  devPort: number;
  blenderExportPath: string;
  hasLevels: boolean;
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

export interface DocsStatus
{
  built: boolean;
  indexPath: string;
  url: string;
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
  buildDocs: () => Request<DocsStatus>("/api/docs/build", { method: "POST" }),
};
