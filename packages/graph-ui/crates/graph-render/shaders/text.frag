#version 300 es
precision highp float;
in vec2 v_texcoord; in vec4 v_color;
uniform sampler2D u_atlas;
out vec4 frag_color;
void main() {
    float dist = texture(u_atlas, v_texcoord).r;
    float alpha = smoothstep(0.45, 0.55, dist);
    if (alpha < 0.01) discard;
    frag_color = vec4(v_color.rgb, v_color.a * alpha);
}
