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

// Deterministic pseudo-random hash for a given 2-D point.
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
    vec2 dir = a_to - a_from;
    float len = length(dir);
    vec2 norm = vec2(-dir.y, dir.x) / max(len, 0.001);

    // Curve control point: offset perpendicular to the edge by a
    // deterministic amount derived from the source coordinate.  This
    // spreads overlapping straight edges in a grid layout so they are
    // visually distinguishable.
    float curve = (hash(a_from) - 0.5) * 2.0 * len * 0.22;
    vec2 mid = (a_from + a_to) * 0.5;
    vec2 ctrl = mid + norm * curve;

    float t = a_position.x;
    vec2 p0 = a_from;
    vec2 p1 = ctrl;
    vec2 p2 = a_to;

    // Quadratic Bezier position.
    vec2 bezier = mix(mix(p0, p1, t), mix(p1, p2, t), t);

    // Derivative of quadratic Bezier for the normal vector.
    vec2 tangent = 2.0 * (1.0 - t) * (p1 - p0) + 2.0 * t * (p2 - p1);
    vec2 normal = vec2(-tangent.y, tangent.x) / max(length(tangent), 0.001);
    vec2 pos = bezier + normal * a_position.y * a_width;

    gl_Position = u_vp * vec4(pos, 0.0, 1.0);

    // Approximate arc length with straight-line length for dash UVs.
    v_uv = vec2(a_position.x * len, a_position.y);
    v_color = a_color; v_dash = a_dash; v_length = len;
    v_time_offset = a_animate > 0.5 ? u_time * 50.0 : 0.0;
}
