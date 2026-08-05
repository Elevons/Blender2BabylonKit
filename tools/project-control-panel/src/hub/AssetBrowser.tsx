import { useEffect, useState } from "react";

import { api } from "../api/client";

interface Props
{
  project: string;
  level: string;
}

export function AssetBrowser({ project, level }: Props): JSX.Element
{
  const [assets, setAssets] = useState<Record<string, string[]>>({});

  useEffect(() =>
  {
    api.listAssets(project, level).then((data) =>
    {
      setAssets(data as Record<string, string[]>);
    }).catch(() => setAssets({}));
  }, [project, level]);

  const folders = Object.keys(assets).filter((folder) => assets[folder]?.length > 0);

  return (
    <section className="panel panel-compact">
      <div className="panel-head">
        <h2>Assets</h2>
        <span className="muted panel-meta">
          {folders.length === 0 ? "None for this level" : `${folders.length} folder${folders.length === 1 ? "" : "s"}`}
        </span>
      </div>
      {folders.length > 0 && (
        <div className="asset-groups">
          {folders.map((folder) => (
            <div key={folder} className="asset-group">
              <h3>{folder}/</h3>
              <ul className="asset-list">
                {assets[folder].map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
