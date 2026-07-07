// Headless repro: does a far-away Blender sun still produce a valid shadow frustum
// after the engine's bake + anchor pipeline?
import {
  NullEngine,
  Scene,
  FreeCamera,
  Vector3,
  TransformNode,
  DirectionalLight,
  MeshBuilder,
  ShadowGenerator,
  Quaternion,
} from "@babylonjs/core";

function BuildScene(sunParentPosition)
{
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("cam", new Vector3(0, 5, -20), scene);
  camera.minZ = 0.1;
  camera.maxZ = 1000;
  scene.activeCamera = camera;

  // Geometry: ground + boxes spread over ~100 units
  const ground = MeshBuilder.CreateGround("ground", { width: 200, height: 200 }, scene);
  const casters = [];
  for (let i = 0; i < 5; i++)
  {
    const box = MeshBuilder.CreateBox("box" + i, { size: 2 }, scene);
    box.position.set(i * 20 - 40, 1, i * 10 - 20);
    casters.push(box);
  }

  // Mimic glTF import: sun lamp node far away, light parented with local -Z aim,
  // node rotated to aim down at ~45 degrees.
  const sunNode = new TransformNode("SunNode", scene);
  sunNode.position.copyFrom(sunParentPosition);
  sunNode.rotationQuaternion = Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI / 4 + Math.PI / 2);

  const light = new DirectionalLight("Sun", new Vector3(0, 0, -1), scene);
  light.parent = sunNode;
  light.position.set(0, 0, 0);

  // --- lights.ts BakeSunLightWorldTransform ---
  if (light.computeTransformedInformation())
  {
    light.direction.copyFrom(light.transformedDirection);
    light.parent = null;
    light.position.copyFrom(light.direction).scaleInPlace(-1);
  }

  // --- shadows.ts AnchorDirectionalShadowOrigin (bounds center of casters) ---
  const min = new Vector3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
  const max = min.scale(-1);
  for (const mesh of [...casters, ground])
  {
    mesh.computeWorldMatrix(true);
    const bb = mesh.getBoundingInfo().boundingBox;
    min.minimizeInPlace(bb.minimumWorld);
    max.maximizeInPlace(bb.maximumWorld);
  }
  const center = min.add(max).scale(0.5);
  light.position.copyFrom(center.subtract(light.direction));
  light.forceProjectionMatrixCompute();
  light.autoCalcShadowZBounds = true;

  const gen = new ShadowGenerator(1024, light);
  gen.useContactHardeningShadow = true;
  gen.contactHardeningLightSizeUVRatio = 0.022;
  gen.normalBias = 0.02;
  for (const mesh of [...casters, ground])
  {
    gen.addShadowCaster(mesh);
  }
  for (const mesh of scene.meshes)
  {
    mesh.receiveShadows = true;
  }

  scene.render();
  scene.render();

  return { engine, scene, light, gen, casters, ground };
}

function CheckCoverage(label, sunPos)
{
  const { engine, light, gen, casters, ground } = BuildScene(sunPos);
  const transform = gen.getTransformMatrix();

  let allInside = true;
  for (const mesh of [...casters, ground])
  {
    const bb = mesh.getBoundingInfo().boundingBox;
    for (const corner of bb.vectorsWorld)
    {
      const projected = Vector3.TransformCoordinates(corner, transform);
      const inside =
        Math.abs(projected.x) <= 1.001 &&
        Math.abs(projected.y) <= 1.001 &&
        projected.z >= -0.001 && projected.z <= 1.001;
      if (!inside)
      {
        allInside = false;
        console.log(`  ${label}: ${mesh.name} corner OUT -> ndc (${projected.x.toFixed(3)}, ${projected.y.toFixed(3)}, ${projected.z.toFixed(3)})`);
      }
    }
  }

  console.log(`${label}: light.pos=(${light.position.x.toFixed(1)},${light.position.y.toFixed(1)},${light.position.z.toFixed(1)})`
    + ` dir=(${light.direction.x.toFixed(2)},${light.direction.y.toFixed(2)},${light.direction.z.toFixed(2)})`
    + ` shadowMinZ=${light.shadowMinZ?.toFixed(2)} shadowMaxZ=${light.shadowMaxZ?.toFixed(2)}`
    + ` ortho L/R=${light.orthoLeft?.toFixed(1)}/${light.orthoRight?.toFixed(1)}`
    + ` => ${allInside ? "ALL CASTERS COVERED" : "CUT OFF"}`);

  engine.dispose();
}

CheckCoverage("near sun (0, 30, 0)   ", new Vector3(0, 30, 0));
CheckCoverage("far sun (500, 800, -300)", new Vector3(500, 800, -300));
CheckCoverage("very far (5e3, 8e3, -3e3)", new Vector3(5000, 8000, -3000));
