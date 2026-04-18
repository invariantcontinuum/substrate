use web_sys::{
    WebGl2RenderingContext as GL, WebGlBuffer, WebGlProgram, WebGlUniformLocation,
    WebGlVertexArrayObject,
};

use crate::context::RenderContext;

const NODE_VERT: &str = include_str!("../shaders/node.vert");
const NODE_FRAG: &str = include_str!("../shaders/node.frag");

/// Per-instance floats: center.xy, half_w, half_h, color.rgba, border_color.rgba, border_width, shape, flags
/// = 2 + 1 + 1 + 4 + 4 + 1 + 1 + 1 = 15 floats per instance
pub const NODE_INSTANCE_FLOATS: usize = 15;

/// Quad vertices: 4 corners of a [-1,1] square
const QUAD: [f32; 12] = [
    -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
];

pub struct NodeRenderer {
    program: WebGlProgram,
    vao: WebGlVertexArrayObject,
    instance_buffer: WebGlBuffer,
    u_vp: WebGlUniformLocation,
    u_time: WebGlUniformLocation,
    instance_count: usize,
}

impl NodeRenderer {
    pub fn new(ctx: &RenderContext) -> Result<Self, String> {
        let gl = &ctx.gl;
        let program = ctx.link_program(NODE_VERT, NODE_FRAG)?;

        let vao = gl.create_vertex_array().ok_or("Failed to create VAO")?;
        gl.bind_vertex_array(Some(&vao));

        // Quad vertex buffer (location 0)
        let quad_buf = gl.create_buffer().ok_or("Failed to create quad buffer")?;
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&quad_buf));
        unsafe {
            let view = js_sys::Float32Array::view(&QUAD);
            gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &view, GL::STATIC_DRAW);
        }
        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_with_i32(0, 2, GL::FLOAT, false, 0, 0);

        // Instance buffer (locations 1-7)
        let instance_buffer = gl
            .create_buffer()
            .ok_or("Failed to create instance buffer")?;
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&instance_buffer));

        let stride = (NODE_INSTANCE_FLOATS * 4) as i32;
        let mut offset = 0i32;

        // location 1: a_center (vec2) — offset 0, 8 bytes
        gl.enable_vertex_attrib_array(1);
        gl.vertex_attrib_pointer_with_i32(1, 2, GL::FLOAT, false, stride, offset);
        gl.vertex_attrib_divisor(1, 1);
        offset += 8;

        // location 2: a_half_w (float) — offset 8, 4 bytes
        gl.enable_vertex_attrib_array(2);
        gl.vertex_attrib_pointer_with_i32(2, 1, GL::FLOAT, false, stride, offset);
        gl.vertex_attrib_divisor(2, 1);
        offset += 4;

        // location 3: a_half_h (float) — offset 12, 4 bytes
        gl.enable_vertex_attrib_array(3);
        gl.vertex_attrib_pointer_with_i32(3, 1, GL::FLOAT, false, stride, offset);
        gl.vertex_attrib_divisor(3, 1);
        offset += 4;

        // location 4: a_color (vec4) — offset 16, 16 bytes
        gl.enable_vertex_attrib_array(4);
        gl.vertex_attrib_pointer_with_i32(4, 4, GL::FLOAT, false, stride, offset);
        gl.vertex_attrib_divisor(4, 1);
        offset += 16;

        // location 5: a_border_color (vec4) — offset 32, 16 bytes
        gl.enable_vertex_attrib_array(5);
        gl.vertex_attrib_pointer_with_i32(5, 4, GL::FLOAT, false, stride, offset);
        gl.vertex_attrib_divisor(5, 1);
        offset += 16;

        // location 6: a_border_width (float) — offset 48, 4 bytes
        gl.enable_vertex_attrib_array(6);
        gl.vertex_attrib_pointer_with_i32(6, 1, GL::FLOAT, false, stride, offset);
        gl.vertex_attrib_divisor(6, 1);
        offset += 4;

        // location 7: a_shape (float) — offset 52, 4 bytes
        gl.enable_vertex_attrib_array(7);
        gl.vertex_attrib_pointer_with_i32(7, 1, GL::FLOAT, false, stride, offset);
        gl.vertex_attrib_divisor(7, 1);
        offset += 4;

        // location 8: a_flags (float) — offset 56, 4 bytes  (total stride = 60 bytes = 15 floats)
        gl.enable_vertex_attrib_array(8);
        gl.vertex_attrib_pointer_with_i32(8, 1, GL::FLOAT, false, stride, offset);
        gl.vertex_attrib_divisor(8, 1);
        let _ = offset; // suppress unused warning

        gl.bind_vertex_array(None);

        let u_vp = gl
            .get_uniform_location(&program, "u_vp")
            .ok_or("Missing u_vp uniform")?;
        let u_time = gl
            .get_uniform_location(&program, "u_time")
            .ok_or("Missing u_time uniform")?;

        Ok(Self {
            program,
            vao,
            instance_buffer,
            u_vp,
            u_time,
            instance_count: 0,
        })
    }

    /// Upload flat instance data. `count` is the number of node instances.
    pub fn upload(&mut self, gl: &GL, data: &[f32], count: usize) {
        self.instance_count = count;
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&self.instance_buffer));
        unsafe {
            let view = js_sys::Float32Array::view(data);
            gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &view, GL::DYNAMIC_DRAW);
        }
    }

    /// Draw all uploaded node instances.
    pub fn draw(&self, gl: &GL, vp_matrix: &[f32; 16], time: f32) {
        if self.instance_count == 0 {
            return;
        }
        gl.use_program(Some(&self.program));
        gl.uniform_matrix4fv_with_f32_array(Some(&self.u_vp), false, vp_matrix);
        gl.uniform1f(Some(&self.u_time), time);
        gl.bind_vertex_array(Some(&self.vao));
        gl.draw_arrays_instanced(GL::TRIANGLES, 0, 6, self.instance_count as i32);
        gl.bind_vertex_array(None);
    }
}
