/**
 * Physics body movement guidance for the bjs-level-kit MCP server.
 *
 * Encodes the "how do I actually move this thing" decision tree for entities
 * that may or may not have a physics body. The hard-won rules here come from
 * the most common Blender -> playground physics bugs:
 *
 *   - Writing node.position on a DYNAMIC body (physics owns the transform and
 *     overwrites it; the mesh jitters or snaps back).
 *   - Setting node.position on an ANIMATED body without disablePreStep = false
 *     (the post-step sync resets the node to the body's old transform, so the
 *     mesh never moves even though the position you logged looks correct).
 *   - Calling setTargetTransform ONCE on a kinematic body (it sets a velocity
 *     to reach the target, and kinematic bodies never lose velocity on their
 *     own, so the body drifts forever).
 *
 * Surface this through the get_physics_movement tool in index.ts.
 */

export type MovementModeName =
  | "no-body"
  | "dynamic"
  | "animated-teleport"
  | "animated-continuous"
  | "toggle-dynamic-animated";

export interface MovementMode
{
  name: MovementModeName;
  title: string;
  whenToUse: string;
  steps: string[];
  /** Imports the snippet needs, or omitted when it needs none. */
  imports?: string;
  code: string;
  pitfalls: string[];
}

export const MOVEMENT_MODES: MovementMode[] = [
  {
    name: "no-body",
    title: "No physics body — drive the node directly",
    whenToUse:
      "The entity has no Rigid Body component. Pure visual/transform motion: spinners, decorative movers, label nodes.",
    steps: [
      "Write this.node.position / this.node.rotationQuaternion directly in OnUpdate.",
      "Nothing else to do — there is no body to fight with.",
    ],
    code: `OnUpdate(deltaSeconds: number): void
{
  this.node.position.addInPlaceFromFloats(0, this.speed * deltaSeconds, 0);
}`,
    pitfalls: [
      "If you later add a Rigid Body in Blender this turns into a physics fight — switch to one of the body-aware modes below.",
    ],
  },
  {
    name: "dynamic",
    title: "DYNAMIC body — move with velocity / impulse / force",
    whenToUse:
      "Default Rigid Body. You want gravity, collisions, and bounces: balls, crates, anything that should be pushed around.",
    steps: [
      "Do NOT write this.node.position — physics owns the transform and will overwrite it every step.",
      "Set linear/angular velocity for direct control, or apply an impulse/force for a push.",
    ],
    imports: 'import { Vector3 } from "@babylonjs/core";',
    code: `const body = this.entity.body;
if (body === undefined)
{
  return;
}

// Direct control (a target each step, not a one-time nudge):
body.setLinearVelocity(new Vector3(this.moveX, 0, this.moveZ));

// Or a one-off push (impulse applied at the body's center):
body.applyImpulse(new Vector3(0, 5, 0), this.node.getAbsolutePosition());`,
    pitfalls: [
      "Writing this.node.position on a DYNAMIC body is the dynamic-body-position-fight warning from validate_behavior — the mesh jitters or snaps back.",
      "Velocity is not 'fire and forget'; gravity and collisions keep modifying it after you set it.",
    ],
  },
  {
    name: "animated-teleport",
    title: "ANIMATED body — teleport (snap and hold)",
    whenToUse:
      "Kinematic Rigid Body, one-shot move: place a platform, lift a car, reset to a checkpoint. Arrive instantly and stay put.",
    steps: [
      "setMotionType(ANIMATED) so the body follows the node instead of physics.",
      "Set disablePreStep = false so the next pre-step copies your node transform INTO the body. Without this the post-step sync overwrites your write and the mesh never moves.",
      "Write this.node.position (and rotationQuaternion). This is a teleport — it carries NO velocity.",
      "Zero linear + angular velocity AFTER the write, since kinematic bodies keep any velocity forever.",
      "Optional: re-enable disablePreStep = true on the next physics step if you will not drive the node again (small perf win).",
    ],
    imports:
      'import { PhysicsMotionType, Quaternion, Vector3 } from "@babylonjs/core";',
    code: `const body = this.entity.body;
if (body === undefined)
{
  return;
}

const target = this.node.position.add(new Vector3(0, 10, 0));

// Physics reads rotationQuaternion, never Euler rotation. Convert if needed.
const rotation = this.node.rotationQuaternion ?? new Quaternion();
if (this.node.rotationQuaternion === null)
{
  Quaternion.FromEulerVectorToRef(this.node.rotation, rotation);
}

body.setMotionType(PhysicsMotionType.ANIMATED);
body.disablePreStep = false;

this.node.position.copyFrom(target);
this.node.rotationQuaternion = rotation;

body.setLinearVelocity(Vector3.Zero());
body.setAngularVelocity(Vector3.Zero());`,
    pitfalls: [
      "Forgetting disablePreStep = false is the classic 'I set the position and logged it, but the mesh does not move' bug — the post-step sync resets the node to the body's old transform.",
      "Do NOT use setTargetTransform here; it sets a velocity, and on a kinematic body that velocity never decays — the body drifts away forever.",
      "Moving a body that parents hinge/6DoF-constrained children (wheels, trailer) yanks them; the solver snaps them over a frame or two. Teleport the children by the same offset for a clean result.",
    ],
  },
  {
    name: "animated-continuous",
    title: "ANIMATED body — continuous / smooth motion",
    whenToUse:
      "Kinematic Rigid Body driven every frame: moving platforms, Path3D followers, a train on rails, a lift that travels smoothly.",
    steps: [
      "In OnStart: setMotionType(ANIMATED) and disablePreStep = false (see the make-body-kinematic / animated-body-sync fragments).",
      "Option A — drive the node yourself: write this.node.position every frame in OnUpdate. The pre-step pushes it into the body each step.",
      "Option B — let physics compute the velocity: call body.setTargetTransform(target, rotation) EVERY frame. It sets the velocity needed to reach the target this step, so as the body nears the target the velocity shrinks to zero.",
    ],
    imports: 'import { PhysicsMotionType, Quaternion } from "@babylonjs/core";',
    code: `// OnStart:
if (this.entity.body !== undefined)
{
  this.entity.body.setMotionType(PhysicsMotionType.ANIMATED);
  this.entity.body.disablePreStep = false;
}

// OnUpdate (Option A — drive the node directly):
const next = this.path.getPointAt(this.progress);
this.node.position.copyFrom(next);

// OnUpdate (Option B — target transform, called EVERY frame):
// const rotation = this.node.rotationQuaternion ?? new Quaternion();
// this.entity.body?.setTargetTransform(next, rotation);`,
    pitfalls: [
      "setTargetTransform must be called every frame. Call it once and the kinematic body keeps that velocity forever — it never stops moving.",
      "Pick ONE option. Driving the node AND calling setTargetTransform in the same frame fights itself.",
      "Still write rotation via rotationQuaternion, not Euler rotation.",
    ],
  },
  {
    name: "toggle-dynamic-animated",
    title: "Toggle a body between DYNAMIC and ANIMATED",
    whenToUse:
      "You hand control back and forth: freeze/teleport a dynamic object, then let it fall again (reset key, possession, scripted setpiece).",
    steps: [
      "On every switch, zero linear + angular velocity so nothing leaks across modes.",
      "Going ANIMATED: set disablePreStep = false, then teleport (see animated-teleport).",
      "Going DYNAMIC: set disablePreStep = true so physics drives the node again, then let gravity take over.",
    ],
    imports: 'import { PhysicsMotionType, Vector3 } from "@babylonjs/core";',
    code: `private SetAnimated(animated: boolean): void
{
  const body = this.entity.body;
  if (body === undefined)
  {
    return;
  }

  if (animated)
  {
    body.setMotionType(PhysicsMotionType.ANIMATED);
    body.disablePreStep = false;

    const target = this.node.position.add(new Vector3(0, 10, 0));
    this.node.position.copyFrom(target);

    body.setLinearVelocity(Vector3.Zero());
    body.setAngularVelocity(Vector3.Zero());
  }
  else
  {
    body.setMotionType(PhysicsMotionType.DYNAMIC);
    body.disablePreStep = true;
    body.setLinearVelocity(Vector3.Zero());
    body.setAngularVelocity(Vector3.Zero());
  }
}`,
    pitfalls: [
      "Zeroing velocity BEFORE setTargetTransform is pointless — the call overwrites it. For a teleport, zero AFTER the position write.",
      "Leaving disablePreStep = false after switching back to DYNAMIC pins the body to the mesh every frame and breaks physics.",
      "Debounce the toggle (e.g. 1s) if it is bound to a held key, or it flips every frame.",
    ],
  },
];

export function GetMovementMode(name: string): MovementMode | undefined
{
  return MOVEMENT_MODES.find((mode) => mode.name === name);
}

export function FormatMovementMode(mode: MovementMode): string
{
  const codeLines = mode.imports !== undefined ? [mode.imports, "", mode.code] : [mode.code];

  const lines = [
    `## ${mode.title}`,
    ``,
    `**When to use:** ${mode.whenToUse}`,
    ``,
    `**Steps:**`,
    ...mode.steps.map((step) => `- ${step}`),
    ``,
    `**Pattern:**`,
    "```ts",
    ...codeLines,
    "```",
    ``,
    `**Pitfalls:**`,
    ...mode.pitfalls.map((pitfall) => `- ${pitfall}`),
  ];

  return lines.join("\n");
}

export function FormatMovementOverview(): string
{
  const decisionTree = [
    "# Moving an entity",
    "",
    "Pick the mode by asking two questions: does the entity have a Rigid Body, and if so, who owns the transform?",
    "",
    "1. **No Rigid Body** -> `no-body`: write `this.node.position` directly.",
    "2. **DYNAMIC Rigid Body** -> `dynamic`: never write `node.position`; use velocity / impulse / force.",
    "3. **ANIMATED Rigid Body, move once** -> `animated-teleport`: `disablePreStep = false`, then write the transform (no velocity).",
    "4. **ANIMATED Rigid Body, move every frame** -> `animated-continuous`: drive the node each frame, or call `setTargetTransform` each frame.",
    "5. **Switch between DYNAMIC and ANIMATED at runtime** -> `toggle-dynamic-animated`.",
    "",
    "Golden rules:",
    "- A DYNAMIC body's transform belongs to physics. An ANIMATED body's transform belongs to you (via the node) — but only if `disablePreStep = false`.",
    "- `setTargetTransform` sets a *velocity*, so it must be called every frame. Kinematic bodies never lose velocity on their own; call it once and the body drifts forever.",
    "- Physics reads `rotationQuaternion`, not Euler `rotation`. Convert with `Quaternion.FromEulerVectorToRef` when `rotationQuaternion` is null.",
    "- Pair this with `validate_behavior` — the dynamic-body-position-fight / possible-physics-fight warnings point straight at modes 2-4.",
    "",
    "---",
    "",
  ].join("\n");

  const modeList = MOVEMENT_MODES.map((mode) => `- **${mode.name}** — ${mode.title}`).join("\n");

  return `${decisionTree}Modes (request one with mode="…"):\n\n${modeList}`;
}
