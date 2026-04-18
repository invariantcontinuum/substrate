#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_center;
layout(location = 2) in float a_radius;
layout(location = 3) in vec3 a_pick_color;
uniform mat4 u_vp;
out vec2 v_local; out vec3 v_pick_color;
void main() {
    vec2 world = a_center + a_position * a_radius;
    gl_Position = u_vp * vec4(world, 0.0, 1.0);
    v_local = a_position; v_pick_color = a_pick_color;
}
