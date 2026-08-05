import { useEffect, useState } from "react";

import { api } from "../api/client";

interface Props
{
  defaultLevel?: string;
}

/**
 * Browse the JSON asset folders (gui/, particles/, …) for one exported level.
 */
export function AssetBrowser({ defaultLevel }: Props): JSX.Element
{
  const [levels, setLevels] = useState<string[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<string>(defaultLevel ?? "");
  const [assets, setAssets] = useState<Record<string, string[]>>({});

  useEffect(() =>
  {
    api.getLevels().then((levelList) =>
    {
      setLevels(levelList);
      if (defaultLevel && levelList.includes(defaultLevel))
      {
        setSelectedLevel(defaultLevel);
      }
      else if (levelList.length > 0)
      {
        setSelectedLevel(levelList[0]);
      }
      else
      {
        setSelectedLevel("");
      }
    }).catch(() => setLevels([]));
  }, [defaultLevel]);

  useEffect(() =>
  {
    if (selectedLevel === "")
    {
      setAssets({});
      return;
    }

    api.listAssets(selectedLevel).then((data) =>
    {
      setAssets(data as Record<string, string[]>);
    }).catch(() => setAssets({}));
  }, [selectedLevel]);

  const folders = Object.keys(assets).filter((folder) => assets[folder]?.length > 0);

  return (
    <section className="panel panel-compact">
      <div className="panel-head">
        <h2>Assets</h2>
        {levels.length > 0 && (
          <div className="panel-actions panel-actions-grow">
            <select
              value={selectedLevel}
              onChange={(event) => setSelectedLevel(event.target.value)}
              aria-label="Level"
            >
              {levels.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {levels.length === 0 ? (
        <p className="muted">No exported levels yet</p>
      ) : folders.length === 0 ? (
        <p className="muted">No JSON assets for this level</p>
      ) : (
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
