import { useEffect, useState } from "react";

import { api, type ReferencedAsset } from "../api/client";

interface Props
{
  project: string;
  level: string;
  onError: (message: string) => void;
}

const NOT_IN_WORKSPACE = "(not in workspace)";

/**
 * Group referenced assets by their workspace folder, with unmatched items last.
 */
function WorkspaceGroupKey(asset: ReferencedAsset): string
{
  if (asset.workspaceFolder === null)
  {
    return NOT_IN_WORKSPACE;
  }

  return asset.workspaceFolder.length > 0 ? asset.workspaceFolder : "(workspace root)";
}

function SortWorkspaceGroups(left: string, right: string): number
{
  if (left === NOT_IN_WORKSPACE)
  {
    return 1;
  }

  if (right === NOT_IN_WORKSPACE)
  {
    return -1;
  }

  return left.localeCompare(right);
}

function DisplayAssetName(asset: ReferencedAsset): string
{
  if (asset.workspaceFile !== null)
  {
    return asset.workspaceFile;
  }

  const slashIndex = asset.reference.lastIndexOf("/");
  return slashIndex >= 0 ? asset.reference.slice(slashIndex + 1) : asset.reference;
}

/**
 * Show only assets referenced by the deployed scene manifest and reload their workspace copies.
 */
export function AssetBrowser({ project, level, onError }: Props): JSX.Element
{
  const [assets, setAssets] = useState<ReferencedAsset[]>([]);
  const [reloading, setReloading] = useState<string | null>(null);
  const [reloaded, setReloaded] = useState<string | null>(null);

  useEffect(() =>
  {
    api.ListReferencedAssets(project, level).then((data) =>
    {
      setAssets(data);
    }).catch((error: Error) =>
    {
      setAssets([]);
      onError(error.message);
    });
  }, [project, level, onError]);

  useEffect(() =>
  {
    if (reloaded === null)
    {
      return;
    }

    const timer = window.setTimeout(() => setReloaded(null), 2000);
    return () => window.clearTimeout(timer);
  }, [reloaded]);

  const folders = [...new Set(assets.map(WorkspaceGroupKey))].sort(SortWorkspaceGroups);

  /**
   * Copy the workspace source over the deployed file referenced by the manifest.
   */
  async function ReloadAsset(asset: ReferencedAsset): Promise<void>
  {
    setReloading(asset.reference);
    setReloaded(null);
    try
    {
      const updated = await api.ReloadReferencedAsset(project, level, asset.reference);
      setAssets((current) => current.map((candidate) =>
        candidate.reference === updated.reference ? updated : candidate
      ));
      setReloaded(updated.reference);
    }
    catch (error)
    {
      onError((error as Error).message);
    }
    finally
    {
      setReloading(null);
    }
  }

  return (
    <section className="panel panel-compact">
      <div className="panel-head">
        <h2>Assets</h2>
        <span className="muted panel-meta">
          {assets.length === 0
            ? "No references in this level's scene JSON"
            : `${assets.length} referenced asset${assets.length === 1 ? "" : "s"}`}
        </span>
      </div>
      {folders.length > 0 && (
        <div className="asset-groups">
          {folders.map((folder) => (
            <div key={folder} className="asset-group">
              <h3>{folder === NOT_IN_WORKSPACE || folder === "(workspace root)" ? folder : `${folder}/`}</h3>
              <ul className="asset-list">
                {assets.filter((asset) => WorkspaceGroupKey(asset) === folder).map((asset) => (
                  <li key={asset.reference}>
                    <span className="asset-name">{DisplayAssetName(asset)}</span>
                    <span className="asset-actions">
                      {!asset.sourceAvailable && (
                        <span className="muted asset-source-status">No workspace source</span>
                      )}
                      {asset.sourceAvailable && asset.reference !== `${asset.workspaceFolder}/${asset.workspaceFile}` && (
                        <span className="muted asset-source-status">→ {asset.reference}</span>
                      )}
                      {reloaded === asset.reference && (
                        <span className="asset-reloaded-status">Reloaded</span>
                      )}
                      <button
                        type="button"
                        className="secondary"
                        disabled={!asset.sourceAvailable || reloading !== null}
                        title={`Copy workspace source to the level as ${asset.reference}`}
                        onClick={() => void ReloadAsset(asset)}
                      >
                        {reloading === asset.reference ? "Reloading…" : "Reload"}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p className="asset-panel-note">
        Read from a level&apos;s exported JSON and grouped by <code>game/workspace/</code>. The original
        Blender file is not referenced — files must live in <code>game/workspace/</code> in order to be
        traced properly.
      </p>
    </section>
  );
}
