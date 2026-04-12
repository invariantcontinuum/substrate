use web_sys::{
    WebGl2RenderingContext as GL, WebGlBuffer, WebGlProgram, WebGlUniformLocation,
    WebGlVertexArrayObject,
};

use crate::context::RenderContext;

const ARROW_VERT: &str = include_str!("../shaders/arrow.vert");
const ARROW_FRAG: &str = include_str!("../shaders/arrow.frag");

/// Per-instance floats: from.xy, to.xy, scale, color.rgba = 2 + 2 + 1 + 4 = 9
pub const ARROW_INSTANCE_FLOATS: usize = 9;

/// Triangle vertex positions in unit space: tip, left-back, right-back.
const TRI: [f32; 6] = [0.0, 0.0, -1.0, 0.5, -1.0, -0.5];

pub struct ArrowRenderer {
    program: WebGlProgram,
    vao: WebGlVertexArrayObject,
    instance_buffer: WebGlBuffer,
    u_vp: WebGlUniformLocation,
    instance_count: usize,
}

impl ArrowRenderer {
    pub fn new(ctx: &RenderContext) -> Result<Self, String> {
        let gl = &ctx.gl;
        let program = ctx.link_program(ARROW_VERT, ARROW_FRAG)?;

        let vao = gl.create_vertex_array().ok_or("Failed to create arrow VAO")?;
        gl.bind_vertex_array(Some(&vao));

        // Static triangle buffer at location 0.
        let tri_buf = gl
            .create_buffer()
            .ok_or("Failed to create arrow tri buffer")?;
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&tri_buf));
        unsafe {
            let view = js_sys::Float32Array::view(&TRI);
            gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &view, GL::STATIC_DRAW);
        }
        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_with_i32(0, 2, GL::FLOAT, false, 0, 0);

        // Instance buffer.
        let instance_buffer = gl
            .create_buffer()
            .ok_or("Failed to create arrow instance buffer")?;
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&instance_buffer));

        let stride = (ARROW_INSTANCE_FLOATS * 4) as i32;
        let mut offset = 0i32;

        // location 1: a_from (vec2)
        gl.enable_vertex_attrib_array(1);
        gl.vertex_attrib_pointer_with_i32(1, 2, GL::FLOAT, false, stride, offset);
        gl.vertex_attrib_divisor(1, 1);
        offset += 8;

        // location 2: a_to (vec2)
        gl.enable_vertex_attrib_array(2);
        gl.vertex_attrib_pointer_with_i32(2, 2, GL::FLOAT, false, stride, offset);
        gl.vertex_attrib_divisor(2, 1);
        offset += 8;

        // location 3: a_scale (float)
        gl.enable_vertex_attrib_array(3);
        gl.vertex_attrib_pointer_with_i32(3, 1, GL::FLOAT, false, stride, offset);
        gl.vertex_attrib_divisor(3, 1);
        offset += 4;

        // location 4: a_color (vec4)
        gl.enable_vertex_attrib_array(4);
        gl.vertex_attrib_pointer_with_i32(4, 4, GL::FLOAT, false, stride, offset);
        gl.vertex_attrib_divisor(4, 1);
        let _ = offset;

        gl.bind_vertex_array(None);

        let u_vp = gl
            .get_uniform_location(&program, "u_vp")
            .ok_or("Missing u_vp uniform for arrows")?;

        Ok(Self {
            program,
            vao,
            instance_buffer,
            u_vp,
            instance_count: 0,
        })
    }

    pub fn upload(&mut self, gl: &GL, data: &[f32], count: usize) {
        self.instance_count = count;
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&self.instance_buffer));
        unsafe {
            let view = js_sys::Float32Array::view(data);
            gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &view, GL::DYNAMIC_DRAW);
        }
    }

    pub fn draw(&self, gl: &GL, vp_matrix: &[f32; 16]) {
        if self.instance_count == 0 {
            return;
        }
        gl.use_program(Some(&self.program));
        gl.uniform_matrix4fv_with_f32_array(Some(&self.u_vp), false, vp_matrix);
        gl.bind_vertex_array(Some(&self.vao));
        gl.draw_arrays_instanced(GL::TRIANGLES, 0, 3, self.instance_count as i32);
        gl.bind_vertex_array(None);
    }
}
