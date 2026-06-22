/**
 * Babylon editor npm packages ship as UMD bundles (default export object),
 * not ESM named exports. Vite must pre-bundle them; import through here.
 */
import GuiEditorPkg from "@babylonjs/gui-editor";
import NodeEditorPkg from "@babylonjs/node-editor";
import NodeGeometryEditorPkg from "@babylonjs/node-geometry-editor";
import NodeParticleEditorPkg from "@babylonjs/node-particle-editor";
import NodeRenderGraphEditorPkg from "@babylonjs/node-render-graph-editor";

type EditorModule = {
  default?: Record<string, unknown>;
} & Record<string, unknown>;

function UnwrapEditor<T>(mod: EditorModule, exportName: string): T
{
  const direct = mod[exportName];
  if (direct)
  {
    return direct as T;
  }
  const fromDefault = mod.default?.[exportName];
  if (fromDefault)
  {
    return fromDefault as T;
  }
  throw new Error(`Babylon editor package is missing export: ${exportName}`);
}

export interface EditorShowStatic
{
  Show: (...args: unknown[]) => unknown;
}

export const GUIEditor = UnwrapEditor<EditorShowStatic>(GuiEditorPkg, "GUIEditor");
export const NodeEditor = UnwrapEditor<EditorShowStatic>(NodeEditorPkg, "NodeEditor");
export const NodeParticleEditor = UnwrapEditor<EditorShowStatic>(
  NodeParticleEditorPkg,
  "NodeParticleEditor",
);
export const NodeGeometryEditor = UnwrapEditor<EditorShowStatic>(
  NodeGeometryEditorPkg,
  "NodeGeometryEditor",
);
export const NodeRenderGraphEditor = UnwrapEditor<EditorShowStatic>(
  NodeRenderGraphEditorPkg,
  "NodeRenderGraphEditor",
);
