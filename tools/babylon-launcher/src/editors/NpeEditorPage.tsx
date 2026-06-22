import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Engine, Scene } from "@babylonjs/core";
import { NodeParticleSystemSet } from "@babylonjs/core/Particles/Node/nodeParticleSystemSet";
import { NodeParticleEditor } from "./babylonEditorImports";

import { EditorShell } from "./EditorShell";
import { ParseEditorSearchParams } from "./editorContext";
import {
  CreateProjectSaveHandler,
  useProjectAssetLoader,
  useProjectFilename,
} from "./useProjectAsset";

export function NpeEditorPage(): JSX.Element
{
  const location = useLocation();
  const ctx = ParseEditorSearchParams(location.search, "particles");
  const [file, setFile] = useProjectFilename(ctx.file.endsWith(".json") ? ctx.file : `${ctx.file}.json`);
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const { loadObservable } = useProjectAssetLoader(ctx.project, ctx.level, "particles", file);
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
    const nodeParticleSet = new NodeParticleSystemSet(scene);

    NodeParticleEditor.Show({
      hostElement: hostRef.current,
      nodeParticleSet,
      hostScene: scene,
      disposeOnClose: false,
      customSave: CreateProjectSaveHandler(
        ctx.project,
        ctx.level,
        "particles",
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
      title="Node Particle Editor"
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
