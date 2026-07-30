import type { AnimationGroup, Observer } from "@babylonjs/core";
import { Behavior } from "../scripting/Behavior";
import type {
  AnimatorComponent,
  AnimatorCondition,
  AnimatorParameter,
  AnimatorState,
  AnimatorTransition,
} from "../core/types";
import type { InputActionMap } from "../input/InputActionMap";
import type { Entity } from "../core/Entity";
import { FindAnimationGroups } from "./animation";

/**
 * Built-in flat FSM that drives NLA AnimationGroups from an ANIMATOR component.
 * Instantiated by the component registry (not BehaviorRegistry / SCRIPT).
 */
export class AnimatorController extends Behavior
{
  readonly component: AnimatorComponent;

  private readonly statesById = new Map<string, AnimatorState>();
  private readonly transitionsFrom = new Map<string, AnimatorTransition[]>();
  private readonly paramTypes = new Map<string, AnimatorParameter["type"]>();
  private readonly floats = new Map<string, number>();
  private readonly bools = new Map<string, boolean>();
  private readonly ints = new Map<string, number>();
  private readonly triggers = new Set<string>();

  private currentStateId = "";
  private stateElapsedSeconds = 0;
  private clipFinished = false;
  private clipEndObserver: Observer<AnimationGroup> | null = null;
  private activeGroup: AnimationGroup | undefined;
  private pendingMessages = new Set<string>();

  constructor(component: AnimatorComponent, inputMap?: InputActionMap)
  {
    super();
    this.component = component;
    if (inputMap !== undefined)
    {
      this.input = inputMap;
    }

    for (const state of component.states)
    {
      this.statesById.set(state.id, state);
    }

    for (const transition of component.transitions)
    {
      const list = this.transitionsFrom.get(transition.from) ?? [];
      list.push(transition);
      this.transitionsFrom.set(transition.from, list);
    }

    for (const parameter of component.parameters)
    {
      this.paramTypes.set(parameter.name, parameter.type);
      const override = component.vars?.[parameter.name];
      this.InitParameter(parameter, override);
    }
  }

  /** Initialize parameter maps from schema + optional panel override. */
  private InitParameter(
    parameter: AnimatorParameter,
    override: number | boolean | undefined
  ): void
  {
    if (parameter.type === "float")
    {
      const value = typeof override === "number" ? override : Number(parameter.default);
      this.floats.set(parameter.name, value);
      return;
    }

    if (parameter.type === "int")
    {
      const value = typeof override === "number" ? Math.trunc(override) : Math.trunc(Number(parameter.default));
      this.ints.set(parameter.name, value);
      return;
    }

    if (parameter.type === "bool")
    {
      const value = typeof override === "boolean" ? override : Boolean(parameter.default);
      this.bools.set(parameter.name, value);
      return;
    }

    // trigger — no persistent default
  }

  /** Current state id (empty before OnStart). */
  get currentState(): string
  {
    return this.currentStateId;
  }

  /** Set a float animator parameter (persists until changed). */
  SetFloat(name: string, value: number): void
  {
    this.floats.set(name, value);
  }

  /** Set a bool animator parameter (persists until changed). */
  SetBool(name: string, value: boolean): void
  {
    this.bools.set(name, value);
  }

  /** Set an int animator parameter (truncated; persists until changed). */
  SetInt(name: string, value: number): void
  {
    this.ints.set(name, Math.trunc(value));
  }

  /** Fire a one-shot trigger consumed at end of frame after transition evaluation. */
  SetTrigger(name: string): void
  {
    this.triggers.add(name);
  }

  /** Read a float parameter; returns 0 when the name is unknown. */
  GetFloat(name: string): number
  {
    return this.floats.get(name) ?? 0;
  }

  /** Read a bool parameter; returns false when the name is unknown. */
  GetBool(name: string): boolean
  {
    return this.bools.get(name) ?? false;
  }

  /** Read an int parameter; returns 0 when the name is unknown. */
  GetInt(name: string): number
  {
    return this.ints.get(name) ?? 0;
  }

  /** Ensure clips are scoped, stop autoplay leftovers, enter default state. */
  OnStart(): void
  {
    if (this.entity.animations.length === 0)
    {
      this.entity.animations = FindAnimationGroups(this.scene, this.entity.node);
    }

    for (const group of this.entity.animations)
    {
      group.stop();
    }

    const startId = this.component.defaultState
      || this.component.states[0]?.id
      || "";
    if (startId.length > 0)
    {
      this.EnterState(startId);
    }
  }

  /** Advance state timer, evaluate transitions, then clear one-shot triggers and messages. */
  OnUpdate(deltaSeconds: number): void
  {
    if (this.currentStateId.length === 0)
    {
      return;
    }

    this.stateElapsedSeconds += deltaSeconds;
    this.EvaluateTransitions();
    this.triggers.clear();
    this.pendingMessages.clear();
  }

  /** Queue a message for message-kind transition conditions this frame. */
  OnMessage(message: string, _source: Entity): void
  {
    this.pendingMessages.add(message);
  }

  /** Stop clip observers when the entity is torn down. */
  OnDestroy(): void
  {
    this.DetachClipObserver();
  }

  /** Pick the first transition whose conditions all pass. */
  private EvaluateTransitions(): void
  {
    const candidates = this.transitionsFrom.get(this.currentStateId);
    if (candidates === undefined || candidates.length === 0)
    {
      return;
    }

    for (const transition of candidates)
    {
      if (this.ConditionsPass(transition.conditions))
      {
        this.EnterState(transition.to);
        return;
      }
    }
  }

  private ConditionsPass(conditions: AnimatorCondition[]): boolean
  {
    if (conditions.length === 0)
    {
      return true;
    }

    for (const condition of conditions)
    {
      if (!this.ConditionPasses(condition))
      {
        return false;
      }
    }

    return true;
  }

  private ConditionPasses(condition: AnimatorCondition): boolean
  {
    switch (condition.kind)
    {
      case "param":
        return this.ParamConditionPasses(condition);
      case "clipFinished":
        return this.clipFinished;
      case "afterSeconds":
        return this.stateElapsedSeconds >= condition.seconds;
      case "input":
        return this.InputConditionPasses(condition);
      case "message":
        return this.pendingMessages.has(condition.message);
      default:
        return false;
    }
  }

  private ParamConditionPasses(
    condition: Extract<AnimatorCondition, { kind: "param" }>
  ): boolean
  {
    const paramType = this.paramTypes.get(condition.param);
    if (paramType === undefined)
    {
      return false;
    }

    if (paramType === "trigger")
    {
      return this.triggers.has(condition.param);
    }

    if (paramType === "bool")
    {
      const actual = this.bools.get(condition.param) ?? false;
      const expected = condition.boolValue ?? condition.value === 1;
      return condition.op === "NEQ" ? actual !== expected : actual === expected;
    }

    const actual = paramType === "int"
      ? (this.ints.get(condition.param) ?? 0)
      : (this.floats.get(condition.param) ?? 0);
    const expected = paramType === "int"
      ? (condition.intValue ?? Math.trunc(condition.value ?? 0))
      : (condition.value ?? 0);

    switch (condition.op)
    {
      case "GT": return actual > expected;
      case "GTE": return actual >= expected;
      case "LT": return actual < expected;
      case "LTE": return actual <= expected;
      case "EQ": return actual === expected;
      case "NEQ": return actual !== expected;
      default: return false;
    }
  }

  private InputConditionPasses(
    condition: Extract<AnimatorCondition, { kind: "input" }>
  ): boolean
  {
    const action = this.input?.FindAction(condition.action);
    if (action === undefined)
    {
      return false;
    }

    if (condition.phase === "pressed")
    {
      return action.WasPressedThisFrame();
    }

    if (condition.phase === "released")
    {
      return action.WasReleasedThisFrame();
    }

    return action.IsPressed();
  }

  private EnterState(stateId: string): void
  {
    const state = this.statesById.get(stateId);
    if (state === undefined)
    {
      console.warn(`[bjs] animator: unknown state "${stateId}" on "${this.entity.name}"`);
      return;
    }

    this.DetachClipObserver();
    this.currentStateId = stateId;
    this.stateElapsedSeconds = 0;
    this.clipFinished = false;

    for (const group of this.entity.animations)
    {
      group.stop();
    }

    const group = this.entity.GetAnimation(state.clip);
    this.activeGroup = group;
    if (group === undefined)
    {
      console.warn(
        `[bjs] animator: clip "${state.clip}" not found for state "${stateId}" ` +
        `on "${this.entity.name}"`
      );
      return;
    }

    if (!state.loop)
    {
      this.clipEndObserver = group.onAnimationGroupEndObservable.add(() =>
      {
        this.clipFinished = true;
      });
    }

    group.start(state.loop, state.speed);
  }

  private DetachClipObserver(): void
  {
    if (this.clipEndObserver !== null && this.activeGroup !== undefined)
    {
      this.activeGroup.onAnimationGroupEndObservable.remove(this.clipEndObserver);
    }

    this.clipEndObserver = null;
  }
}
