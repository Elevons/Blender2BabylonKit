import { useCallback, useEffect, useState } from "react";

import { api, type DocsStatus } from "../api/client";

interface Props
{
  onError: (message: string) => void;
}

export function DocsPanel({ onError }: Props): JSX.Element
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
    refresh().catch((e: Error) => onError(e.message));
  }, [refresh, onError]);

  async function Build(): Promise<void>
  {
    setBusy(true);
    try
    {
      const next = await api.buildDocs();
      setDocs(next);
    }
    catch (e)
    {
      onError((e as Error).message);
    }
    finally
    {
      setBusy(false);
    }
  }

  const statusText = docs?.built
    ? "Ready to view"
    : "Not built";

  return (
    <section className="panel panel-compact">
      <div className="panel-head">
        <h2>Documentation</h2>
        <span className="muted panel-meta">{statusText}</span>
        <div className="panel-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => { Build().catch(() => undefined); }}
          >
            {busy ? "Building…" : "Build"}
          </button>
          {docs?.built && (
            <a className="button-link" href={docs.url} target="_blank" rel="noreferrer">
              View
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
