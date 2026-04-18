#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in vec2 a_offset;
layout(location = 3) in vec4 a_color;
layout(location = 4) in float a_scale;
uniform mat4 u_vp;
out vec2 v_texcoord; out vec4 v_color;
void main() {
    vec2 pos = a_offset + a_position * a_scale;
    gl_Position = u_vp * vec4(pos, 0.0, 1.0);
    v_texcoord = a_texcoord; v_color = a_color;
}
