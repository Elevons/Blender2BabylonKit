import { useCallback, useEffect, useState } from "react";

import { api, type DevServerStatus, type ServicesStatus } from "../api/client";

interface Props
{
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

function DevStatusText(dev: ServicesStatus["dev"] | undefined): string
{
  if (!dev) { return "…"; }
  if (dev.running)
  {
    return `port ${dev.port}${dev.pid ? ` · pid ${dev.pid}` : ""}`;
  }
  return `stopped · port ${dev.port}`;
}

function McpStatusText(mcp: ServicesStatus["mcp"] | undefined): string
{
  if (!mcp) { return "…"; }
  if (mcp.running)
  {
    return `running${mcp.pid ? ` · pid ${mcp.pid}` : ""}`;
  }
  if (!mcp.built) { return "not built"; }
  return "built, stopped";
}

export function ServicesPanel({ onError }: Props): JSX.Element
{
  const [services, setServices] = useState<ServicesStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () =>
  {
    const next = await api.getServices();
    setServices(next);
  }, []);

  useEffect(() =>
  {
    refresh().catch((error: Error) => onError(error.message));
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
      const result = await action();
      await refresh();
      const devResult = result as { dev?: DevServerStatus } | DevServerStatus | undefined;
      const devError = devResult && "dev" in (devResult as object)
        ? (devResult as { dev?: DevServerStatus }).dev?.error
        : (devResult as DevServerStatus | undefined)?.error;
      if (devError)
      {
        onError(devError);
      }
    }
    catch (error)
    {
      onError((error as Error).message);
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
    <section className="panel panel-compact">
      <div className="panel-head">
        <h2>Services</h2>
        <div className="panel-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => { Run(() => api.startAllServices()); }}
          >
            Start All
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => { Run(() => api.stopAllServices()); }}
          >
            Stop All
          </button>
        </div>
      </div>

      <div className="services-grid">
        <div className="service-card">
          <div className="service-top">
            <div className="service-title">
              <StatusDot on={Boolean(dev?.running)} />
              <strong>Vite Dev Server</strong>
            </div>
            <span className="muted service-meta">{DevStatusText(dev)}</span>
          </div>
          <div className="service-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => { Run(() => api.startDev()); }}
            >
              Start
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy || !dev?.running}
              onClick={() => { Run(() => api.stopDev()); }}
            >
              Stop
            </button>
            {dev?.url && (
              <a href={dev.url} target="_blank" rel="noreferrer">
                Preview
              </a>
            )}
          </div>
        </div>

        <div className="service-card">
          <div className="service-top">
            <div className="service-title">
              <StatusDot on={Boolean(mcp?.running)} />
              <strong>bjs-mcp</strong>
            </div>
            <span className="muted service-meta">{McpStatusText(mcp)}</span>
          </div>
          <div className="service-actions">
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
              onClick={() => { CopyCursorConfig().catch((error: Error) => onError(error.message)); }}
            >
              {copied ? "Copied" : "Cursor Config"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
