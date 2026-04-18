"""Baked-in plugin REGISTRY.

As each plugin lands in Phases 2-3, add the import + registry entry here.
The list order has no semantic meaning; alphabetic is maintained for grep
friendliness.
"""

from __future__ import annotations

from substrate_graph_builder.registry import PluginRegistry

# Imports added per plugin in Phases 2-3.

REGISTRY: PluginRegistry = PluginRegistry([
    # PythonPlugin(), JavaScriptPlugin(), TypeScriptPlugin(), GoPlugin(), ...
])
