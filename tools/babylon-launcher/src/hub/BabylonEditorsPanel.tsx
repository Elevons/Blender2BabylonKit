const BABYLON_EDITORS = [
  { name: "GUI", url: "https://gui.babylonjs.com/" },
  { name: "Particles", url: "https://npe.babylonjs.com/" },
  { name: "Materials", url: "https://nme.babylonjs.com/" },
  { name: "Geometry", url: "https://nge.babylonjs.com/" },
  { name: "Filters", url: "https://sfe.babylonjs.com/" },
  { name: "Render Graph", url: "https://nrge.babylonjs.com/" },
] as const;

export function BabylonEditorsPanel(): JSX.Element
{
  return (
    <section className="panel panel-compact">
      <div className="panel-head">
        <h2>Babylon Editors</h2>
        <span className="muted panel-meta">Online tools — save JSON into project asset folders</span>
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
    </section>
  );
}
