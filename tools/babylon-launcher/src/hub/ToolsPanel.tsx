import { useCallback, useEffect, useState } from "react";

import { api, type DocsStatus } from "../api/client";

interface Props
{
  onError: (message: string) => void;
}

const BABYLON_EDITORS = [
  { name: "GUI", url: "https://gui.babylonjs.com/" },
  { name: "Particles", url: "https://npe.babylonjs.com/" },
  { name: "Materials", url: "https://nme.babylonjs.com/" },
  { name: "Geometry", url: "https://nge.babylonjs.com/" },
  { name: "Filters", url: "https://sfe.babylonjs.com/" },
  { name: "Render Graph", url: "https://nrge.babylonjs.com/" },
  { name: "Terrains", url: "https://terrains.zyfod.dev/" },
] as const;

/**
 * Reference material in one place: the local engine docs (build/view) and
 * links to the online Babylon node editors whose JSON lands in asset folders.
 */
export function ToolsPanel({ onError }: Props): JSX.Element
{
  const [docs, setDocs] = useState<DocsStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () =>
  {
    const next = await api.getDocsStatus();
    setDocs(next);
  }, []);

  useEffect(() =>
  {
    refresh().catch((error: Error) => onError(error.message));
  }, [refresh, onError]);

  async function BuildDocs(): Promise<void>
  {
    setBusy(true);
    try
    {
      const next = await api.buildDocs();
      setDocs(next);
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
    <section className="panel panel-compact">
      <div className="panel-head">
        <h2>Docs &amp; Tools</h2>
        <span className="muted panel-meta">
          {docs?.built ? "Docs ready" : "Docs not built"}
        </span>
        <div className="panel-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => { BuildDocs().catch(() => undefined); }}
          >
            {busy ? "Building…" : "Build docs"}
          </button>
          {docs?.built && (
            <a className="button-link" href={docs.url} target="_blank" rel="noreferrer">
              View docs
            </a>
          )}
        </div>
      </div>

      <div className="editor-links">
        {BABYLON_EDITORS.map((editor) => (
          <a
            key={editor.url}
            className="editor-link"
            href={editor.url}
            target="_blank"
            rel="noreferrer"
          >
            {editor.name}
          </a>
        ))}
      </div>
      <p className="muted panel-foot">
        Babylon node editors — save their JSON into the project asset folders.
      </p>
    </section>
  );
}
