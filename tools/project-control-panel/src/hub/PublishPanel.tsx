import { useEffect, useMemo, useRef, useState } from "react";

import {
  api,
  type LevelManifestEntry,
  type ProjectPublishSettings,
  type ProjectSummary,
  type PublishOptions,
  type PublishStatus,
} from "../api/client";

interface Props
{
  project: string;
  entryLevel?: string;
  savedPublish?: ProjectPublishSettings;
  onEntryLevelChange: (manifestUrl: string) => Promise<void>;
  onPublishSettingsChange?: (project: ProjectSummary) => void;
  onError: (message: string) => void;
}

/** How close to the bottom counts as "following" the live log. */
const LOG_FOLLOW_THRESHOLD_PX = 24;

/** Debounce writes to b2bkit-project.json while the form is edited. */
const PUBLISH_SETTINGS_SAVE_MS = 400;

function BuildPublishSettingsSnapshot(
  platform: "web" | "tauri",
  title: string,
  version: string,
  destination: string,
  includedLevelsKey: string,
  encryptAssets: boolean,
  includeServer: boolean,
): ProjectPublishSettings
{
  return {
    platform,
    title,
    version,
    destination,
    levels: includedLevelsKey.length > 0 ? includedLevelsKey.split("\0") : [],
    encryptAssets,
    includeServer,
  };
}

function PublishSettingsKey(settings: ProjectPublishSettings): string
{
  return JSON.stringify(settings);
}

/** Convert publish phases into a stable progress percentage. */
function GetPublishProgress(status: PublishStatus): number
{
  if (status.progress !== undefined)
  {
    return status.progress;
  }

  switch (status.phase)
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

function IsRunningPublishPhase(phase: PublishStatus["phase"]): boolean
{
  return phase === "building"
    || phase === "filtering"
    || phase === "copying"
    || phase === "encrypting";
}

/**
 * Publish tab: pick platform, levels, start level, destination, and build a
 * ready-to-host web bundle (optional encrypted asset pack).
 */
export function PublishPanel({
  project,
  entryLevel,
  savedPublish,
  onEntryLevelChange,
  onPublishSettingsChange,
  onError,
}: Props): JSX.Element
{
  const [manifests, setManifests] = useState<LevelManifestEntry[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [includedLevels, setIncludedLevels] = useState<Set<string>>(new Set());
  const [startLevel, setStartLevel] = useState("");
  const [platform, setPlatform] = useState<"web" | "tauri">("web");
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [destination, setDestination] = useState("");
  const [encryptAssets, setEncryptAssets] = useState(false);
  const [includeServer, setIncludeServer] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const logElementRef = useRef<HTMLPreElement | null>(null);
  const followLogRef = useRef(true);
  const savedPublishRef = useRef(savedPublish);
  const entryLevelRef = useRef(entryLevel);
  const onErrorRef = useRef(onError);
  const onPublishSettingsChangeRef = useRef(onPublishSettingsChange);
  const lastSavedKeyRef = useRef("");
  const pendingSettingsRef = useRef<ProjectPublishSettings | null>(null);

  savedPublishRef.current = savedPublish;
  entryLevelRef.current = entryLevel;
  onErrorRef.current = onError;
  onPublishSettingsChangeRef.current = onPublishSettingsChange;

  const availableLevels = useMemo(
    () => [...new Set(manifests.map((entry) => entry.level))].sort((a, b) => a.localeCompare(b)),
    [manifests],
  );

  const startLevelChoices = useMemo(
    () => manifests.filter((entry) => includedLevels.has(entry.level)),
    [manifests, includedLevels],
  );

  const includedLevelsKey = useMemo(
    () => [...includedLevels].sort((a, b) => a.localeCompare(b)).join("\0"),
    [includedLevels],
  );

  function PersistPublishSettings(settings: ProjectPublishSettings): void
  {
    const settingsKey = PublishSettingsKey(settings);
    if (settingsKey === lastSavedKeyRef.current)
    {
      return;
    }

    lastSavedKeyRef.current = settingsKey;
    api.setPublishSettings(settings)
      .then((nextProject) =>
      {
        onPublishSettingsChangeRef.current?.(nextProject);
      })
      .catch((error: Error) => onErrorRef.current(error.message));
  }

  // Seed the form from b2bkit-project.json once per mount / project switch.
  useEffect(() =>
  {
    let cancelled = false;

    async function LoadManifests(): Promise<void>
    {
      if (!project)
      {
        setManifests([]);
        setLevels([]);
        setSettingsReady(false);
        pendingSettingsRef.current = null;
        return;
      }

      setSettingsReady(false);
      try
      {
        const [manifestList, levelList] = await Promise.all([
          api.getLevelManifests(project),
          api.getLevels(project),
        ]);
        if (cancelled)
        {
          return;
        }

        const saved = savedPublishRef.current;
        const configuredEntryLevel = entryLevelRef.current;

        setManifests(manifestList);
        setLevels(levelList);

        const savedLevels = (saved?.levels ?? [])
          .filter((level) => levelList.includes(level));
        const nextIncluded = savedLevels.length > 0 ? savedLevels : levelList;
        const nextIncludedKey = [...nextIncluded]
          .sort((a, b) => a.localeCompare(b))
          .join("\0");
        const nextPlatform = saved?.platform === "tauri" ? "tauri" : "web";
        const nextTitle = saved?.title ?? "";
        const nextVersion = saved?.version !== undefined && saved.version.length > 0
          ? saved.version
          : "1.0.0";
        const nextDestination = saved?.destination ?? "";
        const nextEncryptAssets = saved?.encryptAssets === true;
        const nextIncludeServer = saved?.includeServer === true;

        setIncludedLevels(new Set(nextIncluded));
        setPlatform(nextPlatform);
        setTitle(nextTitle);
        setVersion(nextVersion);
        setDestination(nextDestination);
        setEncryptAssets(nextEncryptAssets);
        setIncludeServer(nextIncludeServer);

        const preferredStart = configuredEntryLevel !== undefined
          && manifestList.some((entry) => entry.url === configuredEntryLevel)
          ? configuredEntryLevel
          : manifestList[0]?.url ?? "";
        setStartLevel(preferredStart);

        const seeded = BuildPublishSettingsSnapshot(
          nextPlatform,
          nextTitle,
          nextVersion,
          nextDestination,
          nextIncludedKey,
          nextEncryptAssets,
          nextIncludeServer,
        );
        pendingSettingsRef.current = seeded;
        lastSavedKeyRef.current = saved !== undefined
          ? PublishSettingsKey(seeded)
          : "";
        setSettingsReady(true);
      }
      catch (error)
      {
        if (!cancelled)
        {
          onErrorRef.current((error as Error).message);
        }
      }
    }

    void LoadManifests();
    return () =>
    {
      cancelled = true;
    };
  }, [project]);

  // Persist form values into b2bkit-project.json (entry level is saved separately).
  useEffect(() =>
  {
    if (!project || !settingsReady)
    {
      return;
    }

    const settings = BuildPublishSettingsSnapshot(
      platform,
      title,
      version,
      destination,
      includedLevelsKey,
      encryptAssets,
      includeServer,
    );
    pendingSettingsRef.current = settings;

    const timer = setTimeout(() =>
    {
      PersistPublishSettings(settings);
    }, PUBLISH_SETTINGS_SAVE_MS);

    return () =>
    {
      clearTimeout(timer);
    };
  }, [
    project,
    settingsReady,
    platform,
    title,
    version,
    destination,
    includedLevelsKey,
    encryptAssets,
    includeServer,
  ]);

  // Flush the latest form values if the tab unmounts before debounce fires.
  useEffect(() =>
  {
    return () =>
    {
      if (!project || pendingSettingsRef.current === null)
      {
        return;
      }

      PersistPublishSettings(pendingSettingsRef.current);
    };
  }, [project]);

  // Follow new output, but leave the view alone once the user scrolls up.
  useEffect(() =>
  {
    const logElement = logElementRef.current;
    if (logElement === null || !followLogRef.current)
    {
      return;
    }

    logElement.scrollTop = logElement.scrollHeight;
  }, [status?.log.length]);

  function HandleLogScroll(): void
  {
    const logElement = logElementRef.current;
    if (logElement === null)
    {
      return;
    }

    const distanceFromBottom = logElement.scrollHeight
      - logElement.scrollTop
      - logElement.clientHeight;
    followLogRef.current = distanceFromBottom <= LOG_FOLLOW_THRESHOLD_PX;
  }

  useEffect(() =>
  {
    if (
      entryLevel !== undefined
      && manifests.some((entry) => entry.url === entryLevel)
    )
    {
      setStartLevel(entryLevel);
    }
  }, [entryLevel, manifests]);

  useEffect(() =>
  {
    if (!project)
    {
      return;
    }

    let cancelled = false;

    async function Poll(): Promise<void>
    {
      try
      {
        const next = await api.getPublishStatus(project);
        if (!cancelled)
        {
          setStatus(next);
          setBusy(IsRunningPublishPhase(next.phase));
        }
      }
      catch
      {
        /* ignore transient poll errors */
      }
    }

    void Poll();
    const timer = setInterval(() => { void Poll(); }, 1000);
    return () =>
    {
      cancelled = true;
      clearInterval(timer);
    };
  }, [project]);

  // Keep startLevel valid when included levels change.
  useEffect(() =>
  {
    if (startLevelChoices.length === 0)
    {
      setStartLevel("");
      return;
    }
    if (!startLevelChoices.some((entry) => entry.url === startLevel))
    {
      const nextEntryLevel = startLevelChoices[0].url;
      setStartLevel(nextEntryLevel);
      if (nextEntryLevel !== entryLevel)
      {
        onEntryLevelChange(nextEntryLevel).catch(
          (error: Error) => onError(error.message)
        );
      }
    }
  }, [
    entryLevel,
    onEntryLevelChange,
    onError,
    startLevelChoices,
    startLevel,
  ]);

  /** Update the publish build and persistent project entry level together. */
  async function SelectEntryLevel(manifestUrl: string): Promise<void>
  {
    const previousEntryLevel = startLevel;
    setStartLevel(manifestUrl);
    try
    {
      await onEntryLevelChange(manifestUrl);
    }
    catch (error)
    {
      setStartLevel(previousEntryLevel);
      onError((error as Error).message);
    }
  }

  function ToggleLevel(level: string): void
  {
    setIncludedLevels((previous) =>
    {
      const next = new Set(previous);
      if (next.has(level))
      {
        next.delete(level);
      }
      else
      {
        next.add(level);
      }
      return next;
    });
  }

  async function HandleBuild(): Promise<void>
  {
    if (!project)
    {
      return;
    }

    const body: PublishOptions = {
      platform,
      title: title.trim() || undefined,
      version: version.trim() || undefined,
      destination: destination.trim(),
      levels: [...includedLevels],
      startLevel,
      encryptAssets,
      includeServer,
    };

    setBusy(true);
    followLogRef.current = true;
    try
    {
      const next = await api.startPublish(project, body);
      setStatus(next);
    }
    catch (error)
    {
      setBusy(false);
      onError((error as Error).message);
    }
  }

  /** Stop the running publish job and its npm build child process. */
  async function HandleCancel(): Promise<void>
  {
    if (!project)
    {
      return;
    }

    try
    {
      const next = await api.cancelPublish(project);
      setStatus(next);
      setBusy(IsRunningPublishPhase(next.phase));
    }
    catch (error)
    {
      onError((error as Error).message);
    }
  }

  const canBuild = Boolean(
    project
    && platform === "web"
    && destination.trim().length > 0
    && includedLevels.size > 0
    && startLevel.length > 0
    && !busy,
  );
  const publishProgress = status !== null
    ? GetPublishProgress(status)
    : 0;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Publish</h2>
        <span className="muted panel-meta">
          Build a ready-to-host web bundle for <code>{project || "…"}</code>
        </span>
      </div>

      <div className="publish-form">
        <label>
          Platform
          <select
            value={platform}
            onChange={(event) => setPlatform(event.target.value as "web" | "tauri")}
            aria-label="Platform"
          >
            <option value="web">Web</option>
            <option value="tauri" disabled>Desktop (Tauri) — coming soon</option>
          </select>
        </label>

        <label>
          Product title
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Optional display name"
          />
        </label>

        <label>
          Version
          <input
            type="text"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
            placeholder="1.0.0"
          />
        </label>

        <fieldset className="publish-levels">
          <legend>Levels to include</legend>
          {availableLevels.length === 0 && (
            <p className="muted">No level folders under public/levels/</p>
          )}
          {availableLevels.map((level) => (
            <label key={level} className="publish-check">
              <input
                type="checkbox"
                checked={includedLevels.has(level)}
                onChange={() => ToggleLevel(level)}
              />
              {level}
            </label>
          ))}
          {levels.length > availableLevels.length && (
            <p className="muted">
              Some level folders have no .scene.json and cannot be selected as start levels.
            </p>
          )}
        </fieldset>

        <label>
          Entry level
          <select
            value={startLevel}
            onChange={(event) => { void SelectEntryLevel(event.target.value); }}
            disabled={startLevelChoices.length === 0}
            aria-label="Entry level"
          >
            {startLevelChoices.map((entry) => (
              <option key={entry.url} value={entry.url}>
                {entry.level} / {entry.file}
              </option>
            ))}
          </select>
        </label>

        <label>
          Destination folder (absolute path)
          <input
            type="text"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="/home/you/builds/my-game"
            spellCheck={false}
          />
        </label>

        <label className="publish-check">
          <input
            type="checkbox"
            checked={encryptAssets}
            onChange={(event) => setEncryptAssets(event.target.checked)}
          />
          Encrypt / obfuscate level assets (AES pack + service worker)
        </label>

        <label className="publish-check">
          <input
            type="checkbox"
            checked={includeServer}
            onChange={(event) => setIncludeServer(event.target.checked)}
          />
          Include Node.js web server (run the output with npm start)
        </label>

        <div className="row">
          <button type="button" disabled={!canBuild} onClick={() => { void HandleBuild(); }}>
            Build
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!busy}
            onClick={() => { void HandleCancel(); }}
          >
            Cancel
          </button>
          {status && status.phase !== "idle" && (
            <span className={
              status.phase === "error" || status.phase === "cancelled"
                ? "status-warn"
                : "muted"
            }>
              {status.phase}
              {status.destination ? ` → ${status.destination}` : ""}
            </span>
          )}
        </div>

        {status !== null && status.phase !== "idle" && (
          <div className="publish-progress">
            <progress
              value={publishProgress}
              max={100}
              aria-label="Publish progress"
            />
            <span>{publishProgress}%</span>
          </div>
        )}

        {status?.error && <p className="status-warn">{status.error}</p>}

        {status && status.log.length > 0 && (
          <pre
            ref={logElementRef}
            className="publish-log"
            aria-label="Publish log"
            onScroll={HandleLogScroll}
          >
            {status.log.join("\n")}
          </pre>
        )}
      </div>
    </section>
  );
}
