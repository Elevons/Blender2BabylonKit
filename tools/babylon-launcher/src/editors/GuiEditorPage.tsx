import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Engine, Scene } from "@babylonjs/core";
import { GUIEditor } from "./babylonEditorImports";

import { api } from "../api/client";
import { EditorShell } from "./EditorShell";
import { ParseEditorSearchParams } from "./editorContext";
import {
  CreateProjectGuiLoadHandler,
  CreateProjectSaveHandler,
  useProjectFilename,
} from "./useProjectAsset";

export function GuiEditorPage(): JSX.Element
{
  const location = useLocation();
  const ctx = ParseEditorSearchParams(location.search, "gui");
  const [file, setFile] = useProjectFilename(ctx.file);
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
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

    const hostElement = hostRef.current;
    const saveHandler = CreateProjectSaveHandler(
      ctx.project,
      ctx.level,
      ctx.folder,
      file,
      setStatus,
      setError,
    );
    const loadHandler = CreateProjectGuiLoadHandler(
      ctx.project,
      ctx.level,
      ctx.folder,
      file,
    );

    GUIEditor.Show({
      hostElement,
      customSave: {
        label: saveHandler.label,
        action: async (data) =>
        {
          await saveHandler.action(data);
          return "Saved";
        },
      },
      customLoad: loadHandler,
    }).then(async () =>
    {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(ctx.project)}/assets/${encodeURIComponent(ctx.level)}/gui/${encodeURIComponent(file)}`,
      );
      if (response.ok)
      {
        const text = await response.text();
        await loadHandler.action(text);
        setStatus(`Loaded ${file}`);
      }
    }).catch((e: Error) => setError(e.message));

    return () =>
    {
      engine.dispose();
      canvas.remove();
    };
  }, [ctx.project, ctx.level, ctx.folder, file]);

  return (
    <EditorShell
      title="GUI Editor"
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
