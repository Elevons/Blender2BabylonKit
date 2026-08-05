import { useState } from "react";

import { api, type ProjectSummary } from "../api/client";

interface Props
{
  onCreated: (project: ProjectSummary) => void;
  onError: (message: string) => void;
}

/**
 * One-time setup shown when the control panel cannot find a current project.
 */
export function CreateProjectPanel({ onCreated, onError }: Props): JSX.Element
{
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("Main");
  const [busy, setBusy] = useState(false);

  async function Create(): Promise<void>
  {
    setBusy(true);
    try
    {
      await api.createProject({
        name: name.trim(),
        title: title.trim() || undefined,
        level: level.trim() || undefined,
      });
      onCreated(await api.getCurrentProject());
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

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Create Project</h2>
        <span className="muted panel-meta">
          Set up the app template and babylon-project.json.
        </span>
      </div>

      <div className="wizard-grid">
        <label>
          Project name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="my-game"
            autoFocus
          />
        </label>
        <label>
          Display title
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="My Game"
          />
        </label>
        <label>
          First level
          <input
            type="text"
            value={level}
            onChange={(event) => setLevel(event.target.value)}
            placeholder="Main"
          />
        </label>
        <div className="row">
          <button
            type="button"
            disabled={busy || name.trim().length === 0}
            onClick={() => { void Create(); }}
          >
            {busy ? "Creating…" : "Create Project"}
          </button>
        </div>
      </div>
    </section>
  );
}
