import {
  CreateAudioEngineAsync,
  CreateSoundAsync,
  type AudioEngineV2,
  type StaticSound,
} from "@babylonjs/core";
import type { Entity } from "../core/Entity";
import type { AudioComponent } from "../core/types";
import { RegisterAttachment } from "../core/attachments";
import { ResolveManifestAssetUrl } from "../core/loader/manifest";

/**
 * Audio subsystem, built on Babylon's audio engine v2 (the legacy `Sound` class
 * is deprecated). One engine is created lazily on first use; browsers block
 * audio until a user gesture, so autoplay sounds wait on `unlockAsync()` and
 * start as soon as the user clicks/taps/presses a key.
 */

let audioEnginePromise: Promise<AudioEngineV2> | null = null;

/** Create (once) and return the shared audio engine. */
function EnsureAudioEngine(): Promise<AudioEngineV2>
{
  if (audioEnginePromise === null)
  {
    audioEnginePromise = CreateAudioEngineAsync();
  }

  return audioEnginePromise;
}

/**
 * Create the sound for one AUDIO component and attach it to the entity.
 * Spatial sounds are positioned at (and follow) the entity's node; ambient
 * sounds play flat. The sound is named after its file stem, so
 * `entity.GetSound("door")` finds "audio/door.mp3".
 */
export async function ApplyAudio(
  entity: Entity,
  audioComponent: AudioComponent,
  baseUrl: string
): Promise<StaticSound | undefined>
{
  if (audioComponent.file === null || audioComponent.file.length === 0)
  {
    console.warn(`[bjs] "${entity.name}" has an Audio component with no sound file`);
    return undefined;
  }

  const audioEngine = await EnsureAudioEngine();
  const fileName = audioComponent.file.split("/").pop() ?? audioComponent.file;
  const soundName = fileName.replace(/\.[^.]+$/, "");

  const sound = await CreateSoundAsync(
    soundName,
    ResolveManifestAssetUrl(baseUrl, audioComponent.file),
    {
    volume: audioComponent.volume,
    loop: audioComponent.loop,
    playbackRate: audioComponent.playbackRate,
    // Enabling spatial at creation avoids the first-use latency of toggling it on.
    spatialEnabled: audioComponent.spatial,
    spatialAutoUpdate: audioComponent.spatial,
  });

  if (audioComponent.spatial)
  {
    sound.spatial.attach(entity.node);
    sound.spatial.maxDistance = audioComponent.maxDistance;
  }

  RegisterAttachment(entity, { type: "AUDIO", data: audioComponent, sound });

  // Autoplay must wait for the browser's gesture unlock; don't block loading on it.
  if (audioComponent.autoPlay)
  {
    void audioEngine.unlockAsync().then(() =>
    {
      sound.play();
    });
  }

  return sound;
}
