import bpy

# LOD level -> decimate ratio
LOD_RATIOS = {1: 0.25, 2: 0.1, 3: 0.05}

def remove_if_exists(name):
    existing = bpy.data.objects.get(name)
    if existing:
        bpy.data.objects.remove(existing, do_unlink=True)

for obj in list(bpy.context.selected_objects):
    lod_objects = []
    
    # Create LOD objects
    for i, ratio in LOD_RATIOS.items():
        lod_name = f"{obj.name}_LOD{i}"

        # avoid .001 suffix if this LOD already exists from a previous run
        remove_if_exists(lod_name)

        new_obj = obj.copy()
        if obj.data:
            new_obj.data = obj.data.copy()  # independent mesh data
        new_obj.name = lod_name

        # link into the same collection(s) as the original
        for coll in obj.users_collection:
            coll.objects.link(new_obj)

        # parent under original, keeping its current world position
        new_obj.parent = obj
        new_obj.matrix_parent_inverse = obj.matrix_world.inverted()

        # add decimate modifier
        decimate = new_obj.modifiers.new(name="Decimate", type='DECIMATE')
        decimate.ratio = ratio
        
        lod_objects.append(new_obj)

    # Add COLLIDER component (box shape) to the original object
    collider_comp = obj.bjs_components.add()
    collider_comp.comp_type = 'COLLIDER'
    collider_comp.collider_shape = 'BOX'
    collider_comp.auto_fit = True  # Auto-fit to bounds
    collider_comp.is_trigger = False
    collider_comp.collider_make_invisible = False

    # Add LOD component to the original object
    lod_comp = obj.bjs_components.add()
    lod_comp.comp_type = 'LOD'
    
    # Add three LOD levels with distance 20 each
    for lod_obj in lod_objects:
        level = lod_comp.lod_levels.add()
        level.distance = 20.0
        level.target = lod_obj
        level.auto_lod = False

print("Done creating LODs with collider and LOD components.")
