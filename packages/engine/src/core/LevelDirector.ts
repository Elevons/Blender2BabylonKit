import { Color4, Scene, type Engine } from "@babylonjs/core";

import type { BehaviorRegistry } from "../scripting/BehaviorRegistry";
import { EnableHavokPhysics } from "../subsystems/physics/index";
import {
  CreateLevelEngine,
  FetchAndValidateManifest,
  ResolveHavokPhysicsOptions,
} from "./bootstrap";
import { Level } from "./Level";
import { LevelLoader, type LevelLoaderOptions } from "./LevelLoader";
import type { LevelSession } from "./levelSession";
import {
  CreateKitLoadingScreen,
  HideLoadingOverlay,
  SetLoadingProgress,
  ShowLoadingOverlay,
} from "./loadingOverlay";

/** App hooks after each successful load (fallback camera, debug keys, …). */
export interface LevelDirectorLoadedContext
{
  engine: Engine;
  scene: Scene;
  level: Level;
  manifestUrl: string;
}

/** Options for {@link LevelDirector}. */
export interface LevelDirectorOptions
{
  canvas: HTMLCanvasElement;
  registry: BehaviorRegistry;
  /** Passed to {@link CreateLevelEngine} on first load. Default true. */
  antialias?: boolean;
  /** Forwarded into each {@link LevelLoader} (plus `session: this`). */
  loaderOptions?: LevelLoaderOptions;
  /** Called after every successful Load/Restart. */
  onLoaded?: (context: LevelDirectorLoadedContext) => void;
}

/**
 * App-owned level lifecycle: creates the engine on first load, recreates the
 * Scene + Havok world on every Load/Restart, and injects itself as
 * `behavior.session` via {@link LevelLoaderOptions.session}.
 *
 * The Babylon Engine is kept across restarts (large-world rendering is fixed
 * from the first loaded manifest). Call {@link Dispose} when tearing down the
 * whole app.
 */
export class LevelDirector implements LevelSession
{
  /** Frame color while no scene is live (between unload and first render). */
  private static readonly LOADING_CLEAR_COLOR = new Color4(0, 0, 0, 1);

  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private level: Level | null = null;
  private renderLoopStarted = false;
  private resizeBound = false;
  private generation = 0;
  private chain: Promise<void> = Promise.resolve();
  private _manifestUrl = "";
  private _isLoading = false;

  constructor(private readonly options: LevelDirectorOptions)
  {
  }

  get manifestUrl(): string
  {
    return this._manifestUrl;
  }

  get isLoading(): boolean
  {
    return this._isLoading;
  }

  /** Current Babylon engine, or null before the first successful load. */
  GetEngine(): Engine | null
  {
    return this.engine;
  }

  /** Current scene, or null when unloaded. */
  GetScene(): Scene | null
  {
    return this.scene;
  }

  /** Current level container, or null when unloaded. */
  GetLevel(): Level | null
  {
    return this.level;
  }

  /** Soft-reload the current manifest. */
  Restart(): Promise<void>
  {
    if (this._manifestUrl.length === 0)
    {
      return Promise.reject(
        new Error("[LevelDirector] Restart() called before any level was loaded.")
      );
    }

    return this.Load(this._manifestUrl);
  }

  /**
   * Load (or reload) a manifest. Queued and deferred so a behavior that calls
   * this from a GUI click / OnUpdate finishes before teardown runs.
   */
  Load(manifestUrl: string): Promise<void>
  {
    const run = (): Promise<void> => this.LoadInternal(manifestUrl);

    // Yield one microtask so the caller's stack (behavior click, etc.) unwinds.
    const next = this.chain.then(
      () => Promise.resolve().then(run),
      () => Promise.resolve().then(run)
    );

    // Keep the chain alive after failures so later Load/Restart still run.
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** Dispose the current level + scene; leave the engine running. */
  Unload(): void
  {
    this.generation += 1;
    this.TeardownCurrent();
    this._manifestUrl = "";
    this._isLoading = false;
    this.engine?.hideLoadingUI();
    HideLoadingOverlay();
  }

  /** Unload, stop the render loop, and dispose the engine. */
  Dispose(): void
  {
    this.Unload();

    if (this.resizeBound)
    {
      window.removeEventListener("resize", this.OnWindowResize);
      this.resizeBound = false;
    }

    if (this.engine !== null)
    {
      this.engine.stopRenderLoop();
      this.engine.dispose();
      this.engine = null;
    }

    this.renderLoopStarted = false;
  }

  /** Fetch manifest, recreate scene, load level, fire onLoaded. */
  private async LoadInternal(manifestUrl: string): Promise<void>
  {
    const generation = ++this.generation;
    this._isLoading = true;

    ShowLoadingOverlay("Loading level…");
    SetLoadingProgress(null, "Loading level…");
    this.engine?.displayLoadingUI();

    try
    {
      const manifest = await FetchAndValidateManifest(manifestUrl);
      if (generation !== this.generation)
      {
        return;
      }

      this.TeardownCurrent();

      if (this.engine === null)
      {
        this.engine = CreateLevelEngine(
          this.options.canvas,
          this.options.antialias ?? true,
          manifest
        );
        this.engine.loadingScreen = CreateKitLoadingScreen("Loading level…");
        this.EnsureRenderLoop();
        this.BindResize();
        this.engine.displayLoadingUI();
      }

      SetLoadingProgress(null, "Starting physics…");
      const scene = new Scene(this.engine);
      await EnableHavokPhysics(scene, ResolveHavokPhysicsOptions(manifest));
      if (generation !== this.generation)
      {
        scene.dispose();
        return;
      }

      const loaderOptions: LevelLoaderOptions = {
        ...this.options.loaderOptions,
        session: this,
        onProgress: (ratio, status) =>
        {
          SetLoadingProgress(ratio, status);
        },
      };
      const loader = new LevelLoader(scene, this.options.registry, loaderOptions);
      SetLoadingProgress(null, "Loading scene…");
      const level = await loader.Load(manifestUrl, manifest);
      if (generation !== this.generation)
      {
        level.Dispose();
        scene.dispose();
        return;
      }

      this.scene = scene;
      this.level = level;
      this._manifestUrl = manifestUrl;

      this.options.onLoaded?.({
        engine: this.engine,
        scene,
        level,
        manifestUrl,
      });
    }
    finally
    {
      // A newer Load owns the overlay when generations differ — leave it up.
      if (generation === this.generation)
      {
        this._isLoading = false;
        this.engine?.hideLoadingUI();
        HideLoadingOverlay();
      }
    }
  }

  /** Dispose level bookkeeping, then the Babylon scene (meshes, materials, …). */
  private TeardownCurrent(): void
  {
    if (this.level !== null)
    {
      this.level.Dispose();
      this.level = null;
    }

    if (this.scene !== null)
    {
      this.scene.dispose();
      this.scene = null;
    }
  }

  /** Start a single render loop that always targets the current scene. */
  private EnsureRenderLoop(): void
  {
    if (this.renderLoopStarted || this.engine === null)
    {
      return;
    }

    this.renderLoopStarted = true;
    this.engine.runRenderLoop(() =>
    {
      if (this.scene !== null)
      {
        this.scene.render();
        return;
      }

      // No live scene while a Load/Restart is in flight. Without an explicit
      // clear the browser keeps compositing the last frame the disposed scene
      // presented, so the canvas freezes on a stale snapshot until the new
      // level's first render.
      this.engine?.clear(LevelDirector.LOADING_CLEAR_COLOR, true, true, true);
    });
  }

  private BindResize(): void
  {
    if (this.resizeBound)
    {
      return;
    }

    window.addEventListener("resize", this.OnWindowResize);
    this.resizeBound = true;
  }

  private readonly OnWindowResize = (): void =>
  {
    this.engine?.resize();
  };
}
