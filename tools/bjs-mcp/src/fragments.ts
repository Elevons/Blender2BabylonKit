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
