"""Drop-in visual-effect plugins for LyraX.

A plugin is a Python module in this package exposing ``EFFECT_SPEC``,
``build_events(layer, context)`` and ``render_ass(renderer, layer, events,
width, height, ass_layer)``. The matching browser preview module lives at
``static/js/effects/<effect-id>.js``.
"""
