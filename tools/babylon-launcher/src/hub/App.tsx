import { useCallback, useEffect, useMemo, useState } from "react";

import { api, type ProjectSummary } from "../api/client";
import { AssetBrowser } from "./AssetBrowser";
import { BabylonEditorsPanel } from "./BabylonEditorsPanel";
import { CreateProjectWizard } from "./CreateProjectWizard";
import { DocsPanel } from "./DocsPanel";
import { ServicesPanel } from "./ServicesPanel";

export function App(): JSX.Element
{
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedLevel, setSelectedLevel] = useState<string>("_workspace");
  const [levels, setLevels] = useState<string[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const activeProject = useMemo(
    () => projects.find((p) => p.name === selectedProject),
    [projects, selectedProject],
  );

  const refresh = useCallback(async () =>
  {
    const projectList = await api.getProjects();
    setProjects(projectList);
    if (!selectedProject && projectList.length > 0)
    {
      setSelectedProject(projectList[0].name);
    }
  }, [selectedProject]);

  useEffect(() => { refresh().catch((e: Error) => setError(e.message)); }, [refresh]);

  useEffect(() =>
  {
    if (!selectedProject)
    {
      setLevels([]);
      return;
    }
    api.getLevels(selectedProject).then((list) =>
    {
      setLevels(list);
      const project = projects.find((p) => p.name === selectedProject);
      if (project?.defaultLevel && list.includes(project.defaultLevel))
      {
        setSelectedLevel(project.defaultLevel);
      }
      else if (list.length > 0)
      {
        setSelectedLevel(list[0]);
      }
      else
      {
        setSelectedLevel("_workspace");
      }
    }).catch((e: Error) => setError(e.message));
  }, [selectedProject, projects]);

  return (
    <div className="hub-shell">
      <header className="hub-header">
        <h1>Babylon Launcher</h1>
      </header>

      <main className="hub-main">
        {error && <p className="status-warn">{error}</p>}

        <section className="panel panel-compact">
          <div className="panel-head">
            <h2>Project</h2>
            <div className="panel-actions panel-actions-grow">
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                aria-label="Project"
              >
                {projects.map((project) => (
                  <option key={project.name} value={project.name}>{project.title}</option>
                ))}
              </select>
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                aria-label="Level"
              >
                <option value="_workspace">Workspace</option>
                {levels.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
              <button type="button" className="secondary" onClick={() => setShowWizard(true)}>
                New
              </button>
            </div>
          </div>
          {activeProject && (
            <p className="muted panel-foot">
              Live Link path: <code>{activeProject.blenderExportPath}</code>
            </p>
          )}
        </section>

        {showWizard && (
          <CreateProjectWizard
            onClose={() => setShowWizard(false)}
            onCreated={async (name) =>
            {
              setShowWizard(false);
              await refresh();
              setSelectedProject(name);
            }}
          />
        )}

        <DocsPanel onError={(message) => setError(message)} />

        <BabylonEditorsPanel />

        {selectedProject && (
          <ServicesPanel
            project={selectedProject}
            onError={(message) => setError(message)}
          />
        )}

        {selectedProject && (
          <AssetBrowser
            project={selectedProject}
            level={selectedLevel}
          />
        )}
      </main>
    </div>
  );
}
