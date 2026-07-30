/**
 * Custom-property / glTF-extras key holding each entity's GUID. Must match
 * the Blender add-on's ID_KEY. Surfaces at node.metadata.gltf.extras[ID_KEY].
 */
export const ID_KEY = "bjs_id";

/** glTF extras key for viewport-hidden objects. Must match the Blender add-on's VISIBLE_KEY. */
export const VISIBLE_KEY = "bjs_visible";

/** glTF extras key when ray-visibility Shadow is off. Must match CAST_SHADOWS_KEY in the add-on. */
export const CAST_SHADOWS_KEY = "bjs_cast_shadows";
