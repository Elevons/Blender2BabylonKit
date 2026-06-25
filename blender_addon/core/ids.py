"""Stable per-object GUIDs — the entity identity system.

Each exported object carries a GUID in a dict-style custom property
(obj["bjs_id"]) specifically so that the glTF exporter writes it into the
node's `extras` (registered RNA props are NOT exported). On the Babylon side
it surfaces at node.metadata.gltf.extras.bjs_id, which is how the runtime
matches manifest entities back to glTF nodes.
"""

import uuid

# Custom-property key under which each object's stable GUID is stored.
ID_KEY = "bjs_id"

# glTF extras key for viewport-hidden objects (eye icon). Render-disabled objects
# are omitted from the export entirely; this only marks exported objects that
# should start invisible in Babylon. Stored as int 0 at export (bool false is
# dropped by some glTF exporter versions).
VISIBLE_KEY = "bjs_visible"

# glTF extras key for objects with ray-visibility Shadow disabled. Meshes still
# receive shadows; they are omitted from ShadowGenerator casters at load.
CAST_SHADOWS_KEY = "bjs_cast_shadows"


def ensure_object_id(obj):
    """Return obj's GUID, generating and storing one if it doesn't have it yet."""
    current = obj.get(ID_KEY)
    if not current:
        current = uuid.uuid4().hex
        obj[ID_KEY] = current
    return current
