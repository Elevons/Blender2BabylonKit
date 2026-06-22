import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { api } from "../api/client";
import { EditorShell } from "./EditorShell";
import { ParseEditorSearchParams } from "./editorContext";
import { useProjectFilename } from "./useProjectAsset";

/**
 * Smart Filter Editor runtime packages ship on npm, but the full visual editor
 * is still built from the Babylon.js monorepo. This host saves filter JSON to
 * the project and validates parse until a vendored SFE build is added.
 */
export function SfeEditorPage(): JSX.Element
{
  const location = useLocation();
  const ctx = ParseEditorSearchParams(location.search, "filters");
  const [file, setFile] = useProjectFilename(ctx.file.endsWith(".json") ? ctx.file : `${ctx.file}.json`);
  const [content, setContent] = useState("{\n  \"name\": \"NewFilter\",\n  \"blocks\": []\n}\n");
  const [status, setStatus] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() =>
  {
    if (!ctx.project)
    {
      return;
    }
    fetch(
      `/api/projects/${encodeURIComponent(ctx.project)}/assets/${encodeURIComponent(ctx.level)}/filters/${encodeURIComponent(file)}`,
    )
      .then(async (response) =>
      {
        if (response.ok)
        {
          setContent(await response.text());
          setStatus(`Loaded ${file}`);
        }
      })
      .catch(() => undefined);
  }, [ctx.project, ctx.level, file]);

  async function Save(): Promise<void>
  {
    try
    {
      JSON.parse(content);
      await api.writeAsset(ctx.project, ctx.level, "filters", file, content);
      setStatus(`Saved ${file}`);
      setError(undefined);
    }
    catch (e)
    {
      setError((e as Error).message);
    }
  }

  return (
    <EditorShell
      title="Smart Filter Editor (JSON host)"
      project={ctx.project}
      level={ctx.level}
      file={file}
      status={status}
      error={error}
      onFilenameChange={setFile}
    >
      <div style={{ padding: "1rem", height: "100%", display: "grid", gridTemplateRows: "auto 1fr" }}>
        <p className="muted">
          Full visual SFE requires building from the Babylon.js monorepo. Edit filter JSON here and save to your project.
          For the hosted editor, open <a href="https://sfe.babylonjs.com/" target="_blank" rel="noreferrer">sfe.babylonjs.com</a>.
        </p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{ width: "100%", height: "100%", fontFamily: "ui-monospace, monospace", fontSize: "0.9rem" }}
          spellCheck={false}
        />
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <button type="button" onClick={() => { Save().catch(() => undefined); }}>Save to Project</button>
        </div>
      </div>
    </EditorShell>
  );
}
