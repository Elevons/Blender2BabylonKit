import type { Scene } from "@babylonjs/core";
import { GUI3DManager, type Container3D, type Control3D } from "@babylonjs/gui";
import type { Entity } from "../../core/Entity";
import type { Level } from "../../core/Level";
import { RegisterAttachment, UnregisterAttachment, type EntityAttachment } from "../../core/attachments";
import type {
  Gui3DComponent,
  Gui3DControlComponent,
  Gui3DPanelComponent,
} from "../../core/types";
import { CreateGui3DPanel } from "./panels";
import { CreateGui3DControl, ApplyControlContent } from "./controls";
import { WireClickEvents } from "./events";

/**
 * The 3D GUI build pass. Runs in FinalizeLevel (like constraints) because the
 * ordering matters twice over: panels must exist before their child controls
 * are added, and click targets must be resolvable through the finished Level.
 *
 * Hierarchy rule: a control whose Blender parent owns a panel component is
 * added to THAT panel (the panel lays it out); anything else is added to the
 * manager root and anchored to its own node via linkToTransformNode.
 */

/** One GUI3D component queued during the entity loop. */
export interface Gui3DRegistration {
  entity: Entity;
  component: Gui3DComponent;
  /** The entity's manifest parent GUID — how controls find their panel. */
  parentId: string | null;
}

const PANEL_TYPES = new Set<string>([
  "GUI3D_STACK", "GUI3D_SPHERE", "GUI3D_CYLINDER", "GUI3D_PLANE", "GUI3D_SCATTER",
]);

/** Whether a GUI3D component is a layout panel (vs a child control). */
export function IsPanelComponent(component: Gui3DComponent): component is Gui3DPanelComponent
{
  return PANEL_TYPES.has(component.type);
}

/** Entity key as used for panel lookup: GUID when present, else name. */
export function EntityKey(entity: Entity): string
{
  return entity.id.length > 0 ? entity.id : entity.name;
}

/** Create every panel, anchored to its entity's node, indexed by entity key. */
function BuildPanels(
  registrations: Gui3DRegistration[],
  manager: GUI3DManager
): Map<string, Container3D>
{
  const panelsByEntity = new Map<string, Container3D>();

  for (const registration of registrations)
  {
    if (!IsPanelComponent(registration.component))
    {
      continue;
    }

    const panel = CreateGui3DPanel(registration.component);
    panel.name = registration.entity.name;

    manager.addControl(panel);
    panel.linkToTransformNode(registration.entity.node);

    RegisterAttachment(registration.entity, {
      type: registration.component.type,
      data: registration.component,
      control: panel,
    });
    panelsByEntity.set(EntityKey(registration.entity), panel);
  }

  return panelsByEntity;
}

/** Create one control, place it in its panel (or the manager root), fill it. */
function BuildControl(
  registration: Gui3DRegistration,
  manager: GUI3DManager,
  panelsByEntity: Map<string, Container3D>,
  level: Level,
  baseUrl: string
): void
{
  const controlComponent = registration.component as Gui3DControlComponent;
  const control = CreateGui3DControl(controlComponent, registration.entity);
  if (control === undefined)
  {
    return;
  }

  const parentPanel = registration.parentId !== null
    ? panelsByEntity.get(registration.parentId)
    : undefined;

  if (parentPanel !== undefined)
  {
    parentPanel.addControl(control);
  }
  else
  {
    manager.addControl(control);

    if (controlComponent.type !== "GUI3D_MESH")
    {
      control.linkToTransformNode(registration.entity.node);
    }
  }

  ApplyControlContent(control, controlComponent, baseUrl);
  WireClickEvents(control, controlComponent.events, registration.entity, level);

  RegisterAttachment(registration.entity, {
    type: controlComponent.type,
    data: controlComponent,
    control,
  });
}

/**
 * Apply one GUI3D panel or control at runtime (or during the load finalize pass).
 */
export function ApplyGui3DRegistration(
  registration: Gui3DRegistration,
  manager: GUI3DManager,
  panelsByEntity: Map<string, Container3D>,
  level: Level,
  baseUrl: string
): void
{
  if (IsPanelComponent(registration.component))
  {
    const panel = CreateGui3DPanel(registration.component);
    panel.name = registration.entity.name;
    manager.addControl(panel);
    panel.linkToTransformNode(registration.entity.node);
    RegisterAttachment(registration.entity, {
      type: registration.component.type,
      data: registration.component,
      control: panel,
    });
    panelsByEntity.set(EntityKey(registration.entity), panel);
    return;
  }

  BuildControl(registration, manager, panelsByEntity, level, baseUrl);
}

/** Dispose one GUI3D attachment and remove its row from the entity. */
export function TeardownGui3DAttachment(
  entity: Entity,
  attachment: Extract<EntityAttachment, { control: Control3D }>,
  manager: GUI3DManager,
  panelsByEntity: Map<string, Container3D>
): void
{
  if (IsPanelComponent(attachment.data))
  {
    panelsByEntity.delete(EntityKey(entity));
  }

  attachment.control.dispose();
  manager.removeControl(attachment.control);
  UnregisterAttachment(entity, attachment);
}

/**
 * Build every authored 3D GUI panel and control for a level. Returns the
 * shared GUI3DManager (disposed with the level), or undefined when the level
 * has no 3D GUI components.
 */
export function BuildGui3DControls(
  scene: Scene,
  level: Level,
  registrations: Gui3DRegistration[],
  baseUrl: string,
  panelsByEntityOut?: Map<string, Container3D>
): GUI3DManager | undefined
{
  if (registrations.length === 0)
  {
    return undefined;
  }

  const manager = new GUI3DManager(scene);
  const panelsByEntity = BuildPanels(registrations, manager);

  if (panelsByEntityOut !== undefined)
  {
    for (const [entityKey, panel] of panelsByEntity)
    {
      panelsByEntityOut.set(entityKey, panel);
    }
  }

  for (const panel of panelsByEntity.values())
  {
    panel.blockLayout = true;
  }

  for (const registration of registrations)
  {
    if (!IsPanelComponent(registration.component))
    {
      BuildControl(registration, manager, panelsByEntity, level, baseUrl);
    }
  }

  for (const panel of panelsByEntity.values())
  {
    panel.blockLayout = false;
  }

  return manager;
}
