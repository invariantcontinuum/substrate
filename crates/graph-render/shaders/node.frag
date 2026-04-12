#version 300 es
precision highp float;
in vec2 v_local; in vec4 v_color; in vec4 v_border_color;
in float v_border_width; in float v_shape; in float v_radius; in float v_flags;
out vec4 frag_color;

float sdf_circle(vec2 p) { return length(p) - 1.0; }
float sdf_diamond(vec2 p) { vec2 d = abs(p); return (d.x + d.y) / 1.414 - 1.0; }
float sdf_square(vec2 p) { vec2 d = abs(p); return max(d.x, d.y) - 1.0; }
float sdf_hexagon(vec2 p) { vec2 d = abs(p); return max(d.x * 0.866 + d.y * 0.5, d.y) - 1.0; }
float sdf_triangle(vec2 p) { float k = sqrt(3.0); p.x = abs(p.x) - 1.0; p.y = p.y + 1.0/k; if(p.x+k*p.y>0.0) p=vec2(p.x-k*p.y,-k*p.x-p.y)/2.0; p.x-=clamp(p.x,-2.0,0.0); return -length(p)*sign(p.y); }
float sdf_octagon(vec2 p) { vec2 d = abs(p); return max(d.x, max(d.y, (d.x+d.y)*0.707)) - 1.0; }

float sdf_roundrect(vec2 p, float r) {
    vec2 q = abs(p) - vec2(1.0 - r);
    return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

float sdf_barrel(vec2 p) {
    // Horizontal stadium/pill in normalized [-1,1] local space.
    // Aspect is baked into world-space quad via halfWidth/halfHeight at vertex stage,
    // so here we approximate as a unit stadium with cap radius = 1 on the short axis.
    vec2 q = vec2(abs(p.x), p.y);
    float body = max(q.x - 0.35, 0.0);
    return length(vec2(body, q.y)) - 1.0;
}

void main() {
    float d;
    if (v_shape < 0.5) d = sdf_circle(v_local);
    else if (v_shape < 1.5) d = sdf_diamond(v_local);
    else if (v_shape < 2.5) d = sdf_square(v_local);
    else if (v_shape < 3.5) d = sdf_hexagon(v_local);
    else if (v_shape < 4.5) d = sdf_triangle(v_local);
    else if (v_shape < 5.5) d = sdf_octagon(v_local);
    else if (v_shape < 6.5) d = sdf_roundrect(v_local, 0.25);
    else                     d = sdf_barrel(v_local);
    float aa = 2.0 / v_radius;
    float alpha = 1.0 - smoothstep(-aa, aa, d);
    if (alpha < 0.01) discard;
    float border_mix = smoothstep(-v_border_width - aa, -v_border_width + aa, d);
    vec4 color = mix(v_color, v_border_color, border_mix);
    bool dimmed = mod(floor(v_flags / 8.0), 2.0) > 0.5;
    if (dimmed) color.a *= 0.15;
    frag_color = vec4(color.rgb, color.a * alpha);
}
