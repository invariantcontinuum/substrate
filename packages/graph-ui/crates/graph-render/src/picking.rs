use web_sys::{
    WebGl2RenderingContext as GL, WebGlBuffer, WebGlFramebuffer, WebGlProgram, WebGlTexture,
    WebGlUniformLocation, WebGlVertexArrayObject,
};

use crate::context::RenderContext;

const PICK_VERT: &str = include_str!("../shaders/pick.vert");
const PICK_FRAG: &str = include_str!("../shaders/pick.frag");

/// Per-instance floats for picking: center.xy, radius, pick_color.rgb = 2 + 1 + 3 = 6
pub const PICK_INSTANCE_FLOATS: usize = 6;

/// Quad vertices for the pick circle
const QUAD: [f32; 12] = [
    -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
];

/// GPU color-ID pick buffer for O(1) hit testing.
///
/// Renders each node as a solid color derived from its index, then reads back
/// a single pixel under the cursor to determine which node was hit.
pub struct PickBuffer {
    program: WebGlProgram,
    vao: WebGlVertexArrayObject,
    instance_buffer: WebGlBuffer,
    framebuffer: WebGlFramebuffer,
    color_texture: WebGlTexture,
    u_vp: WebGlUniformLocation,
    width: u32,
    height: u32,
    instance_count: usize,
}

impl PickBuffer {
    pub fn new(ctx: &RenderContext) -> Result<Self, String> {
        let gl = &ctx.gl;
        let program = ctx.link_program(PICK_VERT, PICK_FRAG)?;

        let vao = gl.create_vertex_array().ok_or("Failed to create VAO")?;
        gl.bind_vertex_array(Some(&vao));

        // Quad buffer (location 0)
        let quad_buf = gl.create_buffer().ok_or("Failed to create quad buffer")?;
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&quad_buf));
        unsafe {
            let view = js_sys::Float32Array::view(&QUAD);
            gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &view, GL::STATIC_DRAW);
        }
        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_with_i32(0, 2, GL::FLOAT, false, 0, 0);

        // Instance buffer (locations 1-3)
        let instance_buffer = gl
            .create_buffer()
            .ok_or("Failed to create instance buffer")?;
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&instance_buffer));

        let stride = (PICK_INSTANCE_FLOATS * 4) as i32;

        // location 1: a_center (vec2)
        gl.enable_vertex_attrib_array(1);
        gl.vertex_attrib_pointer_with_i32(1, 2, GL::FLOAT, false, stride, 0);
        gl.vertex_attrib_divisor(1, 1);

        // location 2: a_radius (float)
        gl.enable_vertex_attrib_array(2);
        gl.vertex_attrib_pointer_with_i32(2, 1, GL::FLOAT, false, stride, 8);
        gl.vertex_attrib_divisor(2, 1);

        // location 3: a_pick_color (vec3)
        gl.enable_vertex_attrib_array(3);
        gl.vertex_attrib_pointer_with_i32(3, 3, GL::FLOAT, false, stride, 12);
        gl.vertex_attrib_divisor(3, 1);

        gl.bind_vertex_array(None);

        // Create offscreen framebuffer with color texture
        let framebuffer = gl
            .create_framebuffer()
            .ok_or("Failed to create framebuffer")?;
        let color_texture = gl.create_texture().ok_or("Failed to create texture")?;

        let width = ctx.width;
        let height = ctx.height;

        gl.bind_texture(GL::TEXTURE_2D, Some(&color_texture));
        gl.tex_image_2d_with_i32_and_i32_and_i32_and_format_and_type_and_opt_u8_array(
            GL::TEXTURE_2D,
            0,
            GL::RGBA8 as i32,
            width as i32,
            height as i32,
            0,
            GL::RGBA,
            GL::UNSIGNED_BYTE,
            None,
        )
        .map_err(|e| format!("tex_image_2d failed: {:?}", e))?;
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MIN_FILTER, GL::NEAREST as i32);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MAG_FILTER, GL::NEAREST as i32);

        gl.bind_framebuffer(GL::FRAMEBUFFER, Some(&framebuffer));
        gl.framebuffer_texture_2d(
            GL::FRAMEBUFFER,
            GL::COLOR_ATTACHMENT0,
            GL::TEXTURE_2D,
            Some(&color_texture),
            0,
        );
        gl.bind_framebuffer(GL::FRAMEBUFFER, None);
        gl.bind_texture(GL::TEXTURE_2D, None);

        let u_vp = gl
            .get_uniform_location(&program, "u_vp")
            .ok_or("Missing u_vp uniform")?;

        Ok(Self {
            program,
            vao,
            instance_buffer,
            framebuffer,
            color_texture,
            u_vp,
            width,
            height,
            instance_count: 0,
        })
    }

    /// Resize the offscreen framebuffer to match viewport changes.
    pub fn resize(&mut self, gl: &GL, width: u32, height: u32) {
        if width == self.width && height == self.height {
            return;
        }
        self.width = width;
        self.height = height;
        gl.bind_texture(GL::TEXTURE_2D, Some(&self.color_texture));
        let _ = gl.tex_image_2d_with_i32_and_i32_and_i32_and_format_and_type_and_opt_u8_array(
            GL::TEXTURE_2D,
            0,
            GL::RGBA8 as i32,
            width as i32,
            height as i32,
            0,
            GL::RGBA,
            GL::UNSIGNED_BYTE,
            None,
        );
        gl.bind_texture(GL::TEXTURE_2D, None);
    }

    /// Upload pick instance data. `count` is the number of node instances.
    pub fn upload(&mut self, gl: &GL, data: &[f32], count: usize) {
        self.instance_count = count;
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&self.instance_buffer));
        unsafe {
            let view = js_sys::Float32Array::view(data);
            gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &view, GL::DYNAMIC_DRAW);
        }
    }

    /// Render the pick buffer (call before `pick`).
    pub fn draw(&self, gl: &GL, vp_matrix: &[f32; 16]) {
        if self.instance_count == 0 {
            return;
        }
        gl.bind_framebuffer(GL::FRAMEBUFFER, Some(&self.framebuffer));
        gl.viewport(0, 0, self.width as i32, self.height as i32);
        gl.clear_color(0.0, 0.0, 0.0, 0.0);
        gl.clear(GL::COLOR_BUFFER_BIT);
        gl.disable(GL::BLEND);

        gl.use_program(Some(&self.program));
        gl.uniform_matrix4fv_with_f32_array(Some(&self.u_vp), false, vp_matrix);
        gl.bind_vertex_array(Some(&self.vao));
        gl.draw_arrays_instanced(GL::TRIANGLES, 0, 6, self.instance_count as i32);
        gl.bind_vertex_array(None);

        gl.enable(GL::BLEND);
        gl.bind_framebuffer(GL::FRAMEBUFFER, None);
    }

    /// Read a single pixel from the pick buffer and return the node index, or None.
    /// Coordinates are in framebuffer pixels (origin top-left).
    pub fn pick(&self, gl: &GL, x: i32, y: i32) -> Option<usize> {
        gl.bind_framebuffer(GL::FRAMEBUFFER, Some(&self.framebuffer));
        let mut pixel = [0u8; 4];
        // Flip y for GL coordinate system (origin bottom-left)
        let gl_y = self.height as i32 - 1 - y;
        let _ = gl.read_pixels_with_opt_u8_array(
            x,
            gl_y,
            1,
            1,
            GL::RGBA,
            GL::UNSIGNED_BYTE,
            Some(&mut pixel),
        );
        gl.bind_framebuffer(GL::FRAMEBUFFER, None);

        if pixel[3] == 0 {
            return None;
        }
        let index = pixel[0] as usize + (pixel[1] as usize) * 256 + (pixel[2] as usize) * 65536;
        Some(index)
    }

    /// Encode a node index as an RGB color for the pick shader.
    /// Returns (r, g, b) in [0.0, 1.0] range.
    pub fn index_to_color(index: usize) -> (f32, f32, f32) {
        let r = (index & 0xFF) as f32 / 255.0;
        let g = ((index >> 8) & 0xFF) as f32 / 255.0;
        let b = ((index >> 16) & 0xFF) as f32 / 255.0;
        (r, g, b)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn color_encoding_roundtrip() {
        for i in [0, 1, 255, 256, 65535, 100_000] {
            let (r, g, b) = PickBuffer::index_to_color(i);
            let decoded = (r * 255.0) as usize
                + ((g * 255.0) as usize) * 256
                + ((b * 255.0) as usize) * 65536;
            assert_eq!(decoded, i, "Roundtrip failed for index {i}");
        }
    }
}
