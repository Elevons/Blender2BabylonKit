import { useCallback, useEffect, useState } from "react";

import { api, type ProjectSummary } from "../api/client";
import { AssetBrowser } from "./AssetBrowser";
import { BabylonEditorsPanel } from "./BabylonEditorsPanel";
import { CreateProjectPanel } from "./CreateProjectPanel";
import { DocsPanel } from "./DocsPanel";
import { PublishPanel } from "./PublishPanel";
import { ServicesPanel } from "./ServicesPanel";

type HubTab = "development" | "publish";

export function App(): JSX.Element
{
  const [currentProject, setCurrentProject] = useState<ProjectSummary | null>(null);
  const [projectResolved, setProjectResolved] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [tab, setTab] = useState<HubTab>("development");
  const hasProjectManifest = currentProject?.hasManifest === true;
  const createProjectDisabled = !projectResolved || hasProjectManifest;

  const HandleError = useCallback((message: string): void =>
  {
    setError(message);
  }, []);

  /** Persist and share one entry level between Development and Publish. */
  const HandleEntryLevelChange = useCallback(async (manifestUrl: string): Promise<void> =>
  {
    const project = await api.setEntryLevel(manifestUrl);
    setCurrentProject(project);
    setError(undefined);
  }, []);

  useEffect(() =>
  {
    api.getCurrentProject()
      .then((project) => setCurrentProject(project))
      .catch((requestError: Error) => setError(requestError.message))
      .finally(() => setProjectResolved(true));
  }, []);

  useEffect(() =>
  {
    if (hasProjectManifest)
    {
      setShowCreateProject(false);
    }
  }, [hasProjectManifest]);

  return (
    <div className="hub-shell">
      <header className="hub-header">
        <h1>Project Control Panel</h1>
        <nav className="hub-tabs" aria-label="Control panel tabs">
          <button
            type="button"
            className={tab === "development" ? "hub-tab hub-tab-active" : "hub-tab"}
            onClick={() => setTab("development")}
          >
            Development
          </button>
          <button
            type="button"
            className={tab === "publish" ? "hub-tab hub-tab-active" : "hub-tab"}
            onClick={() => setTab("publish")}
          >
            Publish
          </button>
        </nav>
      </header>

      <main className="hub-main">
        {error && <p className="status-warn">{error}</p>}

        <section className="panel panel-compact">
          <div className="panel-head">
            <h2>Current Project</h2>
            <strong className="current-project-name">
              {currentProject?.title ?? (projectResolved ? "Not created" : "Loading…")}
            </strong>
            <button
              type="button"
              className="secondary"
              disabled={createProjectDisabled}
              title={
                hasProjectManifest
                  ? "This project already has babylon-project.json"
                  : "Create the app template and babylon-project.json"
              }
              onClick={() => setShowCreateProject(true)}
            >
              Create Project
            </button>
          </div>
          {currentProject !== null && tab === "development" && (
            <p className="muted panel-foot">
              Live Link path: <code>{currentProject.blenderExportPath}</code>
            </p>
          )}
        </section>

        {projectResolved && !hasProjectManifest && (currentProject === null || showCreateProject) && (
          <CreateProjectPanel
            onCreated={(project) =>
            {
              setCurrentProject(project);
              setShowCreateProject(false);
              setError(undefined);
            }}
            onError={HandleError}
          />
        )}

        {tab === "development" && currentProject !== null && (
          <>
            <DocsPanel onError={HandleError} />

            <BabylonEditorsPanel />

            {currentProject !== null && (
              <ServicesPanel
                project={currentProject.name}
                entryLevel={currentProject.entryLevel}
                onLevelChange={setSelectedLevel}
                onEntryLevelChange={HandleEntryLevelChange}
                onError={HandleError}
              />
            )}

            {currentProject !== null && selectedLevel.length > 0 && (
              <AssetBrowser
                project={currentProject.name}
                level={selectedLevel}
              />
            )}
          </>
        )}

        {tab === "publish" && currentProject !== null && (
          <PublishPanel
            project={currentProject.name}
            entryLevel={currentProject.entryLevel}
            onEntryLevelChange={HandleEntryLevelChange}
            onError={HandleError}
          />
        )}
      </main>
    </div>
  );
}
