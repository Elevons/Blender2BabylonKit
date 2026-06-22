import { Link } from "react-router-dom";

interface Props
{
  title: string;
  project: string;
  level: string;
  file: string;
  status?: string;
  error?: string;
  onFilenameChange: (value: string) => void;
  children: React.ReactNode;
}

export function EditorShell({
  title,
  project,
  level,
  file,
  status,
  error,
  onFilenameChange,
  children,
}: Props): JSX.Element
{
  return (
    <div className="editor-page">
      <div className="editor-toolbar">
        <Link to="/" className="secondary" style={{ textDecoration: "none", padding: "0.5rem 0.75rem" }}>
          ← Hub
        </Link>
        <strong>{title}</strong>
        <span className="muted">{project} / {level === "_workspace" ? "workspace" : level}</span>
        <input
          value={file}
          onChange={(e) => onFilenameChange(e.target.value)}
          aria-label="Asset filename"
          style={{ minWidth: "220px" }}
        />
        {status && <span className="status-ok">{status}</span>}
        {error && <span className="status-warn">{error}</span>}
      </div>
      <div className="editor-host">{children}</div>
    </div>
  );
}
