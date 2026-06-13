import {
  StackPanel3D,
  SpherePanel,
  CylinderPanel,
  PlanePanel,
  ScatterPanel,
  type Container3D,
  type VolumeBasedPanel,
} from "@babylonjs/gui";
import type { Gui3DPanelComponent } from "../../core/types";

/**
 * Panel construction for the 3D GUI: each GUI3D_* panel component becomes a
 * Babylon container that lays out its child controls (Blender child objects
 * carrying 3D button components). The builder anchors the panel to its
 * entity's node and adds the children.
 */

/** Apply the shared volume-panel layout fields (margin, columns/rows). */
function ConfigureVolumePanel(
  panel: VolumeBasedPanel,
  margin: number,
  columns: number,
  rows: number
): void
{
  panel.margin = margin;

  // Babylon derives the other dimension from whichever one is set; `rows`
  // wins when both are authored (matches the manifest schema contract).
  if (rows > 0)
  {
    panel.rows = rows;
  }
  else if (columns > 0)
  {
    panel.columns = columns;
  }
}

/** Create and configure the Babylon container for one panel component. */
export function CreateGui3DPanel(panelComponent: Gui3DPanelComponent): Container3D
{
  switch (panelComponent.type)
  {
    case "GUI3D_STACK":
    {
      const stackPanel = new StackPanel3D(panelComponent.vertical);
      stackPanel.margin = panelComponent.margin;
      return stackPanel;
    }
    case "GUI3D_SPHERE":
    {
      const spherePanel = new SpherePanel();
      spherePanel.radius = panelComponent.radius;
      ConfigureVolumePanel(
        spherePanel, panelComponent.margin, panelComponent.columns, panelComponent.rows
      );
      return spherePanel;
    }
    case "GUI3D_CYLINDER":
    {
      const cylinderPanel = new CylinderPanel();
      cylinderPanel.radius = panelComponent.radius;
      ConfigureVolumePanel(
        cylinderPanel, panelComponent.margin, panelComponent.columns, panelComponent.rows
      );
      return cylinderPanel;
    }
    case "GUI3D_PLANE":
    {
      const planePanel = new PlanePanel();
      ConfigureVolumePanel(
        planePanel, panelComponent.margin, panelComponent.columns, panelComponent.rows
      );
      return planePanel;
    }
    case "GUI3D_SCATTER":
    {
      const scatterPanel = new ScatterPanel();
      // The manifest field is plural; Babylon's property is `iteration`.
      scatterPanel.iteration = panelComponent.iterations;
      ConfigureVolumePanel(
        scatterPanel, panelComponent.margin, panelComponent.columns, panelComponent.rows
      );
      return scatterPanel;
    }
  }
}
