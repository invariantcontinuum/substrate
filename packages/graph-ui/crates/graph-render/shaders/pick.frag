#version 300 es
precision highp float;
in vec2 v_local; in vec3 v_pick_color;
out vec4 frag_color;
void main() { if (length(v_local) > 1.0) discard; frag_color = vec4(v_pick_color, 1.0); }
