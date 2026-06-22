import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Engine, Scene } from "@babylonjs/core";
import { NodeRenderGraph } from "@babylonjs/core/FrameGraph/Node/nodeRenderGraph";
import { NodeRenderGraphEditor } from "./babylonEditorImports";

import { EditorShell } from "./EditorShell";
import { ParseEditorSearchParams } from "./editorContext";
import {
  CreateProjectSaveHandler,
  useProjectAssetLoader,
  useProjectFilename,
} from "./useProjectAsset";

export function NrgeEditorPage(): JSX.Element
{
  const location = useLocation();
  const ctx = ParseEditorSearchParams(location.search, "render-graphs");
  const [file, setFile] = useProjectFilename(ctx.file.endsWith(".json") ? ctx.file : `${ctx.file}.json`);
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const { loadObservable } = useProjectAssetLoader(ctx.project, ctx.level, "render-graphs", file);
  const booted = useRef(false);

  useEffect(() =>
  {
    if (!ctx.project || !hostRef.current || booted.current)
    {
      return;
    }
    booted.current = true;

    const canvas = document.createElement("canvas");
    canvas.style.display = "none";
    document.body.appendChild(canvas);
    const engine = new Engine(canvas, true);
    const scene = new Scene(engine);
    const nodeRenderGraph = new NodeRenderGraph("renderGraph");
    nodeRenderGraph.build(scene);

    NodeRenderGraphEditor.Show({
      hostElement: hostRef.current,
      nodeRenderGraph,
      hostScene: scene,
      customSave: CreateProjectSaveHandler(
        ctx.project,
        ctx.level,
        "render-graphs",
        file,
        setStatus,
        setError,
      ),
      customLoadObservable: loadObservable,
    });

    return () =>
    {
      engine.dispose();
      canvas.remove();
    };
  }, [ctx.project, ctx.level, file, loadObservable]);

  return (
    <EditorShell
      title="Node Render Graph Editor"
      project={ctx.project}
      level={ctx.level}
      file={file}
      status={status}
      error={error}
      onFilenameChange={setFile}
    >
      <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
    </EditorShell>
  );
}
