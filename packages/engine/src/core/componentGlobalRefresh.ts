import type { Scene } from "@babylonjs/core";
import type { Level } from "./Level";
import {
  CollectEmptyParticleEmitters,
  WireParticleEmitterTracking,
} from "../subsystems/particles";
import { CollectTextRenderers, WireMsdfTextRendering } from "../ui/msdfText";
import type { EventMessageRegistration } from "../subsystems/collisions";
import { RefreshCollisionCallbacks } from "../subsystems/collisions";

export type GlobalRefreshFlag =
  | "collisionCallbacks"
  | "particleEmitters"
  | "msdfRendering";

/** Re-wire scene managers that depend on the full entity attachment set. */
export function FlushGlobalRefresh(
  scene: Scene,
  level: Level,
  flags: ReadonlySet<GlobalRefreshFlag>,
  eventMessageRegistrations: EventMessageRegistration[]
): void
{
  if (flags.has("collisionCallbacks"))
  {
    RefreshCollisionCallbacks(level, eventMessageRegistrations);
  }

  if (flags.has("particleEmitters"))
  {
    if (level.particleEmitterManager !== undefined)
    {
      level.particleEmitterManager.dispose();
      level.particleEmitterManager = undefined;
    }

    level.particleEmitterManager = WireParticleEmitterTracking(
      scene,
      CollectEmptyParticleEmitters(level.entities.values())
    );
  }

  if (flags.has("msdfRendering"))
  {
    if (level.msdfTextManager !== undefined)
    {
      level.msdfTextManager.dispose();
      level.msdfTextManager = undefined;
    }

    level.msdfTextManager = WireMsdfTextRendering(
      scene,
      CollectTextRenderers(level.entities.values())
    );
  }
}
