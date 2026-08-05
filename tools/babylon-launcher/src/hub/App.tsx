import { useCallback, useEffect, useState } from "react";

import { api, type ProjectSummary } from "../api/client";
import { AssetBrowser } from "./AssetBrowser";
import { LevelsPanel } from "./LevelsPanel";
import { PublishPanel } from "./PublishPanel";
import { ServicesPanel } from "./ServicesPanel";
import { ToolsPanel } from "./ToolsPanel";

type HubTab = "develop" | "publish";

/**
 * Two-tab hub: Develop (levels, assets, services, tools) and Publish (ship builds).
 */
export function App(): JSX.Element
{
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [devUrl, setDevUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [tab, setTab] = useState<HubTab>("develop");

  const refresh = useCallback(async () =>
  {
    const nextProject = await api.getProject();
    setProject(nextProject);
  }, []);

  useEffect(() =>
  {
    refresh().catch((caught: Error) => setError(caught.message));
  }, [refresh]);

  useEffect(() =>
  {
    const poll = (): void =>
    {
      api.getDevStatus().then((status) => setDevUrl(status.url)).catch(() => undefined);
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => clearInterval(timer);
  }, []);

  function OnSaved(): void
  {
    refresh().catch((caught: Error) => setError(caught.message));
  }

  return (
    <div className="hub-shell">
      <header className="hub-header">
        <h1>{project?.title ?? "Babylon Launcher"}</h1>
        {project?.publishVersion && (
          <span className="version-chip">v{project.publishVersion}</span>
        )}

        <nav className="hub-tabs" aria-label="Hub sections">
          <button
            type="button"
            className={tab === "develop" ? "hub-tab hub-tab-active" : "hub-tab"}
            aria-selected={tab === "develop"}
            onClick={() => setTab("develop")}
          >
            Develop
          </button>
          <button
            type="button"
            className={tab === "publish" ? "hub-tab hub-tab-active" : "hub-tab"}
            aria-selected={tab === "publish"}
            onClick={() => setTab("publish")}
          >
            Publish
          </button>
        </nav>

        <div className="hub-header-meta">
          {devUrl ? (
            <a className="button-link" href={devUrl} target="_blank" rel="noreferrer">
              ▶ Open game
            </a>
          ) : (
            <span className="muted">Dev server starting…</span>
          )}
        </div>
      </header>

      <main className="hub-main">
        {error && <p className="status-warn">{error}</p>}

        {tab === "develop" && (
          <>
            <ServicesPanel onError={(message) => setError(message)} />

            <ToolsPanel onError={(message) => setError(message)} />

            {project && (
              <LevelsPanel
                project={project}
                onError={(message) => setError(message)}
                onSaved={OnSaved}
              />
            )}

            {project && <AssetBrowser defaultLevel={project.defaultLevel} />}
          </>
        )}

        {tab === "publish" && project && (
          <PublishPanel
            project={project}
            onError={(message) => setError(message)}
            onSaved={OnSaved}
          />
        )}
      </main>
    </div>
  );
}
