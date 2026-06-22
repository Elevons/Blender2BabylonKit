import { useCallback, useEffect, useState } from "react";

import { api, type ServicesStatus } from "../api/client";

interface Props
{
  project: string;
  onError: (message: string) => void;
}

function StatusDot({ on }: { on: boolean }): JSX.Element
{
  return (
    <span
      className={on ? "status-dot status-dot-on" : "status-dot status-dot-off"}
      title={on ? "Running" : "Stopped"}
    />
  );
}

export function ServicesPanel({ project, onError }: Props): JSX.Element
{
  const [services, setServices] = useState<ServicesStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () =>
  {
    if (!project) { return; }
    const next = await api.getServices(project);
    setServices(next);
  }, [project]);

  useEffect(() =>
  {
    refresh().catch((e: Error) => onError(e.message));
    const timer = setInterval(() =>
    {
      refresh().catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [refresh, onError]);

  async function Run(action: () => Promise<unknown>): Promise<void>
  {
    setBusy(true);
    try
    {
      await action();
      await refresh();
    }
    catch (e)
    {
      onError((e as Error).message);
    }
    finally
    {
      setBusy(false);
    }
  }

  async function CopyCursorConfig(): Promise<void>
  {
    if (!services?.mcp) { return; }
    await navigator.clipboard.writeText(JSON.stringify(services.mcp.cursorConfig, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const dev = services?.dev;
  const mcp = services?.mcp;

  return (
    <section className="panel">
      <h2>Services</h2>
      <div className="services-grid">
        <div className="service-card">
          <div className="service-header">
            <StatusDot on={Boolean(dev?.running)} />
            <strong>Game Dev Server (Vite)</strong>
          </div>
          <p className="muted">
            {dev?.running
              ? `Running on port ${dev.port}${dev.pid ? ` (pid ${dev.pid})` : ""}`
              : `Stopped · port ${dev?.port ?? 5173}`}
          </p>
          <div className="row">
            <button
              type="button"
              disabled={busy || !project}
              onClick={() => { Run(() => api.startDev(project)); }}
            >
              Start
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy || !dev?.running}
              onClick={() => { Run(() => api.stopDev(project)); }}
            >
              Stop
            </button>
            {dev?.url && (
              <a href={dev.url} target="_blank" rel="noreferrer">
                Open Runtime Preview
              </a>
            )}
          </div>
        </div>

        <div className="service-card">
          <div className="service-header">
            <StatusDot on={Boolean(mcp?.running)} />
            <strong>bjs-mcp (Behavior Authoring)</strong>
          </div>
          <p className="muted">
            {!mcp?.built && "Not built · "}
            {mcp?.running
              ? `Running${mcp.pid ? ` (pid ${mcp.pid})` : ""}`
              : mcp?.built ? "Built, not running" : "Run Build first"}
          </p>
          <p className="muted" style={{ fontSize: "0.8rem" }}>
            Cursor connects via stdio — paste the copied config into ~/.cursor/mcp.json
          </p>
          <div className="row">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => { Run(() => api.buildMcp()); }}
            >
              Build
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { Run(() => api.startMcp()); }}
            >
              Start
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy || !mcp?.running}
              onClick={() => { Run(() => api.stopMcp()); }}
            >
              Stop
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!mcp?.built}
              onClick={() => { CopyCursorConfig().catch((e: Error) => onError(e.message)); }}
            >
              {copied ? "Copied!" : "Copy Cursor Config"}
            </button>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: "1rem" }}>
        <button
          type="button"
          disabled={busy || !project}
          onClick={() => { Run(() => api.startAllServices(project)); }}
        >
          Start All Services
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || !project}
          onClick={() => { Run(() => api.stopAllServices(project)); }}
        >
          Stop All Services
        </button>
      </div>
    </section>
  );
}
