// End-to-end headless check with the real Train Scene glb:
// run the engine's actual sun pipeline (ApplyBlenderLight + SetupShadows),
// optionally scaling the Sun node translation, and report the shadow frustum.
import { readFileSync } from "node:fs";
import {
  NullEngine,
  Scene,
  FreeCamera,
  Vector3,
  DirectionalLight,
  TransformNode,
} from "@babylonjs/core";
import { AppendSceneAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/loaders/glTF/2.0/index.js";
import { ApplyBlenderLight } from "./packages/engine/src/subsystems/lights";
import { SetupShadows } from "./packages/engine/src/subsystems/shadows";

const GLB_PATH = "apps/playground/public/levels/Train Scene/Train Scene.glb";
const MANIFEST_PATH = "apps/playground/public/levels/Train Scene/Train Scene.scene.json";

async function RunOnce(sunDistanceScale: number): Promise<void>
{
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("cam", new Vector3(2022, 1444, 921), scene);
  camera.minZ = 0.1;
  camera.maxZ = 10000;
  scene.activeCamera = camera;

  const glbBuffer = readFileSync(GLB_PATH);
  const glbBlobUrl = "data:;base64," + glbBuffer.toString("base64");
  await AppendSceneAsync(glbBlobUrl, scene, { pluginExtension: ".glb" });

  // Simulate the user moving the Blender sun farther out along its offset
  // from the scene center: scale the Sun node's translation.
  const sunNode = scene.getNodeByName("Sun") as TransformNode | null;
  if (sunNode === null)
  {
    throw new Error("Sun node not found in glb");
  }
  sunNode.position.scaleInPlace(sunDistanceScale);
  sunNode.computeWorldMatrix(true);

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const sunEntity = manifest.entities.find((e: any) => e.light?.type === "SUN");

  const light = ApplyBlenderLight(scene, sunNode, sunEntity.light);
  if (light === null || !(light instanceof DirectionalLight))
  {
    throw new Error("sun light not resolved / not directional");
  }

  const generators = SetupShadows(scene, [
    { light, settings: sunEntity.light.shadow, sunAngle: sunEntity.light.sunAngle },
  ], { mapSize: 1024, debug: true });

  scene.render();
  scene.render();

  const generator = generators[0];
  const transform = generator.getTransformMatrix();

  // Coverage check: every renderable mesh corner inside the frustum (NDC z in [-1,1] for NullEngine).
  let outCount = 0;
  let total = 0;
  const outMeshes = new Set<string>();
  for (const mesh of scene.meshes)
  {
    if (mesh.getTotalVertices() === 0) { continue; }
    mesh.computeWorldMatrix(true);
    for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld)
    {
      total++;
      const p = Vector3.TransformCoordinates(corner, transform);
      const inside = Math.abs(p.x) <= 1.001 && Math.abs(p.y) <= 1.001 && p.z >= -1.001 && p.z <= 1.001;
      if (!inside) { outCount++; outMeshes.add(mesh.name); }
    }
  }

  console.log(`scale=${sunDistanceScale}: sunNode.pos=(${sunNode.position.x.toFixed(0)},${sunNode.position.y.toFixed(0)},${sunNode.position.z.toFixed(0)})`);
  console.log(`  light.pos=(${light.position.x.toFixed(2)},${light.position.y.toFixed(2)},${light.position.z.toFixed(2)})`
    + ` dir=(${light.direction.x.toFixed(4)},${light.direction.y.toFixed(4)},${light.direction.z.toFixed(4)}) parent=${light.parent?.name ?? "null"}`);
  console.log(`  shadowMinZ=${light.shadowMinZ?.toFixed(2)} shadowMaxZ=${light.shadowMaxZ?.toFixed(2)}`
    + ` ortho L=${light.orthoLeft?.toFixed(1)} R=${light.orthoRight?.toFixed(1)} T=${light.orthoTop?.toFixed(1)} B=${light.orthoBottom?.toFixed(1)}`);
  console.log(`  mesh corners outside frustum: ${outCount}/${total}` + (outMeshes.size > 0 ? ` (${[...outMeshes].slice(0, 8).join(", ")})` : ""));

  engine.dispose();
}

await RunOnce(1);
await RunOnce(10);
await RunOnce(100);

// Runtime movement test: after load, push the light's position far away
// (as an inspector drag or a behavior would) and re-check coverage.
async function RunRuntimeMove(offset: Vector3): Promise<void>
{
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("cam", new Vector3(2022, 1444, 921), scene);
  camera.minZ = 0.1;
  camera.maxZ = 10000;
  scene.activeCamera = camera;

  const glbBuffer = readFileSync(GLB_PATH);
  await AppendSceneAsync("data:;base64," + glbBuffer.toString("base64"), scene, { pluginExtension: ".glb" });

  const sunNode = scene.getNodeByName("Sun") as TransformNode;
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const sunEntity = manifest.entities.find((e: any) => e.light?.type === "SUN");
  const light = ApplyBlenderLight(scene, sunNode, sunEntity.light) as DirectionalLight;
  const generators = SetupShadows(scene, [
    { light, settings: sunEntity.light.shadow, sunAngle: sunEntity.light.sunAngle },
  ], { mapSize: 1024 });

  scene.render();

  light.position.addInPlace(offset);
  scene.render();
  scene.render();

  const transform = generators[0].getTransformMatrix();
  let outCount = 0;
  let total = 0;
  for (const mesh of scene.meshes)
  {
    if (mesh.getTotalVertices() === 0) { continue; }
    for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld)
    {
      total++;
      const p = Vector3.TransformCoordinates(corner, transform);
      const inside = Math.abs(p.x) <= 1.001 && Math.abs(p.y) <= 1.001 && p.z >= -1.001 && p.z <= 1.001;
      if (!inside) { outCount++; }
    }
  }
  console.log(`runtime move offset=(${offset.x},${offset.y},${offset.z}):`
    + ` shadowMinZ=${light.shadowMinZ?.toFixed(2)} shadowMaxZ=${light.shadowMaxZ?.toFixed(2)}`
    + ` corners outside: ${outCount}/${total}`);
  engine.dispose();
}

await RunRuntimeMove(new Vector3(0, 0, 0));
await RunRuntimeMove(new Vector3(10000, 20000, -5000));

// Receiver-depth cutoff check: how much of the terrain inside the shadow
// frustum's XY rect lies BEYOND the autoCalc'd shadowMaxZ (=> shadow cut off)?
async function CheckReceiverDepthCutoff(): Promise<void>
{
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("cam", new Vector3(2022, 1444, 921), scene);
  camera.minZ = 0.1;
  camera.maxZ = 10000;
  scene.activeCamera = camera;

  const glbBuffer = readFileSync(GLB_PATH);
  await AppendSceneAsync("data:;base64," + glbBuffer.toString("base64"), scene, { pluginExtension: ".glb" });

  const sunNode = scene.getNodeByName("Sun") as TransformNode;
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const sunEntity = manifest.entities.find((e: any) => e.light?.type === "SUN");
  const light = ApplyBlenderLight(scene, sunNode, sunEntity.light) as DirectionalLight;
  SetupShadows(scene, [
    { light, settings: sunEntity.light.shadow, sunAngle: sunEntity.light.sunAngle },
  ], { mapSize: 1024 });

  scene.render();
  scene.render();

  const viewMatrix = (light as any).getViewMatrix() as import("@babylonjs/core").Matrix;
  const terrain = scene.getMeshByName("Terrain_Surface");
  if (terrain === null) { throw new Error("no terrain"); }
  const positions = terrain.getVerticesData("position")!;
  const world = terrain.getWorldMatrix();

  const minZ = light.shadowMinZ!;
  const maxZ = light.shadowMaxZ!;
  const oL = light.orthoLeft!, oR = light.orthoRight!, oT = light.orthoTop!, oB = light.orthoBottom!;

  let insideRect = 0;
  let beyondMaxZ = 0;
  let beforeMinZ = 0;
  for (let i = 0; i < positions.length; i += 3)
  {
    const worldPos = Vector3.TransformCoordinates(new Vector3(positions[i], positions[i + 1], positions[i + 2]), world);
    const lightSpace = Vector3.TransformCoordinates(worldPos, viewMatrix);
    if (lightSpace.x >= oL && lightSpace.x <= oR && lightSpace.y >= oB && lightSpace.y <= oT)
    {
      insideRect++;
      if (lightSpace.z > maxZ) { beyondMaxZ++; }
      if (lightSpace.z < minZ) { beforeMinZ++; }
    }
  }
  console.log(`terrain verts inside shadow XY rect: ${insideRect}; beyond shadowMaxZ: ${beyondMaxZ} (${(100 * beyondMaxZ / Math.max(insideRect, 1)).toFixed(1)}%), before shadowMinZ: ${beforeMinZ}`);
  console.log(`depth range: minZ=${minZ.toFixed(1)} maxZ=${maxZ.toFixed(1)}`);
  engine.dispose();
}

await CheckReceiverDepthCutoff();

// Authored Clip Start/End: Blender semantics are distance-from-lamp, but the
// engine applies them from the anchored origin (~1 unit from caster center).
// Measure how many casters land inside the authored depth window.
async function CheckAuthoredClips(minZ: number, maxZ: number): Promise<void>
{
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("cam", new Vector3(2022, 1444, 921), scene);
  camera.minZ = 0.1;
  camera.maxZ = 10000;
  scene.activeCamera = camera;

  const glbBuffer = readFileSync(GLB_PATH);
  await AppendSceneAsync("data:;base64," + glbBuffer.toString("base64"), scene, { pluginExtension: ".glb" });

  const sunNode = scene.getNodeByName("Sun") as TransformNode;
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const sunEntity = manifest.entities.find((e: any) => e.light?.type === "SUN");
  const light = ApplyBlenderLight(scene, sunNode, sunEntity.light) as DirectionalLight;
  SetupShadows(scene, [
    { light, settings: { ...sunEntity.light.shadow, minZ, maxZ }, sunAngle: sunEntity.light.sunAngle },
  ], { mapSize: 1024 });

  scene.render();
  scene.render();

  const viewMatrix = (light as any).getViewMatrix() as import("@babylonjs/core").Matrix;
  let insideDepth = 0;
  let casterCount = 0;
  for (const mesh of scene.meshes)
  {
    if (mesh.getTotalVertices() === 0) { continue; }
    casterCount++;
    const center = mesh.getBoundingInfo().boundingBox.centerWorld;
    const depth = Vector3.TransformCoordinates(center, viewMatrix).z;
    if (depth >= light.shadowMinZ! && depth <= light.shadowMaxZ!)
    {
      insideDepth++;
    }
  }
  console.log(`authored clips [${minZ}, ${maxZ}]: shadowMinZ=${light.shadowMinZ} shadowMaxZ=${light.shadowMaxZ}`
    + ` -> mesh centers inside depth window: ${insideDepth}/${casterCount}`);
  engine.dispose();
}

// e.g. user authored "0.05 .. 500" thinking Blender lamp-relative distances
await CheckAuthoredClips(0.05, 500);
await CheckAuthoredClips(0.05, 100);

// Does the caster-fit depth range (autoCalcShadowZBounds) leave receivers
// (terrain/water) outside [shadowMinZ, shadowMaxZ]? Sweep the sun aim from
// steep to grazing and measure what fraction of the seafloor is clipped.
async function CheckDepthVsAngle(elevationDegrees: number): Promise<void>
{
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("cam", new Vector3(2022, 1444, 921), scene);
  camera.minZ = 0.1;
  camera.maxZ = 10000;
  scene.activeCamera = camera;

  const glbBuffer = readFileSync(GLB_PATH);
  await AppendSceneAsync("data:;base64," + glbBuffer.toString("base64"), scene, { pluginExtension: ".glb" });

  const sunNode = scene.getNodeByName("Sun") as TransformNode;
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const sunEntity = manifest.entities.find((e: any) => e.light?.type === "SUN");
  const light = ApplyBlenderLight(scene, sunNode, sunEntity.light) as DirectionalLight;

  // Override the aim to a controlled elevation above the horizon (azimuth fixed).
  const elevation = (elevationDegrees * Math.PI) / 180;
  light.direction = new Vector3(
    Math.cos(elevation) * -0.9,
    -Math.sin(elevation),
    Math.cos(elevation) * -0.1
  ).normalize();

  SetupShadows(scene, [
    { light, settings: sunEntity.light.shadow, sunAngle: sunEntity.light.sunAngle },
  ], { mapSize: 1024 });

  scene.render();
  scene.render();

  const viewMatrix = (light as any).getViewMatrix() as import("@babylonjs/core").Matrix;
  const oL = light.orthoLeft!, oR = light.orthoRight!, oT = light.orthoTop!, oB = light.orthoBottom!;
  const minZ = light.shadowMinZ!, maxZ = light.shadowMaxZ!;

  let insideRect = 0;
  let clipped = 0;
  for (const meshName of ["Terrain_Surface", "Water"])
  {
    const mesh = scene.getMeshByName(meshName);
    if (mesh === null) { continue; }
    const positions = mesh.getVerticesData("position");
    if (positions === null) { continue; }
    const world = mesh.getWorldMatrix();
    for (let i = 0; i < positions.length; i += 3)
    {
      const worldPos = Vector3.TransformCoordinates(new Vector3(positions[i], positions[i + 1], positions[i + 2]), world);
      const ls = Vector3.TransformCoordinates(worldPos, viewMatrix);
      if (ls.x >= oL && ls.x <= oR && ls.y >= oB && ls.y <= oT)
      {
        insideRect++;
        if (ls.z < minZ || ls.z > maxZ) { clipped++; }
      }
    }
  }
  const pct = insideRect > 0 ? (100 * clipped / insideRect).toFixed(1) : "n/a";
  console.log(`elevation ${elevationDegrees.toString().padStart(2)}deg: depth [${minZ.toFixed(0)}, ${maxZ.toFixed(0)}]`
    + ` receiver verts under casters=${insideRect}, clipped by depth=${clipped} (${pct}%)`);
  engine.dispose();
}

console.log("--- depth clipping vs sun elevation ---");
await CheckDepthVsAngle(60);
await CheckDepthVsAngle(30);
await CheckDepthVsAngle(15);
await CheckDepthVsAngle(5);
