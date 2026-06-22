export interface EditorContext
{
  project: string;
  level: string;
  file: string;
  folder: string;
}

export function ParseEditorSearchParams(
  search: string,
  defaultFolder: string,
): EditorContext
{
  const params = new URLSearchParams(search);
  const project = params.get("project") ?? "";
  const level = params.get("level") ?? "_workspace";
  const file = params.get("file") ?? `new-${defaultFolder}.json`;
  return { project, level, file, folder: defaultFolder };
}
