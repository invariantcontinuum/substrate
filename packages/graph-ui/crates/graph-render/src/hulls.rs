use web_sys::{
    WebGl2RenderingContext as GL, WebGlBuffer, WebGlProgram, WebGlUniformLocation,
    WebGlVertexArrayObject,
};

use crate::context::RenderContext;

const HULL_VERT: &str = include_str!("../shaders/hull.vert");
const HULL_FRAG: &str = include_str!("../shaders/hull.frag");

/// Per-vertex floats: position.xy, color.rgba = 2 + 4 = 6 floats
pub const HULL_VERTEX_FLOATS: usize = 6;

pub struct HullRenderer {
    program: WebGlProgram,
    vao: WebGlVertexArrayObject,
    vertex_buffer: WebGlBuffer,
    u_vp: WebGlUniformLocation,
    vertex_count: i32,
}

impl HullRenderer {
    pub fn new(ctx: &RenderContext) -> Result<Self, String> {
        let gl = &ctx.gl;
        let program = ctx.link_program(HULL_VERT, HULL_FRAG)?;

        let vao = gl.create_vertex_array().ok_or("Failed to create VAO")?;
        gl.bind_vertex_array(Some(&vao));

        let vertex_buffer = gl.create_buffer().ok_or("Failed to create vertex buffer")?;
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&vertex_buffer));

        let stride = (HULL_VERTEX_FLOATS * 4) as i32;

        // location 0: a_position (vec2)
        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_with_i32(0, 2, GL::FLOAT, false, stride, 0);

        // location 1: a_color (vec4)
        gl.enable_vertex_attrib_array(1);
        gl.vertex_attrib_pointer_with_i32(1, 4, GL::FLOAT, false, stride, 8);

        gl.bind_vertex_array(None);

        let u_vp = gl
            .get_uniform_location(&program, "u_vp")
            .ok_or("Missing u_vp uniform")?;

        Ok(Self {
            program,
            vao,
            vertex_buffer,
            u_vp,
            vertex_count: 0,
        })
    }

    /// Upload triangulated hull vertices.
    /// The data should contain fan-triangulated convex hull polygons, each vertex
    /// having HULL_VERTEX_FLOATS floats (position.xy + color.rgba).
    pub fn upload(&mut self, gl: &GL, data: &[f32], vertex_count: usize) {
        self.vertex_count = vertex_count as i32;
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&self.vertex_buffer));
        unsafe {
            let view = js_sys::Float32Array::view(data);
            gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &view, GL::DYNAMIC_DRAW);
        }
    }

    /// Draw all uploaded hull triangles.
    pub fn draw(&self, gl: &GL, vp_matrix: &[f32; 16]) {
        if self.vertex_count == 0 {
            return;
        }
        gl.use_program(Some(&self.program));
        gl.uniform_matrix4fv_with_f32_array(Some(&self.u_vp), false, vp_matrix);
        gl.bind_vertex_array(Some(&self.vao));
        gl.draw_arrays(GL::TRIANGLES, 0, self.vertex_count);
        gl.bind_vertex_array(None);
    }
}
