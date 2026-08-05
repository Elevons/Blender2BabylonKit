import { useCallback, useEffect, useState } from "react";

import {
  api,
  type DevServerStatus,
  type LevelManifestEntry,
  type ServicesStatus,
} from "../api/client";

interface Props
{
  project: string;
  entryLevel?: string;
  onLevelChange: (level: string) => void;
  onEntryLevelChange: (manifestUrl: string) => Promise<void>;
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
  if (dev.running && !dev.healthy)
  {
    return `port ${dev.port} busy · not this project`;
  }
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

/**
 * Find the configured entry manifest. A level folder can contain multiple
 * manifests, so prefer the manifest whose filename matches the folder name.
 */
function ResolveEntryManifest(
  manifests: LevelManifestEntry[],
  entryLevel: string | undefined,
): LevelManifestEntry | undefined
{
  if (entryLevel === undefined || entryLevel.length === 0)
  {
    return undefined;
  }

  const exactUrl = manifests.find((entry) => entry.url === entryLevel);
  if (exactUrl !== undefined)
  {
    return exactUrl;
  }

  const levelManifests = manifests.filter((entry) => entry.level === entryLevel);
  return levelManifests.find((entry) => entry.file === `${entryLevel}.scene.json`)
    ?? levelManifests[0];
}

export function ServicesPanel({
  project,
  entryLevel,
  onLevelChange,
  onEntryLevelChange,
  onError,
}: Props): JSX.Element
{
  const [services, setServices] = useState<ServicesStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manifests, setManifests] = useState<LevelManifestEntry[]>([]);
  const [jumpManifest, setJumpManifest] = useState("");
  const [savingEntryLevel, setSavingEntryLevel] = useState(false);

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

  useEffect(() =>
  {
    if (!project)
    {
      setManifests([]);
      setJumpManifest("");
      return;
    }
    api.getLevelManifests(project).then((list) =>
    {
      setManifests(list);
      const initialManifest = ResolveEntryManifest(list, entryLevel) ?? list[0];
      if (initialManifest !== undefined)
      {
        setJumpManifest(initialManifest.url);
        onLevelChange(initialManifest.level);
      }
      else
      {
        setJumpManifest("");
      }
    }).catch((e: Error) => onError(e.message));
  }, [project, entryLevel, onLevelChange, onError]);

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
  const entryManifest = ResolveEntryManifest(manifests, entryLevel);
  const previewUrl = dev?.url !== undefined && entryManifest !== undefined
    ? `${dev.url}?manifest=${encodeURIComponent(entryManifest.url)}`
    : dev?.url;

  function OpenLevelJump(): void
  {
    if (!dev?.url || !jumpManifest)
    {
      return;
    }
    const url = new URL(dev.url);
    url.searchParams.set("manifest", jumpManifest);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }

  /** Persist the selected manifest as the shared project entry level. */
  async function SetSelectedAsEntry(): Promise<void>
  {
    if (jumpManifest.length === 0)
    {
      return;
    }

    setSavingEntryLevel(true);
    try
    {
      await onEntryLevelChange(jumpManifest);
    }
    catch (error)
    {
      onError((error as Error).message);
    }
    finally
    {
      setSavingEntryLevel(false);
    }
  }

  return (
    <section className="panel panel-compact">
      <div className="panel-head">
        <h2>Services</h2>
        <div className="panel-actions">
          <button
            type="button"
            disabled={busy || !project}
            onClick={() => { Run(() => api.startAllServices(project)); }}
          >
            Start All
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || !project}
            onClick={() => { Run(() => api.stopAllServices(project)); }}
          >
            Stop All
          </button>
        </div>
      </div>

      <div className="services-grid">
        <div className="service-card">
          <div className="service-top">
            <div className="service-title">
              <StatusDot on={Boolean(dev?.healthy)} />
              <strong>Vite Dev Server</strong>
            </div>
            <span className="muted service-meta">{DevStatusText(dev)}</span>
          </div>
          <div className="service-actions">
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
            {previewUrl !== undefined && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                title={
                  entryManifest !== undefined
                    ? `Launch ${entryManifest.level} / ${entryManifest.file}`
                    : "Launch the application"
                }
              >
                Preview
              </a>
            )}
          </div>
          {manifests.length > 0 && (
            <div className="service-jump">
              <select
                value={jumpManifest}
                onChange={(event) =>
                {
                  const manifestUrl = event.target.value;
                  const manifest = manifests.find((entry) => entry.url === manifestUrl);
                  setJumpManifest(manifestUrl);
                  if (manifest !== undefined)
                  {
                    onLevelChange(manifest.level);
                  }
                }}
                aria-label="Level to open"
              >
                {manifests.map((entry) => (
                  <option key={entry.url} value={entry.url}>
                    {entry.level} / {entry.file}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="secondary"
                disabled={
                  jumpManifest.length === 0
                  || jumpManifest === entryLevel
                  || savingEntryLevel
                }
                onClick={() => { void SetSelectedAsEntry(); }}
              >
                {jumpManifest === entryLevel ? "Entry Level" : "Set as Entry"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={!dev?.healthy || !jumpManifest}
                onClick={OpenLevelJump}
              >
                Open Level
              </button>
            </div>
          )}
        </div>

        {mcp?.available !== false && (
          <div className="service-card">
            <div className="service-top">
              <div className="service-title">
                <StatusDot on={Boolean(mcp?.running)} />
                <strong>bjs-mcp</strong>
              </div>
              <span className="muted service-meta">{McpStatusText(mcp)}</span>
            </div>
            <div className="service-actions">
              {mcp?.buildable && (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => { Run(() => api.buildMcp()); }}
                >
                  Build
                </button>
              )}
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
                {copied ? "Copied" : "Cursor Config"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
