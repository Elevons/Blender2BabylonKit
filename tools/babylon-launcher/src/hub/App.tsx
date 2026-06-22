import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api, EditorUrl, type EditorInfo, type ProjectSummary } from "../api/client";
import { AssetBrowser } from "./AssetBrowser";
import { CreateProjectWizard } from "./CreateProjectWizard";
import { ServicesPanel } from "./ServicesPanel";

export function App(): JSX.Element
{
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [editors, setEditors] = useState<EditorInfo[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedLevel, setSelectedLevel] = useState<string>("_workspace");
  const [levels, setLevels] = useState<string[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [versions, setVersions] = useState<string>("");
  const [error, setError] = useState<string | undefined>();

  const activeProject = useMemo(
    () => projects.find((p) => p.name === selectedProject),
    [projects, selectedProject],
  );

  const refresh = useCallback(async () =>
  {
    const [projectList, editorList, versionInfo] = await Promise.all([
      api.getProjects(),
      api.getEditors(),
      api.getEditorVersions(),
    ]);
    setProjects(projectList);
    setEditors(editorList.editors);
    const compat = versionInfo.compatibility;
    setVersions(
      `Engine ${compat.engineCore} · Editors ${compat.editors.map((e) => `${e.editorId}@${e.version}`).join(", ")}`,
    );
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

  async function HandleUpdateEditors(): Promise<void>
  {
    await api.updateEditors("latest");
    await refresh();
  }

  return (
    <div className="hub-shell">
      <header className="hub-header">
        <h1>Babylon Editor Launcher</h1>
        <span className="muted">{versions}</span>
      </header>

      <main className="hub-main">
        {error && <p className="status-warn">{error}</p>}

        <section className="panel">
          <h2>Project</h2>
          <div className="row">
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
              <option value="_workspace">Workspace (pre-export staging)</option>
              {levels.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
            <button type="button" className="secondary" onClick={() => setShowWizard(true)}>
              Create Project
            </button>
            <button type="button" className="secondary" onClick={() => { HandleUpdateEditors().catch((e: Error) => setError(e.message)); }}>
              Update Editors
            </button>
          </div>
          {activeProject && (
            <p className="muted" style={{ marginTop: "0.75rem" }}>
              Blender Live Link export path: <code>{activeProject.blenderExportPath}</code>
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

        {selectedProject && (
          <ServicesPanel
            project={selectedProject}
            onError={(message) => setError(message)}
          />
        )}

        <section className="panel">
          <h2>Editors</h2>
          <div className="editor-grid">
            {editors.map((editor) => (
              <Link
                key={editor.id}
                className="editor-tile"
                to={selectedProject
                  ? EditorUrl(editor.id, selectedProject, selectedLevel)
                  : "#"}
                onClick={(e) => { if (!selectedProject) { e.preventDefault(); } }}
              >
                <strong>{editor.name}</strong>
                <span>{editor.folder}/</span>
              </Link>
            ))}
          </div>
        </section>

        {selectedProject && (
          <AssetBrowser
            project={selectedProject}
            level={selectedLevel}
            editors={editors}
          />
        )}
      </main>
    </div>
  );
}
