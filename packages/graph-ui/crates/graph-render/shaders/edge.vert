#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_from;
layout(location = 2) in vec2 a_to;
layout(location = 3) in float a_width;
layout(location = 4) in vec4 a_color;
layout(location = 5) in float a_dash;
layout(location = 6) in float a_animate;
uniform mat4 u_vp; uniform float u_time;
out vec2 v_uv; out vec4 v_color; out float v_dash; out float v_length; out float v_time_offset;
void main() {
    vec2 dir = a_to - a_from; float len = length(dir);
    vec2 norm = vec2(-dir.y, dir.x) / max(len, 0.001);
    vec2 pos = a_from + dir * a_position.x + norm * a_position.y * a_width;
    gl_Position = u_vp * vec4(pos, 0.0, 1.0);
    v_uv = vec2(a_position.x * len, a_position.y);
    v_color = a_color; v_dash = a_dash; v_length = len;
    v_time_offset = a_animate > 0.5 ? u_time * 50.0 : 0.0;
}
