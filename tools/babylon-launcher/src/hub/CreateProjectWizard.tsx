import { useState } from "react";

import { api } from "../api/client";

interface Props
{
  onClose: () => void;
  onCreated: (name: string) => void | Promise<void>;
}

export function CreateProjectWizard({ onClose, onCreated }: Props): JSX.Element
{
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("");
  const [template, setTemplate] = useState<"empty" | "minimal" | "sample">("minimal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function Submit(event: React.FormEvent): Promise<void>
  {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try
    {
      const result = await api.createProject({
        name,
        title: title || undefined,
        level: level || undefined,
        template,
      });
      await onCreated(result.name);
    }
    catch (e)
    {
      setError((e as Error).message);
    }
    finally
    {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Create Project</h2>
      <form className="wizard-grid" onSubmit={(e) => { Submit(e).catch(() => undefined); }}>
        <label>
          App name
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="my-game" />
        </label>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My Game" />
        </label>
        <label>
          Default level name
          <input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="Arena" />
        </label>
        <label>
          Template
          <select value={template} onChange={(e) => setTemplate(e.target.value as typeof template)}>
            <option value="empty">Empty</option>
            <option value="minimal">Minimal Runtime Scene</option>
            <option value="sample">Sample Behaviors</option>
          </select>
        </label>
        {error && <p className="status-warn">{error}</p>}
        <div className="row">
          <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </section>
  );
}
