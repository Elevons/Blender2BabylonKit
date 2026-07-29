"""
Populate Prefabs Bake — standalone Blender Text Editor script
=============================================================

Mirrors the runtime PopulatePrefabs behavior (paint-scatter on a mesh), then
lets you freeze and merge in Blender with explicit buttons. Nothing runs until
you click.

How to use
----------
1. Open this file in Blender's Text Editor (or paste it) and press Run Script.
2. In the 3D Viewport, open the N-panel → tab "BJS Bake".
3. Set Target, Prefabs (selected objects → Add Selected Prefabs), Instance Count,
   paint settings.
4. Click Scatter (default mode bakes straight into merged mesh(es) — fast).
5. If you used Instances mode: Strip LODs → Freeze → Merge Selected.

Scatter modes
-------------
- Baked (recommended): appends transformed geometry into one mesh per material.
  No thousands of objects; UVs preserved. Skip Freeze/Merge afterward.
- Instances: creates lightweight objects that *share* mesh data (no per-instance
  mesh copy). Use when you still want editable individuals before merging.
"""

from __future__ import annotations

import math
import random
from mathutils import Matrix, Quaternion, Vector

import bpy
from bpy.props import (
    BoolProperty,
    EnumProperty,
    FloatProperty,
    IntProperty,
    PointerProperty,
    StringProperty,
)
from bpy.types import Operator, Panel, PropertyGroup


# ---------------------------------------------------------------------------
# Helpers — paint surface sampling (mirrors populateprefabs.ts)
# ---------------------------------------------------------------------------

def _luminance(color) -> float:
    return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]


def _color_variance(colors: list) -> float:
    if not colors:
        return 0.0
    total = 0.0
    for color in colors:
        red_delta = 1.0 - color[0]
        green_delta = 1.0 - color[1]
        blue_delta = 1.0 - color[2]
        total += red_delta * red_delta + green_delta * green_delta + blue_delta * blue_delta
    return total / len(colors)


def _is_uniform_near_white(colors: list) -> bool:
    if not colors:
        return False
    for color in colors:
        if color[0] < 0.99 or color[1] < 0.99 or color[2] < 0.99:
            return False
    return True


def _pick_color_attribute(mesh, preferred_name: str):
    """Return (attribute, domain) or (None, None). Prefers named attr, else most varied."""
    attrs = list(getattr(mesh, "color_attributes", []) or [])
    if not attrs:
        # Older Blender / vertex_colors fallback
        vcols = getattr(mesh, "vertex_colors", None)
        if vcols is not None and len(vcols) > 0:
            # Treat as corner domain via loops
            return vcols.active if vcols.active else vcols[0], "CORNER"
        return None, None

    preferred = preferred_name.strip()
    if preferred:
        for attr in attrs:
            if attr.name == preferred:
                return attr, attr.domain
        # Soft match
        for attr in attrs:
            if preferred.lower() in attr.name.lower():
                return attr, attr.domain

    best = None
    best_var = -1.0
    for attr in attrs:
        samples = _sample_all_attr_colors(mesh, attr)
        variance = _color_variance(samples)
        if variance > best_var:
            best_var = variance
            best = attr
    if best is None:
        return None, None
    return best, best.domain


def _sample_all_attr_colors(mesh, attr) -> list:
    colors = []
    data = attr.data
    for index in range(len(data)):
        item = data[index]
        color = getattr(item, "color", None)
        if color is None:
            color = getattr(item, "color_srgb", None)
        if color is not None:
            colors.append((color[0], color[1], color[2]))
    return colors


def _vertex_color(mesh, attr, domain, vertex_index: int, loop_indices_for_vert: dict):
    """Average color for a vertex (POINT domain = direct; CORNER = avg of loops)."""
    data = attr.data
    if domain == "POINT":
        item = data[vertex_index]
        color = getattr(item, "color", None) or item.color_srgb
        return Vector((color[0], color[1], color[2]))

    # CORNER / vertex_colors: average loops that touch this vertex
    loops = loop_indices_for_vert.get(vertex_index, [])
    if not loops:
        return Vector((1.0, 1.0, 1.0))
    accum = Vector((0.0, 0.0, 0.0))
    for loop_index in loops:
        item = data[loop_index]
        color = getattr(item, "color", None) or item.color_srgb
        accum += Vector((color[0], color[1], color[2]))
    return accum / len(loops)


def _build_loop_map(mesh) -> dict:
    mapping = {}
    for loop in mesh.loops:
        mapping.setdefault(loop.vertex_index, []).append(loop.index)
    return mapping


def _build_painted_sampler(obj, color_name: str, paint_threshold: float):
    """Area-weighted sampler of painted triangles. Returns (sample_fn, triangle_count) or (None, msg)."""
    if obj is None or obj.type != "MESH":
        return None, "Target must be a mesh object"

    mesh = obj.data
    attr, domain = _pick_color_attribute(mesh, color_name)
    if attr is None:
        return None, f'No color attribute on "{obj.name}" — paint a Color Attribute first'

    all_colors = _sample_all_attr_colors(mesh, attr)
    if _is_uniform_near_white(all_colors):
        return None, (
            f'Color attribute "{attr.name}" on "{obj.name}" is uniform white '
            "(likely Blender's placeholder). Paint real colors or pick another attribute."
        )

    loop_map = _build_loop_map(mesh) if domain != "POINT" else {}
    world = obj.matrix_world
    triangles = []
    total_area = 0.0

    mesh.calc_loop_triangles()
    for tri in mesh.loop_triangles:
        indices = list(tri.vertices)
        if len(indices) != 3:
            continue

        colors = [
            _vertex_color(mesh, attr, domain, indices[0], loop_map),
            _vertex_color(mesh, attr, domain, indices[1], loop_map),
            _vertex_color(mesh, attr, domain, indices[2], loop_map),
        ]
        average_luminance = sum(_luminance(color) for color in colors) / 3.0
        if average_luminance < paint_threshold:
            continue

        corners = [world @ mesh.vertices[index].co.copy() for index in indices]
        edge_ab = corners[1] - corners[0]
        edge_ac = corners[2] - corners[0]
        cross = edge_ab.cross(edge_ac)
        area = cross.length * 0.5
        if area <= 0.0:
            continue

        normals = []
        for index in indices:
            local_normal = mesh.vertices[index].normal
            normals.append((world.to_3x3() @ local_normal).normalized())

        total_area += area
        triangles.append({
            "cumulative": total_area,
            "corners": corners,
            "normals": normals,
        })

    if not triangles or total_area <= 0.0:
        return None, (
            f'No painted triangles on "{obj.name}" '
            f'(attribute "{attr.name}", luminance >= {paint_threshold:.2f})'
        )

    def sample():
        target_area = random.random() * total_area
        low = 0
        high = len(triangles) - 1
        while low < high:
            mid = (low + high) // 2
            if triangles[mid]["cumulative"] < target_area:
                low = mid + 1
            else:
                high = mid
        tri = triangles[low]
        weight_b = random.random()
        weight_c = random.random()
        if weight_b + weight_c > 1.0:
            weight_b = 1.0 - weight_b
            weight_c = 1.0 - weight_c
        weight_a = 1.0 - weight_b - weight_c
        position = (
            tri["corners"][0] * weight_a
            + tri["corners"][1] * weight_b
            + tri["corners"][2] * weight_c
        )
        normal = (
            tri["normals"][0] * weight_a
            + tri["normals"][1] * weight_b
            + tri["normals"][2] * weight_c
        ).normalized()
        return position, normal

    return sample, f'{len(triangles)} painted tris · attr "{attr.name}"'


def _rotation_align_up_to_normal(normal: Vector, yaw_range_deg: float) -> Quaternion:
    up = Vector((0.0, 0.0, 1.0))
    # Blender Z-up; populateprefabs.ts uses Y-up Babylon. Align local +Z to surface normal.
    rotation = Quaternion()
    dot = up.dot(normal)
    if abs(dot) < 0.999:
        axis = up.cross(normal).normalized()
        angle = math.acos(max(-1.0, min(1.0, dot)))
        rotation = Quaternion(axis, angle)

    if yaw_range_deg > 0.0:
        yaw = ((random.random() * 2.0 - 1.0) * yaw_range_deg) * math.pi / 180.0
        yaw_rotation = Quaternion(normal, yaw)
        rotation = yaw_rotation @ rotation

    return rotation


def _ensure_scatter_collection(context) -> bpy.types.Collection:
    name = "BJS_Scattered"
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        context.scene.collection.children.link(collection)
    return collection


def _is_lod_object(obj) -> bool:
    name_upper = obj.name.upper()
    if "_LOD" in name_upper or name_upper.endswith("LOD"):
        return True
    # Mesh-only targets often have no components; name heuristic is primary.
    return False


def _has_lod_component(obj) -> bool:
    for component in getattr(obj, "bjs_components", []):
        if getattr(component, "comp_type", "") == "LOD":
            return True
    return False


def _collect_hierarchy(root) -> list:
    return [root] + list(root.children_recursive)


def _link_orphans_into(collection, root) -> int:
    """Link hierarchy objects that belong to no collection (common for linked
    prefab LOD children). Returns how many were linked."""
    linked_count = 0
    for obj in _collect_hierarchy(root):
        if len(obj.users_collection) == 0:
            collection.objects.link(obj)
            linked_count += 1
    return linked_count


def _iter_prefab_meshes(root, skip_lods: bool):
    """Yield mesh objects under a prefab root (optionally skipping _LOD*)."""
    _link_orphans_into(bpy.context.scene.collection, root)
    for obj in _collect_hierarchy(root):
        if obj.type != "MESH" or obj.data is None:
            continue
        if skip_lods and obj is not root and _is_lod_object(obj):
            continue
        if skip_lods and obj is root and _is_lod_object(obj):
            # Unusual: root itself named as LOD — still allow it.
            pass
        yield obj


def _extract_mesh_part(root, mesh_obj):
    """Pack one mesh into root-local geometry + UVs for fast baking."""
    mesh = mesh_obj.data
    root_inverse = root.matrix_world.inverted()
    local_to_root = root_inverse @ mesh_obj.matrix_world

    verts = [local_to_root @ vertex.co for vertex in mesh.vertices]
    faces = [tuple(poly.vertices) for poly in mesh.polygons]
    if not verts or not faces:
        return None

    material_indices = [poly.material_index for poly in mesh.polygons]
    materials = [slot.material for slot in mesh_obj.material_slots]

    # Loop UVs in polygon-winding order (matches from_pydata loop order).
    loop_uvs = None
    if mesh.uv_layers:
        uv_layer = mesh.uv_layers.active or mesh.uv_layers[0]
        loop_uvs = [tuple(uv_layer.data[loop.index].uv) for loop in mesh.loops]

    # Shared datablock for Instances mode (no per-instance data.copy).
    return {
        "name": mesh_obj.name,
        "verts": verts,
        "faces": faces,
        "material_indices": material_indices,
        "materials": materials,
        "loop_uvs": loop_uvs,
        "mesh_data": mesh,
        "local_to_root": local_to_root,
    }


def _build_prefab_templates(prefabs: list, skip_lods: bool) -> dict:
    """One-time cache: prefab root → list of mesh parts."""
    templates = {}
    for root in prefabs:
        parts = []
        for mesh_obj in _iter_prefab_meshes(root, skip_lods):
            part = _extract_mesh_part(root, mesh_obj)
            if part is not None:
                parts.append(part)
        templates[root] = parts
    return templates


def _instance_matrix(position: Vector, rotation: Quaternion, scale: Vector) -> Matrix:
    return Matrix.LocRotScale(position, rotation, scale)


def _material_bucket_key(part) -> str:
    for material in part["materials"]:
        if material is not None:
            return material.name
    return "_no_material"


class _BakeBucket:
    """Accumulates transformed geometry for one output mesh."""

    __slots__ = ("verts", "faces", "material_indices", "loop_uvs", "materials", "mat_lookup")

    def __init__(self):
        self.verts = []
        self.faces = []
        self.material_indices = []
        self.loop_uvs = []
        self.materials = []
        self.mat_lookup = {}

    def _slot_for(self, material) -> int:
        key = material.name if material is not None else None
        if key in self.mat_lookup:
            return self.mat_lookup[key]
        index = len(self.materials)
        self.materials.append(material)
        self.mat_lookup[key] = index
        return index

    def append_part(self, part, transform: Matrix) -> None:
        offset = len(self.verts)
        self.verts.extend(transform @ coordinate for coordinate in part["verts"])

        slot_remap = [
            self._slot_for(material) for material in part["materials"]
        ] if part["materials"] else [self._slot_for(None)]

        for face_index, face in enumerate(part["faces"]):
            self.faces.append(tuple(vertex_index + offset for vertex_index in face))
            source_slot = part["material_indices"][face_index] if part["material_indices"] else 0
            if source_slot >= len(slot_remap):
                source_slot = 0
            self.material_indices.append(slot_remap[source_slot])

        if part["loop_uvs"] is not None:
            self.loop_uvs.extend(part["loop_uvs"])

    def build_object(self, name: str, collection) -> bpy.types.Object | None:
        if not self.verts or not self.faces:
            return None

        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.verts, [], self.faces)
        mesh.update()

        if self.materials:
            for material in self.materials:
                mesh.materials.append(material)
            if len(mesh.polygons) == len(self.material_indices):
                mesh.polygons.foreach_set("material_index", self.material_indices)

        if self.loop_uvs and len(self.loop_uvs) == len(mesh.loops):
            uv_layer = mesh.uv_layers.new(name="UVMap")
            for loop_index, uv_coordinate in enumerate(self.loop_uvs):
                uv_layer.data[loop_index].uv = uv_coordinate

        try:
            mesh.calc_normals()
        except Exception:
            pass

        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        obj["bjs_scatter_batch"] = True
        return obj


def _scatter_baked(
    templates: dict,
    prefabs: list,
    used: set,
    instance_count: int,
    sample,
    random_yaw: float,
    scale_jitter: float,
    merge_mode: str,
    collection,
    parent,
) -> tuple[int, list]:
    """Bake all instances into few mesh objects. Returns (placed, objects)."""
    if merge_mode == "ONE":
        buckets = {"_all": _BakeBucket()}
    else:
        buckets = {}

    window = bpy.context.window_manager
    window.progress_begin(0, instance_count)
    placed = 0

    for index in range(instance_count):
        template = random.choice(prefabs)
        used.add(template)
        parts = templates.get(template) or []
        if not parts:
            window.progress_update(index + 1)
            continue

        position, normal = sample()
        rotation = _rotation_align_up_to_normal(normal, random_yaw)
        scale_factor = 1.0
        if scale_jitter > 0.0:
            scale_factor = 1.0 + (random.random() * 2.0 - 1.0) * scale_jitter
        transform = _instance_matrix(position, rotation, Vector((scale_factor, scale_factor, scale_factor)))

        for part in parts:
            if merge_mode == "ONE":
                bucket = buckets["_all"]
            else:
                key = _material_bucket_key(part)
                bucket = buckets.get(key)
                if bucket is None:
                    bucket = _BakeBucket()
                    buckets[key] = bucket
            bucket.append_part(part, transform)

        placed += 1
        if (index & 63) == 0:
            window.progress_update(index + 1)

    window.progress_end()

    created_objects = []
    if merge_mode == "ONE":
        obj = buckets["_all"].build_object("BJS_MergedScatter", collection)
        if obj is not None:
            created_objects.append(obj)
    else:
        for material_name, bucket in buckets.items():
            safe = material_name.replace(".", "_")[:40]
            obj = bucket.build_object(f"BJS_Merged_{safe}", collection)
            if obj is not None:
                created_objects.append(obj)

    if parent is not None:
        parent_inverse = parent.matrix_world.inverted()
        for obj in created_objects:
            world_matrix = obj.matrix_world.copy()
            obj.parent = parent
            obj.matrix_parent_inverse = parent_inverse
            obj.matrix_world = world_matrix

    return placed, created_objects


def _scatter_instances(
    templates: dict,
    prefabs: list,
    instance_count: int,
    sample,
    random_yaw: float,
    scale_jitter: float,
    collection,
    parent,
    used: set,
) -> tuple[int, int]:
    """Create lightweight objects that share mesh datablocks. Returns (created, mesh_count)."""
    window = bpy.context.window_manager
    window.progress_begin(0, instance_count)
    created = 0
    mesh_count = 0
    parent_inverse = parent.matrix_world.inverted() if parent is not None else None

    for index in range(instance_count):
        template = random.choice(prefabs)
        used.add(template)
        parts = templates.get(template) or []
        if not parts:
            window.progress_update(index + 1)
            continue

        position, normal = sample()
        rotation = _rotation_align_up_to_normal(normal, random_yaw)
        scale_factor = 1.0
        if scale_jitter > 0.0:
            scale_factor = 1.0 + (random.random() * 2.0 - 1.0) * scale_jitter
        root_matrix = _instance_matrix(position, rotation, Vector((scale_factor, scale_factor, scale_factor)))

        for part in parts:
            # Share the source mesh datablock — Freeze/Merge make it unique later.
            obj = bpy.data.objects.new(f"{part['name']}_scatter", part["mesh_data"])
            collection.objects.link(obj)
            obj["bjs_scatter_batch"] = True
            obj.matrix_world = root_matrix @ part["local_to_root"]
            if parent is not None:
                world_matrix = obj.matrix_world.copy()
                obj.parent = parent
                obj.matrix_parent_inverse = parent_inverse
                obj.matrix_world = world_matrix
            mesh_count += 1

        created += 1
        if (index & 63) == 0:
            window.progress_update(index + 1)

    window.progress_end()
    return created, mesh_count


def _read_prefab_list(settings) -> list:
    prefabs = []
    for item in settings.prefabs:
        if item.object is not None:
            prefabs.append(item.object)
    return prefabs


# ---------------------------------------------------------------------------
# Property groups
# ---------------------------------------------------------------------------

class BJS_PG_bake_prefab_item(PropertyGroup):
    object: PointerProperty(name="Prefab", type=bpy.types.Object)


class BJS_PG_bake_settings(PropertyGroup):
    target: PointerProperty(
        name="Target Mesh",
        type=bpy.types.Object,
        description="Painted mesh to scatter on (uses Color Attributes)",
    )
    color_attribute: StringProperty(
        name="Color Attribute",
        description="Leave blank to auto-pick the most varied Color Attribute",
        default="",
    )
    paint_threshold: FloatProperty(
        name="Paint Threshold",
        description="Minimum RGB luminance (0–1) to count a triangle as painted",
        default=0.5,
        min=0.0,
        max=1.0,
        step=0.05,
    )
    instance_count: IntProperty(
        name="Instance Count",
        default=100,
        min=1,
        soft_max=5000,
    )
    random_yaw: FloatProperty(
        name="Random Yaw (deg)",
        default=0.0,
        min=0.0,
        max=360.0,
    )
    scale_jitter: FloatProperty(
        name="Scale Jitter",
        description="0 = none; 0.2 = ±20% uniform scale",
        default=0.0,
        min=0.0,
        max=1.0,
    )
    parent_to_target: BoolProperty(
        name="Parent to Target",
        default=True,
    )
    hide_originals: BoolProperty(
        name="Hide Original Prefabs",
        default=True,
    )
    strip_lods_on_scatter: BoolProperty(
        name="Strip LODs When Scattering",
        description="Ignore _LOD* meshes when caching prefab geometry",
        default=True,
    )
    scatter_mode: EnumProperty(
        name="Scatter Mode",
        items=(
            (
                "BAKED",
                "Baked (fast)",
                "Write transformed geometry into merged mesh(es). Best for large counts.",
            ),
            (
                "INSTANCES",
                "Instances",
                "Create objects that share mesh data (no geometry copy). Merge later.",
            ),
        ),
        default="BAKED",
    )
    merge_mode: EnumProperty(
        name="Merge Mode",
        items=(
            ("ONE", "One Mesh", "Join all geometry into a single object"),
            ("PER_MATERIAL", "Per Material", "One mesh per material name"),
        ),
        default="PER_MATERIAL",
    )
    prefabs: bpy.props.CollectionProperty(type=BJS_PG_bake_prefab_item)
    status: StringProperty(name="Status", default="")


# ---------------------------------------------------------------------------
# Operators
# ---------------------------------------------------------------------------

class BJS_OT_bake_add_selected_prefabs(Operator):
    bl_idname = "bjs_bake.add_selected_prefabs"
    bl_label = "Add Selected Prefabs"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        settings = context.scene.bjs_bake
        existing = {item.object for item in settings.prefabs if item.object is not None}
        added = 0
        for obj in context.selected_objects:
            if obj in existing:
                continue
            item = settings.prefabs.add()
            item.object = obj
            added += 1
        settings.status = f"Added {added} prefab(s)"
        return {"FINISHED"}


class BJS_OT_bake_clear_prefabs(Operator):
    bl_idname = "bjs_bake.clear_prefabs"
    bl_label = "Clear Prefab List"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        context.scene.bjs_bake.prefabs.clear()
        context.scene.bjs_bake.status = "Prefab list cleared"
        return {"FINISHED"}


class BJS_OT_bake_remove_prefab(Operator):
    bl_idname = "bjs_bake.remove_prefab"
    bl_label = "Remove Prefab"
    bl_options = {"REGISTER", "UNDO"}

    index: IntProperty()

    def execute(self, context):
        settings = context.scene.bjs_bake
        if 0 <= self.index < len(settings.prefabs):
            settings.prefabs.remove(self.index)
        return {"FINISHED"}


class BJS_OT_bake_scatter(Operator):
    bl_idname = "bjs_bake.scatter"
    bl_label = "Scatter"
    bl_description = "Scatter prefabs onto painted triangles (baked or shared-mesh instances)"
    # No UNDO — storing thousands of creates in the undo stack is extremely expensive.
    bl_options = {"REGISTER"}

    def execute(self, context):
        settings = context.scene.bjs_bake
        prefabs = _read_prefab_list(settings)
        if settings.target is None:
            self.report({"ERROR"}, "Set a Target Mesh")
            return {"CANCELLED"}
        if not prefabs:
            self.report({"ERROR"}, "Add at least one Prefab (select roots → Add Selected Prefabs)")
            return {"CANCELLED"}

        sample, info = _build_painted_sampler(
            settings.target,
            settings.color_attribute,
            settings.paint_threshold,
        )
        if sample is None:
            self.report({"ERROR"}, info)
            settings.status = info
            return {"CANCELLED"}

        # Cache mesh parts once — the old path deep-copied mesh data per instance.
        templates = _build_prefab_templates(prefabs, settings.strip_lods_on_scatter)
        live_prefabs = [root for root in prefabs if templates.get(root)]
        if not live_prefabs:
            message = "No usable mesh geometry on the prefab list (check LOD strip / mesh types)"
            settings.status = message
            self.report({"ERROR"}, message)
            return {"CANCELLED"}

        collection = _ensure_scatter_collection(context)
        was_hidden = collection.hide_viewport
        collection.hide_viewport = True

        parent = settings.target if settings.parent_to_target else None
        used = set()

        try:
            if settings.scatter_mode == "BAKED":
                count, objects = _scatter_baked(
                    templates,
                    live_prefabs,
                    used,
                    settings.instance_count,
                    sample,
                    settings.random_yaw,
                    settings.scale_jitter,
                    settings.merge_mode,
                    collection,
                    parent,
                )
                message = (
                    f"Baked {count} instance(s) → {len(objects)} mesh(es) in "
                    f"'{collection.name}' · {info}"
                )
            else:
                created, mesh_count = _scatter_instances(
                    templates,
                    live_prefabs,
                    settings.instance_count,
                    sample,
                    settings.random_yaw,
                    settings.scale_jitter,
                    collection,
                    parent,
                    used,
                )
                message = (
                    f"Scattered {created} instance(s) as {mesh_count} shared-mesh "
                    f"object(s) in '{collection.name}' · {info}"
                )
        finally:
            collection.hide_viewport = was_hidden

        if settings.hide_originals:
            for template in used:
                template.hide_set(True)
                template.hide_render = True
                for child in template.children_recursive:
                    child.hide_set(True)
                    child.hide_render = True

        settings.status = message
        self.report({"INFO"}, message)
        return {"FINISHED"}


def _strip_lods_under(root) -> int:
    """Delete LOD children and clear LOD components. Returns deleted object count."""
    deleted = 0
    # Clear LOD component on root (and any descendants that have one)
    for obj in _collect_hierarchy(root):
        components = getattr(obj, "bjs_components", None)
        if components is None:
            continue
        # Remove LOD rows from the end to keep indices stable
        for index in range(len(components) - 1, -1, -1):
            if components[index].comp_type == "LOD":
                components.remove(index)

    to_delete = [
        child for child in list(root.children_recursive)
        if _is_lod_object(child)
    ]
    for obj in to_delete:
        bpy.data.objects.remove(obj, do_unlink=True)
        deleted += 1
    return deleted


class BJS_OT_bake_strip_lods(Operator):
    bl_idname = "bjs_bake.strip_lods"
    bl_label = "Strip LODs (Selected)"
    bl_description = "Delete _LOD* children and remove LOD components on selection"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        roots = list(context.selected_objects)
        if not roots:
            self.report({"ERROR"}, "Select scattered roots (or anything with LOD children)")
            return {"CANCELLED"}
        deleted = 0
        for root in roots:
            deleted += _strip_lods_under(root)
        message = f"Stripped LODs — deleted {deleted} object(s)"
        context.scene.bjs_bake.status = message
        self.report({"INFO"}, message)
        return {"FINISHED"}


class BJS_OT_bake_select_scattered(Operator):
    bl_idname = "bjs_bake.select_scattered"
    bl_label = "Select Scattered"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        collection = bpy.data.collections.get("BJS_Scattered")
        bpy.ops.object.select_all(action="DESELECT")
        count = 0
        if collection is not None:
            for obj in collection.objects:
                if obj.parent is None or obj.parent.name not in collection.objects:
                    # Select roots in the collection
                    obj.select_set(True)
                    count += 1
                    context.view_layer.objects.active = obj
        # Also tag-based
        for obj in context.scene.objects:
            if obj.get("bjs_scatter_batch") and (obj.parent is None or not obj.parent.get("bjs_scatter_batch")):
                obj.select_set(True)
                count += 1
        context.scene.bjs_bake.status = f"Selected {count} scattered root(s)"
        return {"FINISHED"}


class BJS_OT_bake_freeze(Operator):
    bl_idname = "bjs_bake.freeze"
    bl_label = "Freeze (Single-User + Apply Transforms)"
    bl_description = "Make mesh data single-user and apply location/rotation/scale on selection"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        selected = [obj for obj in context.selected_objects if obj.type == "MESH"]
        if not selected:
            # Include mesh children of selected roots
            for root in context.selected_objects:
                for child in root.children_recursive:
                    if child.type == "MESH":
                        selected.append(child)
            selected = list(dict.fromkeys(selected))

        if not selected:
            self.report({"ERROR"}, "Select mesh objects (or scattered roots) to freeze")
            return {"CANCELLED"}

        bpy.ops.object.select_all(action="DESELECT")
        for obj in selected:
            obj.select_set(True)
        context.view_layer.objects.active = selected[0]

        try:
            bpy.ops.object.make_single_user(type="SELECTED_OBJECTS", object=True, obdata=True)
        except Exception as error:
            self.report({"WARNING"}, f"make_single_user: {error}")

        try:
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        except Exception as error:
            self.report({"WARNING"}, f"transform_apply: {error}")

        message = f"Froze {len(selected)} mesh object(s)"
        context.scene.bjs_bake.status = message
        self.report({"INFO"}, message)
        return {"FINISHED"}


class BJS_OT_bake_merge(Operator):
    bl_idname = "bjs_bake.merge"
    bl_label = "Merge Selected"
    bl_description = "Join selected meshes (one mesh, or one per material)"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        settings = context.scene.bjs_bake
        meshes = [obj for obj in context.selected_objects if obj.type == "MESH"]
        if not meshes:
            for root in context.selected_objects:
                for child in root.children_recursive:
                    if child.type == "MESH":
                        meshes.append(child)
            meshes = list(dict.fromkeys(meshes))

        if len(meshes) < 2 and settings.merge_mode == "ONE":
            if len(meshes) == 1:
                settings.status = "Only one mesh selected — nothing to join"
                self.report({"INFO"}, settings.status)
                return {"FINISHED"}
            self.report({"ERROR"}, "Select at least two mesh objects to merge")
            return {"CANCELLED"}

        collection = _ensure_scatter_collection(context)

        if settings.merge_mode == "ONE":
            created = _join_meshes(context, meshes, "BJS_MergedScatter", collection)
            message = f"Merged {len(meshes)} meshes → '{created.name if created else '?'}'"
        else:
            # Bucket by first material slot name. Multi-material objects stay
            # intact inside their bucket (join keeps slots); split by material
            # first in Blender if you need true one-material-per-mesh.
            buckets: dict[str, list] = {}
            for mesh_obj in meshes:
                if mesh_obj.material_slots and mesh_obj.material_slots[0].material:
                    key = mesh_obj.material_slots[0].material.name
                else:
                    key = "_no_material"
                buckets.setdefault(key, []).append(mesh_obj)

            names = []
            for material_name, group in buckets.items():
                safe = material_name.replace(".", "_")[:40]
                joined = _join_meshes(context, group, f"BJS_Merged_{safe}", collection)
                if joined is not None:
                    names.append(joined.name)
            message = f"Merged into {len(names)} mesh(es): {', '.join(names)}"

        settings.status = message
        self.report({"INFO"}, message)
        return {"FINISHED"}


def _join_meshes(context, meshes: list, name: str, collection) -> bpy.types.Object | None:
    if not meshes:
        return None

    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    context.view_layer.objects.active = meshes[0]

    if len(meshes) == 1:
        meshes[0].name = name
        return meshes[0]

    bpy.ops.object.join()
    joined = context.view_layer.objects.active
    if joined is None:
        return None
    joined.name = name

    # Ensure in scatter collection
    for user_collection in list(joined.users_collection):
        if user_collection != collection:
            user_collection.objects.unlink(joined)
    if collection not in joined.users_collection:
        collection.objects.link(joined)

    joined["bjs_scatter_batch"] = True
    return joined


class BJS_OT_bake_unregister(Operator):
    bl_idname = "bjs_bake.unregister"
    bl_label = "Unregister This Script"
    bl_options = {"REGISTER"}

    def execute(self, context):
        unregister()
        self.report({"INFO"}, "BJS Bake unregistered")
        return {"FINISHED"}


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------

class BJS_PT_bake_panel(Panel):
    bl_label = "Populate Prefabs Bake"
    bl_idname = "BJS_PT_bake_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "BJS Bake"

    def draw(self, context):
        layout = self.layout
        settings = context.scene.bjs_bake

        layout.label(text="1. Settings", icon="SETTINGS")
        layout.prop(settings, "target")
        layout.prop(settings, "color_attribute")
        layout.prop(settings, "paint_threshold")
        layout.prop(settings, "instance_count")
        layout.prop(settings, "random_yaw")
        layout.prop(settings, "scale_jitter")
        layout.prop(settings, "parent_to_target")
        layout.prop(settings, "hide_originals")
        layout.prop(settings, "strip_lods_on_scatter")
        layout.prop(settings, "scatter_mode")
        layout.prop(settings, "merge_mode")

        box = layout.box()
        header = box.row()
        header.label(text=f"Prefabs ({len(settings.prefabs)})")
        header.operator("bjs_bake.add_selected_prefabs", text="", icon="ADD")
        header.operator("bjs_bake.clear_prefabs", text="", icon="X")
        if len(settings.prefabs) == 0:
            box.label(text="Select prefab roots → +", icon="INFO")
        for index, item in enumerate(settings.prefabs):
            row = box.row(align=True)
            row.prop(item, "object", text="")
            remove = row.operator("bjs_bake.remove_prefab", text="", icon="X")
            remove.index = index

        layout.separator()
        layout.label(text="2. Scatter", icon="PARTICLES")
        layout.operator("bjs_bake.scatter", icon="PLAY")
        if settings.scatter_mode == "BAKED":
            layout.label(text="Baked mode finishes in one step", icon="INFO")
        else:
            layout.operator("bjs_bake.select_scattered", icon="RESTRICT_SELECT_OFF")

        layout.separator()
        layout.label(text="3. Instances only (skip if Baked)", icon="MOD_BUILD")
        layout.operator("bjs_bake.strip_lods", icon="MESH_DATA")
        layout.operator("bjs_bake.freeze", icon="FREEZE")
        layout.operator("bjs_bake.merge", icon="AUTOMERGE_ON")

        if settings.status:
            layout.separator()
            layout.label(text=settings.status, icon="INFO")

        layout.separator()
        layout.operator("bjs_bake.unregister", icon="TRASH")


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

_classes = (
    BJS_PG_bake_prefab_item,
    BJS_PG_bake_settings,
    BJS_OT_bake_add_selected_prefabs,
    BJS_OT_bake_clear_prefabs,
    BJS_OT_bake_remove_prefab,
    BJS_OT_bake_scatter,
    BJS_OT_bake_strip_lods,
    BJS_OT_bake_select_scattered,
    BJS_OT_bake_freeze,
    BJS_OT_bake_merge,
    BJS_OT_bake_unregister,
    BJS_PT_bake_panel,
)


def register():
    for class_type in _classes:
        try:
            bpy.utils.register_class(class_type)
        except ValueError:
            # Already registered from a previous Run Script
            bpy.utils.unregister_class(class_type)
            bpy.utils.register_class(class_type)

    if not hasattr(bpy.types.Scene, "bjs_bake"):
        bpy.types.Scene.bjs_bake = PointerProperty(type=BJS_PG_bake_settings)


def unregister():
    if hasattr(bpy.types.Scene, "bjs_bake"):
        del bpy.types.Scene.bjs_bake
    for class_type in reversed(_classes):
        try:
            bpy.utils.unregister_class(class_type)
        except Exception:
            pass


if __name__ == "__main__":
    # Re-run safe: unregister previous copy if present
    try:
        unregister()
    except Exception:
        pass
    register()
    print("[bjs_bake] Registered — open N-panel → BJS Bake")
