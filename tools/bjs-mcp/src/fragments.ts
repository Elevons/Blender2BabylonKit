export interface Fragment
{
  name: string;
  description: string;
  code: string;
}

export const FRAGMENTS: Fragment[] = [
  {
    name: "ease-smoothstep",
    description: "Smoothstep easing for a 0–1 blend value.",
    code: `let blend = phase - legIndex;
blend = blend * blend * (3 - 2 * blend);`,
  },
  {
    name: "move-by-input-vector2",
    description: "Normalize a Vector2 input and apply XZ movement scaled by speed and deltaSeconds.",
    code: `const move = this.player.FindAction(PlayerActions.Move)?.ReadVector2() ?? { x: 0, y: 0 };

if (move.x !== 0 || move.y !== 0)
{
  const step = new Vector3(move.x, 0, move.y).normalize().scale(this.speed * deltaSeconds);
  this.node.position.addInPlace(step);
}`,
  },
  {
    name: "subscribe-jump-performed",
    description: "Subscribe to Jump action performed callback in OnStart.",
    code: `this.player.FindAction(PlayerActions.Jump)?.performed.add(() =>
{
  // {{CUSTOM_LOGIC}}
});`,
  },
  {
    name: "make-body-kinematic",
    description: "Set physics body to ANIMATED (kinematic) — call in OnStart before moving the node.",
    code: `if (this.entity.body !== undefined)
{
  this.entity.body.setMotionType(PhysicsMotionType.ANIMATED);
}`,
  },
  {
    name: "poll-trigger-volume",
    description: "Poll whether a probe entity is inside a BOX/SPHERE trigger volume each frame (auto-fit bounds match Havok body build).",
    code: `import { Behavior, exposed, IsEntityInsideColliderVolume } from "@bjs/engine";
import type { AttachmentOfType, Entity } from "@bjs/engine";

// fields:
private volumeAttachment: AttachmentOfType<"COLLIDER"> | undefined;
private probeInside = false;

@exposed({ type: "entity", label: "Probe" })
probe: Entity | null = null;

OnStart(): void
{
  this.volumeAttachment = this.entity.GetAttachment("COLLIDER");
  this.probeInside = this.IsProbeInsideVolume();
  this.ApplyZoneState();
}

OnUpdate(_deltaSeconds: number): void
{
  const inside = this.IsProbeInsideVolume();
  if (inside === this.probeInside)
  {
    return;
  }

  this.probeInside = inside;
  this.ApplyZoneState();
}

private IsProbeInsideVolume(): boolean
{
  if (this.probe === null)
  {
    return false;
  }

  return IsEntityInsideColliderVolume(this.probe, this.entity, this.volumeAttachment);
}

private ApplyZoneState(): void
{
  // {{CUSTOM_LOGIC}}
}`,
  },
  {
    name: "enable-trigger-logging",
    description: "Log trigger overlaps via OnTriggerEnter/OnTriggerExit (attach to the trigger entity).",
    code: `OnTriggerEnter(other: Entity): void
{
  console.log(\`[trigger] \${this.entity.name} enter "\${other.name}"\`);
}

OnTriggerExit(other: Entity): void
{
  console.log(\`[trigger] \${this.entity.name} exit "\${other.name}"\`);
}`,
  },
  {
    name: "cleanup-keyboard-observer",
    description: "Pattern for keyboard observable — store observer and remove in OnDestroy.",
    code: `// field:
private keyboardObserver: Observer<KeyboardInfo> | undefined;

// OnStart:
this.keyboardObserver = this.scene.onKeyboardObservable.add((keyboardInfo) =>
{
  // {{CUSTOM_LOGIC}}
});

// OnDestroy:
if (this.keyboardObserver !== undefined)
{
  this.scene.onKeyboardObservable.remove(this.keyboardObserver);
}`,
  },
  {
    name: "play-animation",
    description:
      "Start a named animation clip manually (attach behavior to armature). Prefer ANIMATOR for multi-state FSMs. Clip names are Action names.",
    code: `this.entity.GetAnimation("Walk")?.start(true);`,
  },
  {
    name: "set-animator-float",
    description: "Drive an ANIMATOR parameter from a behavior on the same armature.",
    code: `const attachment = this.entity.GetAttachment("ANIMATOR");
if (attachment !== undefined && attachment.type === "ANIMATOR")
{
  attachment.behavior.SetFloat("Speed", moveMagnitude);
}`,
  },
  {
    name: "set-animator-trigger",
    description: "Pulse an ANIMATOR trigger parameter (e.g. Jump).",
    code: `const attachment = this.entity.GetAttachment("ANIMATOR");
if (attachment !== undefined && attachment.type === "ANIMATOR")
{
  attachment.behavior.SetTrigger("Jump");
}`,
  },
  {
    name: "send-message",
    description: "Send a message to another entity's behaviors.",
    code: `otherEntity.SendMessage("open", this.entity);`,
  },
  {
    name: "resolve-hinge-constraint",
    description:
      "Find the first HINGE constraint attachment on a wheel entity (authored in Blender).",
    code: `for (const row of wheelEntity.GetAttachmentsOfType("CONSTRAINT"))
{
  if (row.data.constraintType !== "HINGE")
  {
    continue;
  }

  if (row.constraint instanceof Physics6DoFConstraint)
  {
    return row.constraint;
  }
}`,
  },
  {
    name: "set-hinge-motor-velocity",
    description: "Drive a hinge motor at speed (degrees per second) with max force.",
    code: `const motorAxis = PhysicsConstraintAxis.ANGULAR_X;

if (speedDegreesPerSecond === 0)
{
  hinge.setAxisMotorTarget(motorAxis, 0);
  return;
}

hinge.setAxisMotorType(motorAxis, PhysicsConstraintMotorType.VELOCITY);
hinge.setAxisMotorTarget(motorAxis, speedDegreesPerSecond * (Math.PI / 180));
hinge.setAxisMotorMaxForce(motorAxis, maxForce);`,
  },
  {
    name: "path3d-from-entities",
    description: "Build a Path3D from @exposed entity waypoints in OnStart.",
    code: `const points: Vector3[] = [];
for (const target of this.targets)
{
  if (target !== null)
  {
    points.push(target.node.getAbsolutePosition());
  }
}

if (points.length >= 2)
{
  this.path = new Path3D(points);
  this.maxDuration = this.path.length();
}`,
  },
  {
    name: "orbit-camera-around-target",
    description: "Orbit a UniversalCamera around a target each frame (XZ plane).",
    code: `this.angle += this.orbitSpeedRad * deltaSeconds;
const targetPosition = this.target.node.getAbsolutePosition();
const offsetX = Math.cos(this.angle) * this.radius;
const offsetZ = Math.sin(this.angle) * this.radius;

this.camera.position = new Vector3(
  targetPosition.x + offsetX,
  targetPosition.y + this.heightOffset,
  targetPosition.z + offsetZ
);
this.camera.setTarget(targetPosition);`,
  },
  {
    name: "copy-lens-from-authored-camera",
    description:
      "Copy Blender FOV / clip planes onto a script-created camera (same helper BuildTypedCamera uses).",
    code: `import { CopyLens, FindCameraForNode } from "@bjs/engine";

const authoredCamera = FindCameraForNode(this.scene, this.node);
// … create ArcRotateCamera / UniversalCamera …
if (authoredCamera !== null)
{
  CopyLens(authoredCamera, this.camera);
}
this.scene.activeCamera = this.camera;`,
  },
  {
    name: "geospatial-camera-flyto-point",
    description:
      "Fly the active GeospatialCamera toward a world point (requires CAMERA component GEOSPATIAL in Blender).",
    code: `import { GeospatialCamera } from "@babylonjs/core/Cameras/geospatialCamera";

const activeCamera = this.scene.activeCamera;
// scene.activeCamera is Nullable<Camera> — truthiness catches null and undefined at runtime.
if (!activeCamera || !(activeCamera instanceof GeospatialCamera))
{
  return;
}

const destinationPoint = targetEntity.node.getAbsolutePosition();
await activeCamera.flyToPointAsync(destinationPoint, 0.5, 1500);`,
  },
  {
    name: "update-msdf-text",
    description:
      "Replace MSDF label copy at runtime (MSDF_TEXT component authored in Blender).",
    code: `const label = this.entity.GetTextRenderer("roboto-regular");
if (label !== undefined)
{
  label.clearParagraphs();
  label.addParagraph(\`Score: \${score}\`, { textAlign: "center" });
}`,
  },
  {
    name: "geospatial-camera-flyto-properties",
    description:
      "Animate GeospatialCamera yaw, pitch, radius, and center (any arg undefined keeps current value).",
    code: `import { GeospatialCamera } from "@babylonjs/core/Cameras/geospatialCamera";
import { Vector3 } from "@babylonjs/core";

const activeCamera = this.scene.activeCamera;
// scene.activeCamera is Nullable<Camera> — truthiness catches null and undefined at runtime.
if (!activeCamera || !(activeCamera instanceof GeospatialCamera))
{
  return;
}

await activeCamera.flyToAsync(
  undefined,
  undefined,
  50000,
  new Vector3(6371000, 0, 0),
  2000
);`,
  },
  {
    name: "animated-body-sync",
    description:
      "ANIMATED body + disablePreStep for Path3D / per-frame node driving (see TrainBehavior).",
    code: `if (this.entity.body !== undefined)
{
  this.entity.body.setMotionType(PhysicsMotionType.ANIMATED);
  this.entity.body.disablePreStep = false;
}`,
  },
  {
    name: "reveal-entity",
    description:
      "Reveal an entity at runtime. Load hide keeps entity.active === true, so SetEntityActive(entity, true) alone is a no-op — disable in OnStart, enable on demand.",
    code: `import { SetEntityActive } from "@bjs/engine";

OnStart(): void
{
  SetEntityActive(this.entity, false); // real transition — load hide alone leaves active === true
}

// later (message / trigger / timer):
SetEntityActive(this.entity, true); // re-shows the subtree even when the mesh loaded hidden`,
  },
  {
    name: "set-entity-active",
    description:
      "Full Unity-style SetActive — hide/show subtree, suspend/rebuild Havok, pause behaviors (ToggleInWater pattern).",
    code: `import { SetEntityActive, IsEntityInsideColliderVolume } from "@bjs/engine";
import type { Entity } from "@bjs/engine";

@exposed({ type: "list", of: "entity", label: "Targets" })
targets: (Entity | null)[] = [];

private ApplyTargets(active: boolean): void
{
  for (const target of this.targets)
  {
    if (target !== null)
    {
      SetEntityActive(target, active);
    }
  }
}

// Zone toggle example: edge-detect inside in OnUpdate, then ApplyTargets(inside)`,
  },
  {
    name: "play-sound",
    description: "Play an AUDIO component sound by file stem.",
    code: `this.entity.GetSound("door")?.play();`,
  },
  {
    name: "throttle-from-actions",
    description: "Read Throttle Up / Throttle Down as -1, 0, or +1 (see TrainBehavior).",
    code: `let throttle = 0;
if (this.input?.FindAction("Throttle Up")?.IsPressed() === true)
{
  throttle += 1;
}
if (this.input?.FindAction("Throttle Down")?.IsPressed() === true)
{
  throttle -= 1;
}`,
  },
  {
    name: "move-animated-body",
    description:
      "Teleport an ANIMATED (kinematic) body and have it hold position. disablePreStep = false lets the node transform reach the body; zero velocity after the write so it does not drift.",
    code: `const body = this.entity.body;
if (body === undefined)
{
  return;
}

const target = this.node.position.add(new Vector3(0, 10, 0));

body.setMotionType(PhysicsMotionType.ANIMATED);
body.disablePreStep = false;

this.node.position.copyFrom(target);

body.setLinearVelocity(Vector3.Zero());
body.setAngularVelocity(Vector3.Zero());`,
  },
  {
    name: "zone-lut-swap",
    description:
      "Swap color grading on the existing Default Rendering Pipeline (FogChanger pattern). Use OnPostReady — cast spawner as Level for baseUrl + post handles.",
    code: `import { ApplyColorGradingLut, Behavior, type Level } from "@bjs/engine";

OnPostReady(): void
{
  this.ApplyZoneLut(this.zoneLut.trim());
}

private ApplyZoneLut(manifestPath: string): void
{
  if (manifestPath.length === 0)
  {
    return;
  }

  const level = this.spawner as Level;
  const imageProcessing = level.post?.pipeline?.imageProcessing;
  if (imageProcessing === undefined)
  {
    return;
  }

  imageProcessing.toneMappingEnabled = false;
  ApplyColorGradingLut(this.scene, level.componentHost.baseUrl, imageProcessing, {
    file: manifestPath,
  });
  imageProcessing._updateParameters();
}`,
  },
  {
    name: "spawn-prefab-instance",
    description:
      "Duplicate an in-level template entity (linked prefab or in-scene hierarchy) via this.spawner.Spawn — full components, fresh GUIDs.",
    code: `if (this.prefab === null)
{
  return;
}

const handle = await this.spawner.Spawn(this.prefab, {
  position: this.node.position.clone(),
  // rotationQuaternion?, scaling? — applied before the clone is revealed
  // scaling: Vector3.Zero() — grow-in spawns; lerp to template.node.scaling after spawn
  // parent: null — scene root, world-space position (clones do not follow template parent)
  // parent: someEntity — parent-local position under that entity
  // omit parent — same parent as the template root (default)
  // keepTemplate: true — leave the source visible (Spawn hides at call start by default)
  // @exposed({ spawnTemplate: true }) — hide template at level load (deferred spawners)
  // deferShadowRefresh: true — use in multi-spawn loops; flush once after (below)
});
// handle.rootEntity — the new instance root
// handle.guidMap — templateGuid → runtimeGuid
// handle.cameras — instance cameras (never auto-activated; assign scene.activeCamera yourself)

// After a loop with deferShadowRefresh on each Spawn:
// this.spawner.FlushSpawnShadowRefresh();`,
  },
  {
    name: "paint-scatter-vertex-colors",
    description:
      "Read Blender paint masks from glTF COLOR_n (auto-pick skips fake all-white COLOR_0). LevelLoader loads COLOR_1+ via bjs_extra_vertex_colors.",
    code: `// Prefer auto: try ColorKind then COLOR_1, COLOR_2, … and keep the most varied set.
// Forced kinds: "COLOR_0" / "COLOR_1" (not Blender names like "Color.001").
const colorData =
  mesh.getVerticesData("COLOR_1")
  ?? mesh.getVerticesData(VertexBuffer.ColorKind);
if (colorData === null)
{
  return;
}

const stride = colorData.length % 4 === 0 ? 4 : 3;
const paintThreshold = 0.5; // soft strokes are often 0.4–0.8, not pure 1.0

for (let vertexIndex = 0; vertexIndex < colorData.length / stride; vertexIndex++)
{
  const offset = vertexIndex * stride;
  const luminance =
    0.2126 * colorData[offset]
    + 0.7152 * colorData[offset + 1]
    + 0.0722 * colorData[offset + 2];
  if (luminance < paintThreshold)
  {
    continue;
  }
  // … spawn at this vertex (see populateprefabs.ts)
}`,
  },
];


export function GetFragment(name: string): Fragment | undefined
{
  return FRAGMENTS.find((fragment) => fragment.name === name);
}

export const EXPOSED_SNIPPETS: Record<string, string> = {
  float: '@exposed({ min: 0, max: 10, label: "{{LABEL}}" })\n{{NAME}} = {{DEFAULT}}',
  int: '@exposed({ min: 0, max: 100, step: 1, label: "{{LABEL}}" })\n{{NAME}} = {{DEFAULT}}',
  bool: '@exposed({ label: "{{LABEL}}" })\n{{NAME}} = {{DEFAULT}}',
  string: '@exposed({ label: "{{LABEL}}" })\n{{NAME}} = "{{DEFAULT}}"',
  file: '@exposed({ type: "file", label: "{{LABEL}}" })\n{{NAME}} = ""',
  vector3: '@exposed({ label: "{{LABEL}}" })\n{{NAME}}: [number, number, number] = [{{X}}, {{Y}}, {{Z}}]',
  color: '@exposed({ type: "color", label: "{{LABEL}}" })\n{{NAME}} = new Color3({{X}}, {{Y}}, {{Z}})',
  entity: '@exposed({ type: "entity", label: "{{LABEL}}" })\n{{NAME}}: Entity | null = null',
  enum: '@exposed({ type: "enum", options: [{{OPTIONS}}], label: "{{LABEL}}" })\n{{NAME}} = "{{DEFAULT}}"',
  "list-float": '@exposed({ type: "list", of: "float", label: "{{LABEL}}" })\n{{NAME}}: number[] = [{{DEFAULTS}}]',
  "list-vector3": '@exposed({ type: "list", of: "vector3", label: "{{LABEL}}" })\n{{NAME}}: Vector3[] = []',
  "list-entity": '@exposed({ type: "list", of: "entity", label: "{{LABEL}}" })\n{{NAME}}: (Entity | null)[] = []',
};

export function BuildExposedSnippet(
  type: string,
  options: {
    name?: string;
    label?: string;
    defaultValue?: string;
    enumOptions?: string[];
    vector?: [number, number, number];
    listDefaults?: string;
  }
): string
{
  const fieldName = options.name ?? "myField";
  const label = options.label ?? fieldName;
  const template = EXPOSED_SNIPPETS[type];

  if (template === undefined)
  {
    const supported = Object.keys(EXPOSED_SNIPPETS).join(", ");
    return `Unknown type "${type}". Supported: ${supported}`;
  }

  const vector = options.vector ?? [0, 0, 0];

  return template
    .replace(/\{\{NAME\}\}/g, fieldName)
    .replace(/\{\{LABEL\}\}/g, label)
    .replace(/\{\{DEFAULT\}\}/g, options.defaultValue ?? "0")
    .replace(/\{\{X\}\}/g, String(vector[0]))
    .replace(/\{\{Y\}\}/g, String(vector[1]))
    .replace(/\{\{Z\}\}/g, String(vector[2]))
    .replace(/\{\{OPTIONS\}\}/g, (options.enumOptions ?? ["a", "b"]).map((value) => `"${value}"`).join(", "))
    .replace(/\{\{DEFAULTS\}\}/g, options.listDefaults ?? "1, 2");
}
