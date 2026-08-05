import { useCallback, useEffect, useState } from "react";

import { api, type ProjectSummary } from "../api/client";

interface Props
{
  project: ProjectSummary;
  onError: (message: string) => void;
  onSaved: () => void;
}

export function LevelsPanel({ project, onError, onSaved }: Props): JSX.Element
{
  const [exportedLevels, setExportedLevels] = useState<string[]>([]);
  const [include, setInclude] = useState<string[]>([]);
  const [start, setStart] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const Load = useCallback(async () =>
  {
    const levels = await api.getLevels();
    setExportedLevels(levels);
    const existingInclude = project.manifest?.levels?.include;
    const nextInclude = existingInclude && existingInclude.length > 0
      ? existingInclude.filter((levelName) => levels.includes(levelName))
      : [...levels];
    setInclude(nextInclude);
    const nextStart = project.manifest?.levels?.start
      ?? project.defaultLevel
      ?? nextInclude[0]
      ?? "";
    setStart(levels.includes(nextStart) ? nextStart : (nextInclude[0] ?? ""));
  }, [project]);

  useEffect(() =>
  {
    Load().catch((error: Error) => onError(error.message));
  }, [Load, onError]);

  function ToggleInclude(levelName: string): void
  {
    setInclude((previous) =>
    {
      if (previous.includes(levelName))
      {
        return previous.filter((name) => name !== levelName);
      }
      return [...previous, levelName].sort((left, right) => left.localeCompare(right));
    });
  }

  async function Save(): Promise<void>
  {
    if (!include.includes(start))
    {
      onError("Boots-first level must be included in the build");
      return;
    }
    setSaving(true);
    try
    {
      await api.updateLevels({ include, start });
      onSaved();
    }
    catch (error)
    {
      onError((error as Error).message);
    }
    finally
    {
      setSaving(false);
    }
  }

  const canSave = start !== "" && include.includes(start);

  return (
    <section className="panel panel-compact">
      <div className="panel-head">
        <h2>Levels</h2>
        <div className="panel-actions">
          <button type="button" disabled={saving || !canSave} onClick={() => { void Save(); }}>
            Save
          </button>
        </div>
      </div>

      {exportedLevels.length === 0 ? (
        <p className="muted">No exported levels in public/levels/</p>
      ) : (
        <table className="levels-table">
          <thead>
            <tr>
              <th>Level</th>
              <th>In build</th>
              <th>Boots first</th>
            </tr>
          </thead>
          <tbody>
            {exportedLevels.map((levelName) => (
              <tr key={levelName}>
                <td>{levelName}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={include.includes(levelName)}
                    onChange={() => ToggleInclude(levelName)}
                    aria-label={`Include ${levelName}`}
                  />
                </td>
                <td>
                  <input
                    type="radio"
                    name="start-level"
                    checked={start === levelName}
                    onChange={() => setStart(levelName)}
                    aria-label={`Boot ${levelName} first`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="muted panel-foot">
        {include.length} of {exportedLevels.length} levels ship
        {start ? ` · start: ${start}` : ""}
        {" · "}Blender exports to <code>{project.blenderExportPath}</code>
      </p>
    </section>
  );
}
