#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_from;
layout(location = 2) in vec2 a_to;
layout(location = 3) in float a_scale;
layout(location = 4) in vec4 a_color;
uniform mat4 u_vp;
out vec4 v_color;
void main() {
    vec2 delta = a_to - a_from;
    float len = length(delta);
    vec2 dir = len > 0.001 ? delta / len : vec2(1.0, 0.0);
    vec2 norm = vec2(-dir.y, dir.x);
    // a_position is triangle vertex in unit space:
    //   (0, 0) = tip, (-1, 0.5) = left-back, (-1, -0.5) = right-back.
    vec2 local = a_position * a_scale;
    vec2 world = a_to + dir * local.x + norm * local.y;
    gl_Position = u_vp * vec4(world, 0.0, 1.0);
    v_color = a_color;
}
