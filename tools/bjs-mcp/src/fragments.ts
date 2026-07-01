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
    name: "enable-trigger-logging",
    description: "Enable collision callbacks and log trigger overlaps.",
    code: `const body = this.entity.body;
if (body === undefined)
{
  return;
}

body.setCollisionCallbackEnabled(true);
body.getCollisionObservable().add((collisionEvent) =>
{
  console.log(\`[trigger] \${this.entity.name}\`, collisionEvent.type);
});`,
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
    description: "Start a named animation clip (attach behavior to armature).",
    code: `this.entity.GetAnimation("Walk")?.start(true);`,
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
    description: "Show a viewport-hidden or Make Invisible entity at runtime.",
    code: `this.node.isVisible = true;

const light = this.scene.getLightByName(this.entity.name);
if (light !== null)
{
  light.setEnabled(true);
}`,
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
