import { useCallback, useEffect, useState } from "react";

import {
  api,
  type ArtifactInfo,
  type ProjectSummary,
  type PublishJobStatus,
} from "../api/client";

interface Props
{
  project: ProjectSummary;
  onError: (message: string) => void;
  onSaved?: () => void;
}

interface TargetPreset
{
  id: string;
  label: string;
  targets: string;
}

interface PublishFormState
{
  productName: string;
  identifier: string;
  version: string;
  webBase: string;
  outputDir: string;
  targetsPreset: string;
  iconPath: string;
}

function FormatBytes(byteCount: number): string
{
  if (byteCount < 1024)
  {
    return `${byteCount} B`;
  }
  if (byteCount < 1024 * 1024)
  {
    return `${(byteCount / 1024).toFixed(1)} KB`;
  }
  return `${(byteCount / (1024 * 1024)).toFixed(1)} MB`;
}

function FormatAge(iso: string): string
{
  const deltaMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1)
  {
    return "just now";
  }
  if (minutes < 60)
  {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48)
  {
    return `${hours}h ago`;
  }
  return new Date(iso).toLocaleDateString();
}

function FormFromProject(project: ProjectSummary): PublishFormState
{
  return {
    productName: project.productName ?? project.title,
    identifier: project.identifier ?? `com.bjs.${project.name}`,
    version: project.publishVersion ?? "0.1.0",
    webBase: project.webBase ?? "/",
    outputDir: project.outputDir ?? "release",
    targetsPreset: project.desktopTargetsPreset ?? "all",
    iconPath: project.icon ?? "",
  };
}

export function PublishPanel({ project, onError, onSaved }: Props): JSX.Element
{
  const [status, setStatus] = useState<PublishJobStatus | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [presets, setPresets] = useState<TargetPreset[]>([]);
  const [form, setForm] = useState<PublishFormState>(() => FormFromProject(project));
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () =>
  {
    const [nextStatus, nextArtifacts] = await Promise.all([
      api.getPublishStatus(),
      api.getArtifacts(),
    ]);
    setStatus(nextStatus);
    setArtifacts(nextArtifacts);
  }, []);

  useEffect(() =>
  {
    refresh().catch((error: Error) => onError(error.message));
    api.getDesktopTargetPresets()
      .then(setPresets)
      .catch((error: Error) => onError(error.message));
  }, [refresh, onError]);

  useEffect(() =>
  {
    setForm(FormFromProject(project));
  }, [project]);

  useEffect(() =>
  {
    if (!status?.running)
    {
      return;
    }
    const timer = setInterval(() =>
    {
      refresh().catch(() => undefined);
    }, 1000);
    return () => clearInterval(timer);
  }, [status?.running, refresh]);

  function PatchForm(patch: Partial<PublishFormState>): void
  {
    setForm((previous) => ({ ...previous, ...patch }));
  }

  function BuildUpdateBody(): Parameters<typeof api.updatePublish>[0]
  {
    return {
      productName: form.productName,
      identifier: form.identifier,
      version: form.version,
      icon: form.iconPath,
      outputDir: form.outputDir,
      webBase: form.webBase,
      desktopTargetsPreset: form.targetsPreset,
    };
  }

  async function SavePublishSettings(): Promise<void>
  {
    setSaving(true);
    try
    {
      await api.updatePublish(BuildUpdateBody());
      onSaved?.();
    }
    catch (error)
    {
      onError((error as Error).message);
    }
    finally
    {
      setSaving(false);
    }
  }

  async function ApplyIcon(): Promise<void>
  {
    setBusy(true);
    try
    {
      await api.updatePublish(BuildUpdateBody());
      const result = await api.applyIcon();
      if (!result.ok)
      {
        onError(result.log || "Icon generation failed");
      }
      onSaved?.();
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

  async function Start(target: "web" | "desktop" | "android"): Promise<void>
  {
    setBusy(true);
    try
    {
      await api.updatePublish(BuildUpdateBody());
      const next = await api.startPublish(target);
      setStatus(next);
      onSaved?.();
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

  const jobRunning = Boolean(status?.running) || busy;
  const selectedPreset = presets.find((preset) => preset.id === form.targetsPreset);
  const targetsLabel = selectedPreset?.targets
    ?? project.desktopTargets
    ?? "all";
  const releasePath = form.outputDir.startsWith("/")
    ? form.outputDir
    : `apps/${project.name}/${form.outputDir}/`;

  return (
    <section className="panel panel-compact">
      <div className="panel-head">
        <h2>Publish</h2>
        <span className="muted panel-meta">
          {form.productName || project.title} v{form.version} → <code>{releasePath}</code>
        </span>
      </div>

      <div className="publish-cards">
        <div className="service-card">
          <div className="service-top">
            <strong>Web</strong>
            <span className="muted service-meta">base: {form.webBase}</span>
          </div>
          <div className="service-actions">
            <button type="button" disabled={jobRunning} onClick={() => { void Start("web"); }}>
              Build
            </button>
          </div>
        </div>

        <div className="service-card">
          <div className="service-top">
            <strong>Desktop</strong>
            <span className="muted service-meta">
              {project.hasTauri ? `Tauri · ${targetsLabel}` : "Tauri: not init"}
            </span>
          </div>
          <div className="service-actions">
            <button type="button" disabled={jobRunning || !project.hasTauri} onClick={() => { void Start("desktop"); }}>
              Build
            </button>
          </div>
        </div>

        <div className="service-card">
          <div className="service-top">
            <strong>Android</strong>
            <span className="muted service-meta">
              {project.hasAndroid ? "ready" : "not init"}
            </span>
          </div>
          <div className="service-actions">
            <button type="button" disabled={jobRunning || !project.hasTauri} onClick={() => { void Start("android"); }}>
              Build
            </button>
          </div>
        </div>
      </div>

      <details className="publish-details">
        <summary>
          Settings — {form.identifier || "no bundle ID"} · targets: {targetsLabel}
          {form.iconPath ? "" : " · no icon"}
        </summary>
        <div className="publish-settings">
        <div className="publish-grid">
          <label className="publish-field">
            <span>App name</span>
            <input
              type="text"
              value={form.productName}
              onChange={(event) => PatchForm({ productName: event.target.value })}
              aria-label="App name"
            />
            <span className="muted publish-hint">Window title and installer product name</span>
          </label>

          <label className="publish-field">
            <span>Version</span>
            <input
              type="text"
              value={form.version}
              onChange={(event) => PatchForm({ version: event.target.value })}
              aria-label="Version"
            />
          </label>

          <label className="publish-field">
            <span>Bundle ID</span>
            <input
              type="text"
              value={form.identifier}
              onChange={(event) => PatchForm({ identifier: event.target.value })}
              placeholder="com.bjs.mygame"
              aria-label="Bundle identifier"
            />
            <span className="muted publish-hint">Reverse-DNS, e.g. com.studio.game</span>
          </label>

          <label className="publish-field">
            <span>Web base path</span>
            <input
              type="text"
              value={form.webBase}
              onChange={(event) => PatchForm({ webBase: event.target.value })}
              placeholder="/"
              aria-label="Web base path"
            />
            <span className="muted publish-hint">Use /demo/ for subdirectory hosting</span>
          </label>

          <label className="publish-field">
            <span>Output folder</span>
            <input
              type="text"
              value={form.outputDir}
              onChange={(event) => PatchForm({ outputDir: event.target.value })}
              placeholder="release"
              aria-label="Output folder"
            />
            <span className="muted publish-hint">
              Relative to the app, or an absolute path. Artifacts land here.
            </span>
          </label>

          <label className="publish-field">
            <span>Desktop targets</span>
            <select
              value={form.targetsPreset}
              onChange={(event) => PatchForm({ targetsPreset: event.target.value })}
              aria-label="Desktop targets"
            >
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
            </select>
            <span className="muted publish-hint">
              Formats: <code>{targetsLabel}</code>
              {" · "}only formats for the OS you build on actually succeed
            </span>
          </label>
        </div>

        <label className="publish-field">
          <span>App icon (PNG)</span>
          <div className="publish-icon-row">
            <input
              type="text"
              value={form.iconPath}
              onChange={(event) => PatchForm({ iconPath: event.target.value })}
              placeholder="icon.png (1024×1024 square)"
              aria-label="App icon path"
            />
            <button
              type="button"
              className="secondary"
              disabled={busy || saving || !project.hasTauri}
              onClick={() => { void ApplyIcon(); }}
            >
              Apply icon
            </button>
          </div>
          <span className="muted publish-hint">
            Path relative to the app folder. Square PNG — prefer 1024×1024.
          </span>
        </label>

        <div className="panel-actions">
          <button type="button" disabled={saving || busy} onClick={() => { void SavePublishSettings(); }}>
            Save settings
          </button>
        </div>
        </div>
      </details>

      {status && status.logLines.length > 0 && (
        <pre className="publish-log">
          {status.logLines.join("\n")}
        </pre>
      )}

      {!status?.running && status?.exitCode !== null && status?.exitCode !== undefined && (
        <p className={status.exitCode === 0 ? "muted" : "status-warn"}>
          Last job exit code: {status.exitCode}
        </p>
      )}

      <div className="panel-head" style={{ marginTop: "0.75rem" }}>
        <h3>Artifacts</h3>
        <span className="muted panel-meta"><code>{releasePath}</code></span>
      </div>
      {artifacts.length === 0 ? (
        <p className="muted">No artifacts yet</p>
      ) : (
        <ul className="asset-list">
          {artifacts.map((artifact) => (
            <li key={artifact.fileName}>
              {artifact.fileName}{" "}
              <span className="muted">
                {artifact.fileName.endsWith("/")
                  ? `folder · ${FormatAge(artifact.modifiedAt)}`
                  : `${FormatBytes(artifact.sizeBytes)} · ${FormatAge(artifact.modifiedAt)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
