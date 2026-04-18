#version 300 es
precision highp float;
in vec2 v_uv; in vec4 v_color; in float v_dash; in float v_length; in float v_time_offset;
out vec4 frag_color;
void main() {
    float alpha = v_color.a;
    if (v_dash > 0.5 && v_dash < 1.5) {
        // long dashed
        float p = mod(v_uv.x + v_time_offset, 12.0);
        if (p > 8.0) alpha *= 0.0;
    } else if (v_dash > 1.5 && v_dash < 2.5) {
        // short dashed
        float p = mod(v_uv.x + v_time_offset, 8.0);
        if (p > 3.0) alpha *= 0.0;
    } else if (v_dash > 2.5) {
        // dotted
        float p = mod(v_uv.x + v_time_offset, 4.0);
        if (p > 1.5) alpha *= 0.0;
    }
    if (alpha < 0.01) discard;
    frag_color = vec4(v_color.rgb, alpha);
}
