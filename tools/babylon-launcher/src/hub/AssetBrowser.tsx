import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api, EditorUrl, type EditorInfo } from "../api/client";

const EDITOR_BY_FOLDER: Record<string, string> = {
  gui: "gui",
  particles: "npe",
  materials: "nme",
  geometry: "nge",
  filters: "sfe",
  "render-graphs": "nrge",
};

interface Props
{
  project: string;
  level: string;
  editors: EditorInfo[];
}

export function AssetBrowser({ project, level, editors }: Props): JSX.Element
{
  const [assets, setAssets] = useState<Record<string, string[]>>({});
  const editorNames = useMemo(
    () => Object.fromEntries(editors.map((e) => [e.id, e.name])),
    [editors],
  );

  useEffect(() =>
  {
    api.listAssets(project, level).then((data) =>
    {
      setAssets(data as Record<string, string[]>);
    }).catch(() => setAssets({}));
  }, [project, level]);

  const folders = Object.keys(assets).filter((folder) => assets[folder]?.length > 0);

  return (
    <section className="panel">
      <h2>Assets</h2>
      {folders.length === 0 && (
        <p className="muted">No saved assets yet for this level. Open an editor and use Save to Project.</p>
      )}
      {folders.map((folder) => (
        <div key={folder} style={{ marginBottom: "1rem" }}>
          <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>{folder}/</h3>
          <ul className="asset-list">
            {assets[folder].map((file) =>
            {
              const editorId = EDITOR_BY_FOLDER[folder];
              return (
                <li key={file}>
                  <span>{file}</span>
                  {editorId && (
                    <Link to={EditorUrl(editorId, project, level, file)}>
                      Open in {editorNames[editorId] ?? editorId}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
