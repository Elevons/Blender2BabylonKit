"""Shared GPU overlay helpers — shader reuse and line-batch caching."""

import gpu
from gpu_extras.batch import batch_for_shader

_shader_cache = {}


def GetOverlayShader(shader_name='UNIFORM_COLOR'):
    """Return a cached built-in GPU shader."""
    shader = _shader_cache.get(shader_name)
    if shader is None:
        shader = gpu.shader.from_builtin(shader_name)
        _shader_cache[shader_name] = shader
    return shader


def ClearOverlayCaches():
    """Drop cached shaders and draw batches (addon unload)."""
    _shader_cache.clear()


def MatrixSignature(matrix):
    """Compact, hashable world-matrix fingerprint for draw-cache keys."""
    return tuple(
        matrix[row_index][column_index]
        for row_index in range(4)
        for column_index in range(4)
    )


class LineBatchCache:
    """Reuse a GPU line batch when the draw signature is unchanged."""

    def __init__(self):
        self._key = None
        self._batch = None

    def Clear(self):
        """Drop the cached batch."""
        self._key = None
        self._batch = None

    def HasKey(self, key):
        """True when ``key`` matches the cached batch."""
        return key == self._key and self._batch is not None

    def Draw(self, key, positions, shader, color, line_width=1.5, depth_test='LESS_EQUAL'):
        """Draw lines, rebuilding the batch only when ``key`` changes."""
        if key != self._key or self._batch is None:
            self._key = key
            self._batch = batch_for_shader(shader, 'LINES', {"pos": positions})

        gpu.state.blend_set('ALPHA')
        gpu.state.line_width_set(line_width)
        gpu.state.depth_test_set(depth_test)
        shader.bind()
        shader.uniform_float("color", color)
        self._batch.draw(shader)
        gpu.state.depth_test_set('NONE')
        gpu.state.line_width_set(1.0)
        gpu.state.blend_set('NONE')
