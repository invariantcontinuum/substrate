"""Baked-in plugin REGISTRY.

As each plugin lands in Phases 2-3, add the import + registry entry here.
The list order has no semantic meaning; alphabetic is maintained for grep
friendliness.
"""

from __future__ import annotations

from substrate_graph_builder.plugins.c import CPlugin
from substrate_graph_builder.plugins.cmake import CMakePlugin
from substrate_graph_builder.plugins.cpp import CppPlugin
from substrate_graph_builder.plugins.go import GoPlugin
from substrate_graph_builder.plugins.java import JavaPlugin
from substrate_graph_builder.plugins.javascript import JavaScriptPlugin
from substrate_graph_builder.plugins.perl import PerlPlugin
from substrate_graph_builder.plugins.python import PythonPlugin
from substrate_graph_builder.plugins.ruby import RubyPlugin
from substrate_graph_builder.plugins.rust import RustPlugin
from substrate_graph_builder.plugins.shell import ShellPlugin
from substrate_graph_builder.plugins.typescript import TypeScriptPlugin
from substrate_graph_builder.registry import PluginRegistry

REGISTRY: PluginRegistry = PluginRegistry([
    CPlugin(),
    CMakePlugin(),
    CppPlugin(),
    GoPlugin(),
    JavaPlugin(),
    JavaScriptPlugin(),
    PerlPlugin(),
    PythonPlugin(),
    RubyPlugin(),
    RustPlugin(),
    ShellPlugin(),
    TypeScriptPlugin(),
])
