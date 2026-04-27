# Vulture whitelist — symbols that appear unused but are required for protocol compliance.
# See docs on the vulture whitelist format:
# https://github.com/jendrikseipp/vulture?tab=readme-ov-file#whitelist

# yaml_source.py: get_field_value() signature matches pydantic CustomSettingsSource protocol.
# `field` is a positional protocol argument; the implementation uses field_name instead.
field  # noqa: F821, B018
