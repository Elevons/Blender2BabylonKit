/**
 * Narrow load/restart/unload surface injected onto behaviors as
 * `this.session`. Apps own the concrete {@link LevelDirector}; behaviors never
 * receive the full {@link Level} handle for lifecycle work.
 */
export interface LevelSession
{
  /** Manifest URL of the loaded (or last requested) level. */
  readonly manifestUrl: string;

  /** True while {@link Load} / {@link Restart} is in flight. */
  readonly isLoading: boolean;

  /**
   * Soft-reload the current manifest into a fresh Scene (dispose level +
   * scene, re-enable physics, load again). Safe to call from a behavior —
   * teardown is deferred past the current call stack.
   */
  Restart(): Promise<void>;

  /**
   * Unload the current level and load another `.scene.json` manifest URL.
   * Serialized with other Load/Restart calls; re-entrant calls queue.
   */
  Load(manifestUrl: string): Promise<void>;

  /** Tear down the current level without loading another. */
  Unload(): void;
}

/**
 * Stub session used when a level is loaded without a {@link LevelDirector}.
 * Methods warn and no-op so scripts don't crash in minimal harnesses.
 */
export function CreateStubLevelSession(reason: string): LevelSession
{
  const Warn = (methodName: string): void =>
  {
    console.warn(`[LevelSession] ${methodName}() ignored — ${reason}`);
  };

  return {
    get manifestUrl(): string
    {
      return "";
    },
    get isLoading(): boolean
    {
      return false;
    },
    async Restart(): Promise<void>
    {
      Warn("Restart");
    },
    async Load(_manifestUrl: string): Promise<void>
    {
      Warn("Load");
    },
    Unload(): void
    {
      Warn("Unload");
    },
  };
}
