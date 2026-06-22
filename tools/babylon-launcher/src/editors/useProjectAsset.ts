import { useEffect, useRef, useState } from "react";
import { Observable } from "@babylonjs/core/Misc/observable";

import { api } from "../api/client";

export function useProjectFilename(initial: string): [string, (v: string) => void]
{
  const [file, setFile] = useState(initial);
  return [file, setFile];
}

export function useProjectAssetLoader(
  project: string,
  level: string,
  folder: string,
  file: string,
): { loadObservable: Observable<unknown>; initialLoaded: boolean }
{
  const loadObservable = useRef(new Observable<unknown>()).current;
  const [initialLoaded, setInitialLoaded] = useState(false);

  useEffect(() =>
  {
    if (!project || !file)
    {
      return;
    }
    let cancelled = false;
    fetch(
      `/api/projects/${encodeURIComponent(project)}/assets/${encodeURIComponent(level)}/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`,
    )
      .then(async (response) =>
      {
        if (!response.ok)
        {
          return null;
        }
        const text = await response.text();
        return JSON.parse(text) as unknown;
      })
      .then((data) =>
      {
        if (!cancelled && data)
        {
          loadObservable.notifyObservers(data);
          setInitialLoaded(true);
        }
      })
      .catch(() => undefined);

    return () => { cancelled = true; };
  }, [project, level, folder, file, loadObservable]);

  return { loadObservable, initialLoaded };
}

export function CreateProjectSaveHandler(
  project: string,
  level: string,
  folder: string,
  file: string,
  onSaved: (message: string) => void,
  onError: (message: string) => void,
): { label: string; action: (data: string) => Promise<void> }
{
  return {
    label: "Save to Project",
    action: async (data: string) =>
    {
      try
      {
        await api.writeAsset(project, level, folder, file, data);
        onSaved(`Saved ${file}`);
      }
      catch (error)
      {
        onError((error as Error).message);
      }
    },
  };
}

export function CreateProjectGuiLoadHandler(
  project: string,
  level: string,
  folder: string,
  file: string,
): { label: string; action: (data: string) => Promise<string> }
{
  return {
    label: "Load from Project",
    action: async () =>
    {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(project)}/assets/${encodeURIComponent(level)}/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`,
      );
      if (!response.ok)
      {
        throw new Error(`Asset not found: ${file}`);
      }
      return response.text();
    },
  };
}
