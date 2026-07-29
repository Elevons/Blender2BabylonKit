import type { Geometry } from "@babylonjs/core/Meshes/geometry";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import {
  ArrayItem,
  GLTFLoader,
  type IGLTFLoaderExtension,
  type IMeshPrimitive,
} from "@babylonjs/loaders/glTF/2.0";
import { registerGLTFExtension } from "@babylonjs/loaders/glTF/2.0/glTFLoaderExtensionRegistry";

const EXTENSION_NAME = "bjs_extra_vertex_colors";

/**
 * Babylon's glTF loader only maps COLOR_0 → ColorKind and drops COLOR_1+.
 * Blender often invents an all-white COLOR_0 (so materials stay untinted) and
 * puts the real painted attribute in COLOR_1 when "Export all vertex colors"
 * is on. This extension loads COLOR_1, COLOR_2, … onto the geometry under the
 * same kind names so behaviors can read them via getVerticesData("COLOR_1").
 */
class ExtraVertexColorsExtension implements IGLTFLoaderExtension
{
  readonly name = EXTENSION_NAME;
  enabled = true;

  private readonly loader: GLTFLoader;
  /** Primitives currently wrapped so the recursive default load falls through. */
  private readonly wrappingPrimitives = new Set<IMeshPrimitive>();

  constructor(loader: GLTFLoader)
  {
    this.loader = loader;
  }

  dispose(): void
  {
    this.wrappingPrimitives.clear();
  }

  /**
   * Run the default vertex-data load, then attach any extra COLOR_n sets.
   * Returning null would skip us; returning a promise replaces the default —
   * so we re-enter with a per-primitive guard and fall through to default.
   */
  _loadVertexDataAsync(
    context: string,
    primitive: IMeshPrimitive,
    babylonMesh: Mesh
  ): Promise<Geometry> | null
  {
    if (this.wrappingPrimitives.has(primitive))
    {
      return null;
    }

    this.wrappingPrimitives.add(primitive);

    // _loadVertexDataAsync is private in the public d.ts but callable from
    // extensions (Babylon's own extensions use the same re-entry pattern).
    const loadVertexData = (
      this.loader as unknown as {
        _loadVertexDataAsync(
          context: string,
          primitive: IMeshPrimitive,
          babylonMesh: Mesh
        ): Promise<Geometry>;
      }
    )._loadVertexDataAsync.bind(this.loader);

    let geometryPromise: Promise<Geometry>;
    try
    {
      geometryPromise = loadVertexData(context, primitive, babylonMesh);
    }
    catch (error)
    {
      this.wrappingPrimitives.delete(primitive);
      throw error;
    }

    return geometryPromise
      .then(async (geometry) =>
      {
        await this.AttachExtraColorSets(context, primitive, babylonMesh, geometry);
        return geometry;
      })
      .finally(() =>
      {
        this.wrappingPrimitives.delete(primitive);
      });
  }

  /** Load COLOR_1+ accessors onto the geometry under matching kind names. */
  private async AttachExtraColorSets(
    context: string,
    primitive: IMeshPrimitive,
    babylonMesh: Mesh,
    geometry: Geometry
  ): Promise<void>
  {
    const attributes = primitive.attributes;
    if (attributes === undefined || attributes === null)
    {
      return;
    }

    const loadPromises: Promise<void>[] = [];

    for (const attributeName of Object.keys(attributes))
    {
      const colorMatch = /^COLOR_([1-9]\d*)$/.exec(attributeName);
      if (colorMatch === null)
      {
        continue;
      }

      const accessorIndex = attributes[attributeName];
      if (typeof accessorIndex !== "number")
      {
        continue;
      }

      const accessor = ArrayItem.Get(
        `${context}/attributes/${attributeName}`,
        this.loader.gltf.accessors,
        accessorIndex
      );

      // Mirror the stock COLOR_0 path: mark the kind for delayed creation.
      const meshWithDelay = babylonMesh as Mesh & { _delayInfo?: string[] };
      meshWithDelay._delayInfo = meshWithDelay._delayInfo ?? [];
      if (meshWithDelay._delayInfo.indexOf(attributeName) === -1)
      {
        meshWithDelay._delayInfo.push(attributeName);
      }

      loadPromises.push(
        this.loader
          ._loadVertexAccessorAsync(`/accessors/${accessor.index}`, accessor, attributeName)
          .then((vertexBuffer) =>
          {
            geometry.setVerticesBuffer(vertexBuffer);
          })
      );
    }

    if (loadPromises.length > 0)
    {
      await Promise.all(loadPromises);
    }
  }
}

let registered = false;

/** Register once — safe to call from LevelLoader on every import. */
export function RegisterExtraVertexColorsExtension(): void
{
  if (registered)
  {
    return;
  }

  registered = true;
  registerGLTFExtension(EXTENSION_NAME, false, (loader) =>
  {
    return new ExtraVertexColorsExtension(loader);
  });
}
