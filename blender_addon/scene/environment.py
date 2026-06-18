"""World environment texture discovery (shared by export and the scene UI)."""

_TEXTURE_NODES = frozenset(('TEX_ENVIRONMENT', 'TEX_IMAGE'))


def _active_world_output(world):
    """Return the active World Output node, if any."""
    nodes = world.node_tree.nodes
    for n in nodes:
        if n.type == 'OUTPUT_WORLD' and n.is_active_output:
            return n
    for n in nodes:
        if n.type == 'OUTPUT_WORLD':
            return n
    return None


def _surface_shader(world):
    """Shader node wired to World Output → Surface (the rendered world background)."""
    output = _active_world_output(world)
    if not output:
        return None
    surface_in = output.inputs.get('Surface')
    if not surface_in or not surface_in.links:
        return None
    return surface_in.links[0].from_node


def _texture_from_background(background):
    """Environment/image texture feeding a Background node's Color input."""
    color_in = background.inputs.get('Color')
    if not color_in or not color_in.links:
        return None
    src = color_in.links[0].from_node
    if src.type in _TEXTURE_NODES and src.image:
        return src
    if src.type == 'MAPPING':
        vector_in = src.inputs.get('Vector')
        if vector_in and vector_in.links:
            tex = vector_in.links[0].from_node
            if tex.type in _TEXTURE_NODES and tex.image:
                return tex
    return None


def find_world_env_node(world):
    """Return the env/image texture on the active World Output surface chain, if any."""
    if not world or not world.use_nodes:
        return None

    surface = _surface_shader(world)
    if not surface:
        return None

    if surface.type in _TEXTURE_NODES and surface.image:
        return surface

    if surface.type == 'BACKGROUND':
        return _texture_from_background(surface)

    return None


def world_background_strength(world):
    """Background node Strength on the active World Output surface chain."""
    surface = _surface_shader(world)
    if surface and surface.type == 'BACKGROUND':
        return surface.inputs['Strength'].default_value
    return 1.0
