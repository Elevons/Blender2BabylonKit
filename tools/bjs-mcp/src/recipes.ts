export interface Recipe
{
  name: string;
  description: string;
  keywords: string[];
  hooks: string[];
  referenceBehavior: string;
  pitfalls: string[];
  exposedFields: string[];
}

export const RECIPES: Recipe[] = [
  {
    name: "minimal-behavior",
    description: "Empty behavior shell with correct imports and class contract.",
    keywords: ["empty", "starter", "scaffold", "template", "basic"],
    hooks: [],
    referenceBehavior: "",
    pitfalls: ["Class name must match filename stem.", "Use export default."],
    exposedFields: [],
  },
  {
    name: "look-at-target",
    description: "Orient this entity to face another entity each frame.",
    keywords: ["look", "face", "aim", "turret", "target", "follow rotation"],
    hooks: ["OnUpdate"],
    referenceBehavior: "LookAt.ts",
    pitfalls: ["Guard target !== null before use.", "Attach to the entity that should rotate."],
    exposedFields: ['@exposed({ type: "entity", label: "Target" }) target: Entity | null = null'],
  },
  {
    name: "constant-rotate",
    description: "Spin around a fixed axis at a configurable rate (degrees per second).",
    keywords: ["rotate", "spin", "turn", "axis", "rpm"],
    hooks: ["OnStart", "OnUpdate"],
    referenceBehavior: "Rotator.ts",
    pitfalls: ["Convert degrees to radians in OnStart.", "Scale rotation by deltaSeconds in OnUpdate."],
    exposedFields: [
      '@exposed({ min: 0, max: 720, label: "Speed (deg/s)" }) speed = 45',
      '@exposed({ label: "Axis" }) axis: [number, number, number] = [0, 1, 0]',
    ],
  },
  {
    name: "waypoint-path",
    description: "Move along a list of waypoints with optional easing.",
    keywords: ["waypoint", "path", "train", "patrol route", "interpolate", "lerp", "points"],
    hooks: ["OnUpdate"],
    referenceBehavior: "Waypoints.ts",
    pitfalls: [
      "Need at least 2 waypoints or OnUpdate no-ops.",
      "List of vector3 starts empty — points are authored in Blender.",
      "Do not multiply Lerp result by deltaSeconds.",
    ],
    exposedFields: [
      '@exposed({ type: "enum", options: ["linear", "easeInOut", "snap"] }) easing = "easeInOut"',
      '@exposed({ type: "list", of: "vector3", label: "Waypoints" }) points: Vector3[] = []',
      '@exposed({ min: 0.1, label: "Seconds per leg" }) legDuration = 2',
    ],
  },
  {
    name: "patrol-oscillate",
    description: "Ease back and forth between start position and start + offset.",
    keywords: ["patrol", "oscillate", "ping pong", "sine", "bob", "back and forth"],
    hooks: ["OnStart", "OnUpdate"],
    referenceBehavior: "Patrol.ts",
    pitfalls: [
      "Set physics body to ANIMATED (kinematic) before moving node each frame.",
      "Capture start position in OnStart, not in the constructor.",
    ],
    exposedFields: [
      '@exposed({ label: "Offset" }) offset: [number, number, number] = [5, 0, 0]',
      '@exposed({ min: 0.1, label: "Period (s)" }) period = 4',
    ],
  },
  {
    name: "input-poll-move",
    description: "Poll a Vector2 Move action and translate on the XZ plane.",
    keywords: ["wasd", "keyboard", "gamepad", "move", "walk", "input", "player"],
    hooks: ["OnStart", "OnUpdate"],
    referenceBehavior: "InputMover.ts",
    pitfalls: [
      "Use action names from InputActions constants, not raw key codes.",
      "Multiply position delta by deltaSeconds.",
      "Import PlayerActions from ../InputActions.",
    ],
    exposedFields: [
      '@exposed({ min: 0.1, max: 30, label: "Speed (u/s)" }) speed = 5',
      '@inputMap("Player") player!: InputActionMap',
    ],
  },
  {
    name: "on-message-handler",
    description: "React to SendMessage or trigger events via OnMessage.",
    keywords: ["message", "trigger", "event", "onclick", "door", "pad", "boost"],
    hooks: ["OnMessage"],
    referenceBehavior: "MessageLogger.ts",
    pitfalls: [
      "Trigger colliders send messages on enter — handle in OnMessage, not OnStart.",
      "Filter by message string if multiple events target this entity.",
    ],
    exposedFields: [
      '@exposed({ label: "Only message (empty = all)" }) onlyMessage = ""',
    ],
  },
  {
    name: "animation-cycle",
    description: "Cycle through animation clips on an interval.",
    keywords: ["animation", "clip", "nla", "walk", "idle", "cycle"],
    hooks: ["OnStart", "OnUpdate"],
    referenceBehavior: "ClipSwitcher.ts",
    pitfalls: [
      "Attach behavior to the armature entity, not the skinned mesh.",
      "Need 2+ animation clips on the entity.",
    ],
    exposedFields: [
      '@exposed({ min: 0.5, label: "Switch every (s)" }) interval = 3',
      '@exposed({ label: "Loop each clip" }) loop = true',
    ],
  },
  {
    name: "kinematic-body-move",
    description: "Move a node each frame when it has a physics body — set ANIMATED first.",
    keywords: ["physics", "kinematic", "animated", "body", "collider"],
    hooks: ["OnStart", "OnUpdate"],
    referenceBehavior: "Patrol.ts",
    pitfalls: [
      "Call setMotionType(PhysicsMotionType.ANIMATED) in OnStart.",
      "Do not fight DYNAMIC bodies by writing node.position every frame.",
    ],
    exposedFields: [],
  },
  {
    name: "trigger-logger",
    description: "Log physics trigger overlaps (needs trigger COLLIDER).",
    keywords: ["trigger", "overlap", "collision", "log", "debug"],
    hooks: ["OnStart"],
    referenceBehavior: "TriggerLogger.ts",
    pitfalls: ["Requires entity.body and setCollisionCallbackEnabled(true)."],
    exposedFields: ['@exposed({ label: "Message" }) message = ""'],
  },
];

export function FindRecipesByIntent(intent: string): Recipe[]
{
  const normalized = intent.toLowerCase();
  const tokens = normalized.split(/\W+/).filter((token) => token.length > 1);

  const scored = RECIPES.map((recipe) =>
  {
    let score = 0;

    if (normalized.includes(recipe.name.replace(/-/g, " ")))
    {
      score += 10;
    }

    for (const keyword of recipe.keywords)
    {
      if (normalized.includes(keyword))
      {
        score += 5;
      }

      for (const token of tokens)
      {
        if (keyword.includes(token) || token.includes(keyword))
        {
          score += 2;
        }
      }
    }

    if (recipe.description.toLowerCase().split(/\W+/).some((word) => tokens.includes(word)))
    {
      score += 1;
    }

    return { recipe, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.recipe);
}

export function GetRecipeByName(name: string): Recipe | undefined
{
  return RECIPES.find((recipe) => recipe.name === name);
}

const TEMPLATES: Record<string, (className: string) => string> = {
  "minimal-behavior": (className) => `import { Behavior } from "@bjs/engine";

/** TODO: describe what this behavior does. */
export default class ${className} extends Behavior
{
}
`,

  "look-at-target": (className) => `import { Behavior, exposed, type Entity } from "@bjs/engine";

/** Continuously orients this object to face the target entity. */
export default class ${className} extends Behavior
{
  @exposed({ type: "entity", label: "Target" })
  target: Entity | null = null;

  /** Face the target each frame (no-op until a target is assigned). */
  OnUpdate(): void
  {
    if (this.target === null)
    {
      return;
    }

    this.node.lookAt(this.target.node.getAbsolutePosition());
  }
}
`,

  "constant-rotate": (className) => `import { Behavior, exposed } from "@bjs/engine";
import { Vector3 } from "@babylonjs/core";

/** Spins a node around a fixed axis at a constant rate. */
export default class ${className} extends Behavior
{
  @exposed({ min: 0, max: 720, label: "Speed (deg/s)" })
  speed = 45;

  @exposed({ label: "Axis" })
  axis: [number, number, number] = [0, 1, 0];

  private rotationAxis = new Vector3(0, 1, 0);
  private radiansPerSecond = 0;

  /** Cache the axis vector and angular speed once values are applied. */
  OnStart(): void
  {
    this.rotationAxis = Vector3.FromArray(this.axis);
    this.radiansPerSecond = (this.speed * Math.PI) / 180;
  }

  /** Advance the rotation for this frame. */
  OnUpdate(deltaSeconds: number): void
  {
    this.node.rotate(this.rotationAxis, this.radiansPerSecond * deltaSeconds);
  }
}
`,

  "waypoint-path": (className) => `import { Behavior, exposed } from "@bjs/engine";
import { Vector3 } from "@babylonjs/core";

/** Moves the node through a list of waypoints with configurable easing. */
export default class ${className} extends Behavior
{
  @exposed({ type: "enum", options: ["linear", "easeInOut", "snap"] })
  easing = "easeInOut";

  @exposed({ type: "list", of: "vector3", label: "Waypoints" })
  points: Vector3[] = [];

  @exposed({ min: 0.1, label: "Seconds per leg" })
  legDuration = 2;

  private elapsedSeconds = 0;

  /** Interpolate along the current leg using the chosen easing. */
  OnUpdate(deltaSeconds: number): void
  {
    if (this.points.length < 2)
    {
      return;
    }

    this.elapsedSeconds += deltaSeconds;
    const totalDuration = this.legDuration * (this.points.length - 1);
    const phase = (this.elapsedSeconds % totalDuration) / this.legDuration;
    const legIndex = Math.floor(phase);

    let blend = phase - legIndex;
    if (this.easing === "snap")
    {
      blend = blend < 0.5 ? 0 : 1;
    }
    else if (this.easing === "easeInOut")
    {
      blend = blend * blend * (3 - 2 * blend);
    }

    this.node.position = Vector3.Lerp(this.points[legIndex], this.points[legIndex + 1], blend);
  }
}
`,

  "patrol-oscillate": (className) => `import { Behavior, exposed } from "@bjs/engine";
import { Vector3, PhysicsMotionType } from "@babylonjs/core";

/** Eases a node back and forth between its start and start + offset. */
export default class ${className} extends Behavior
{
  @exposed({ label: "Offset" })
  offset: [number, number, number] = [5, 0, 0];

  @exposed({ min: 0.1, label: "Period (s)" })
  period = 4;

  private startPosition = new Vector3();
  private endPosition = new Vector3();
  private elapsedSeconds = 0;

  /** Capture the endpoints and make any physics body kinematic. */
  OnStart(): void
  {
    this.startPosition = this.node.position.clone();
    this.endPosition = this.startPosition.add(Vector3.FromArray(this.offset));

    if (this.entity.body !== undefined)
    {
      this.entity.body.setMotionType(PhysicsMotionType.ANIMATED);
    }
  }

  /** Lerp between the endpoints on a sine ease. */
  OnUpdate(deltaSeconds: number): void
  {
    this.elapsedSeconds += deltaSeconds;
    const blend = (Math.sin((this.elapsedSeconds / this.period) * Math.PI * 2) + 1) / 2;
    this.node.position = Vector3.Lerp(this.startPosition, this.endPosition, blend);
  }
}
`,

  "input-poll-move": (className) => `import { Behavior, exposed, inputMap } from "@bjs/engine";
import type { InputActionMap } from "@bjs/engine";
import { Vector3 } from "@babylonjs/core";
import { PlayerActions } from "../InputActions";

/** Moves on the XZ plane using the Player map Move action. */
export default class ${className} extends Behavior
{
  @exposed({ min: 0.1, max: 30, label: "Speed (u/s)" })
  speed = 5;

  @inputMap("Player") player!: InputActionMap;

  /** Poll named actions each frame. */
  OnUpdate(deltaSeconds: number): void
  {
    const move = this.player.FindAction(PlayerActions.Move)?.ReadVector2() ?? { x: 0, y: 0 };

    if (move.x !== 0 || move.y !== 0)
    {
      const step = new Vector3(move.x, 0, move.y).normalize().scale(this.speed * deltaSeconds);
      this.node.position.addInPlace(step);
    }
  }
}
`,

  "on-message-handler": (className) => `import { Behavior, exposed } from "@bjs/engine";
import type { Entity } from "@bjs/engine";

/** Logs or reacts when this entity receives a message. */
export default class ${className} extends Behavior
{
  @exposed({ label: "Only message (empty = all)" })
  onlyMessage = "";

  /** Handle messages from triggers or SendMessage. */
  OnMessage(message: string, source: Entity): void
  {
    if (this.onlyMessage.length > 0 && message !== this.onlyMessage)
    {
      return;
    }

    // {{CUSTOM_LOGIC}}
    console.log(\`[\${this.entity.name}] "\${message}" from "\${source.name}"\`);
  }
}
`,

  "animation-cycle": (className) => `import { Behavior, exposed } from "@bjs/engine";

/** Cycles through this entity's animation clips on an interval. */
export default class ${className} extends Behavior
{
  @exposed({ min: 0.5, label: "Switch every (s)" })
  interval = 3;

  @exposed({ label: "Loop each clip" })
  loop = true;

  private elapsedSeconds = 0;
  private currentClipIndex = 0;

  /** Start on the first clip. */
  OnStart(): void
  {
    this.Play(0);
  }

  /** Advance to the next clip once the interval elapses. */
  OnUpdate(deltaSeconds: number): void
  {
    if (this.entity.animations.length < 2)
    {
      return;
    }

    this.elapsedSeconds += deltaSeconds;
    if (this.elapsedSeconds >= this.interval)
    {
      this.elapsedSeconds = 0;
      this.currentClipIndex = (this.currentClipIndex + 1) % this.entity.animations.length;
      this.Play(this.currentClipIndex);
    }
  }

  /** Stop all clips and start the one at the given index. */
  private Play(index: number): void
  {
    for (const group of this.entity.animations)
    {
      group.stop();
    }
    this.entity.animations[index]?.start(this.loop);
  }
}
`,

  "kinematic-body-move": (className) => `import { Behavior } from "@bjs/engine";
import { PhysicsMotionType } from "@babylonjs/core";

/** Template for per-frame node motion on a physics body — set kinematic first. */
export default class ${className} extends Behavior
{
  /** Make the body kinematic before driving the node each frame. */
  OnStart(): void
  {
    if (this.entity.body !== undefined)
    {
      this.entity.body.setMotionType(PhysicsMotionType.ANIMATED);
    }
  }

  /** Drive motion here — scale continuous changes by deltaSeconds. */
  OnUpdate(deltaSeconds: number): void
  {
    // {{CUSTOM_LOGIC}}
  }
}
`,

  "trigger-logger": (className) => `import { Behavior, exposed } from "@bjs/engine";

/** Logs when a trigger collider is overlapped (needs a trigger COLLIDER). */
export default class ${className} extends Behavior
{
  @exposed({ label: "Message" })
  message = "";

  /** Subscribe to the body's collision observable and log overlaps. */
  OnStart(): void
  {
    const body = this.entity.body;
    if (body === undefined)
    {
      return;
    }

    body.setCollisionCallbackEnabled(true);
    body.getCollisionObservable().add((collisionEvent) =>
    {
      console.log(\`[trigger] \${this.message.length > 0 ? this.message : this.entity.name}\`, collisionEvent.type);
    });
  }
}
`,
};

export function GetRecipeTemplate(recipeName: string, className: string): string | undefined
{
  const builder = TEMPLATES[recipeName];
  if (builder === undefined)
  {
    return undefined;
  }

  const safeName = className.replace(/[^A-Za-z0-9_]/g, "");
  if (safeName.length === 0)
  {
    return undefined;
  }

  return builder(safeName);
}
