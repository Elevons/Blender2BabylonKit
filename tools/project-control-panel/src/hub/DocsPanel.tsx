import { useCallback, useEffect, useState } from "react";

import { api, type DocsStatus } from "../api/client";

interface Props
{
  onError: (message: string) => void;
}

/**
 * Describe the versioned documentation shipped with the current kit.
 */
function DocsStatusText(docs: DocsStatus | null): string
{
  if (docs === null)
  {
    return "…";
  }
  if (docs.built)
  {
    return "Ready to view";
  }
  if (!docs.available)
  {
    return "Documentation is missing from this kit installation";
  }
  return "Unavailable";
}

export function DocsPanel({ onError }: Props): JSX.Element
{
  const [docs, setDocs] = useState<DocsStatus | null>(null);

  const refresh = useCallback(async () =>
  {
    const next = await api.getDocsStatus();
    setDocs(next);
  }, []);

  useEffect(() =>
  {
    refresh().catch((e: Error) => onError(e.message));
  }, [refresh, onError]);

  const statusText = DocsStatusText(docs);

  return (
    <section className="panel panel-compact">
      <div className="panel-head">
        <h2>Documentation</h2>
        <span className="muted panel-meta">{statusText}</span>
        <div className="panel-actions">
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
