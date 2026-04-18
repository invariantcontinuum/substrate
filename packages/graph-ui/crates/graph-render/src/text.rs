// TODO(v0.2): Replace the 1x1 placeholder atlas with a real MSDF font atlas.
// The text rendering pipeline is structurally complete (shaders, quad generation,
// atlas sampling) but currently uses a single white pixel as the atlas texture,
// so labels will not render readable text. To enable real text:
//   1. Generate an MSDF atlas using msdf-atlas-gen or equivalent tooling.
//   2. Embed the atlas PNG as a const byte array or load it at runtime.
//   3. Update glyph metrics (advance widths, UV coordinates) to match the atlas layout.

use web_sys::{
    WebGl2RenderingContext as GL, WebGlBuffer, WebGlProgram, WebGlTexture, WebGlUniformLocation,
    WebGlVertexArrayObject,
};

use crate::context::RenderContext;

const TEXT_VERT: &str = include_str!("../shaders/text.vert");
const TEXT_FRAG: &str = include_str!("../shaders/text.frag");

/// Per-instance floats: offset.xy, color.rgba, scale = 2 + 4 + 1 = 7 floats
/// Per-vertex (in the glyph quad): position.xy, texcoord.uv = 4 floats
pub const TEXT_INSTANCE_FLOATS: usize = 7;

/// Placeholder SDF atlas size (v0.1.0). A 1x1 white pixel texture is created
/// so the shader can sample without error. Real atlas will be generated from a
/// font in a later version.
const PLACEHOLDER_ATLAS_SIZE: i32 = 1;

pub struct TextRenderer {
    program: WebGlProgram,
    vao: WebGlVertexArrayObject,
    vertex_buffer: WebGlBuffer,
    atlas_texture: WebGlTexture,
    u_vp: WebGlUniformLocation,
    u_atlas: WebGlUniformLocation,
    vertex_count: i32,
}

impl TextRenderer {
    pub fn new(ctx: &RenderContext) -> Result<Self, String> {
        let gl = &ctx.gl;
        let program = ctx.link_program(TEXT_VERT, TEXT_FRAG)?;

        let vao = gl.create_vertex_array().ok_or("Failed to create VAO")?;
        gl.bind_vertex_array(Some(&vao));

        // Dynamic vertex buffer for glyph quads
        let vertex_buffer = gl.create_buffer().ok_or("Failed to create vertex buffer")?;
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&vertex_buffer));

        // Attributes are interleaved per-vertex:
        // layout 0: a_position (vec2) - quad corner
        // layout 1: a_texcoord (vec2) - atlas UV
        // layout 2: a_offset   (vec2) - world position
        // layout 3: a_color    (vec4) - text color
        // layout 4: a_scale    (float)- glyph scale
        // Total per vertex: 2+2+2+4+1 = 11 floats, stride = 44 bytes
        let stride = 44i32;

        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_with_i32(0, 2, GL::FLOAT, false, stride, 0);

        gl.enable_vertex_attrib_array(1);
        gl.vertex_attrib_pointer_with_i32(1, 2, GL::FLOAT, false, stride, 8);

        gl.enable_vertex_attrib_array(2);
        gl.vertex_attrib_pointer_with_i32(2, 2, GL::FLOAT, false, stride, 16);

        gl.enable_vertex_attrib_array(3);
        gl.vertex_attrib_pointer_with_i32(3, 4, GL::FLOAT, false, stride, 24);

        gl.enable_vertex_attrib_array(4);
        gl.vertex_attrib_pointer_with_i32(4, 1, GL::FLOAT, false, stride, 40);

        gl.bind_vertex_array(None);

        // Create placeholder SDF atlas texture (1x1 white pixel)
        let atlas_texture = gl.create_texture().ok_or("Failed to create texture")?;
        gl.bind_texture(GL::TEXTURE_2D, Some(&atlas_texture));
        let pixel: [u8; 1] = [255];
        gl.tex_image_2d_with_i32_and_i32_and_i32_and_format_and_type_and_opt_u8_array(
            GL::TEXTURE_2D,
            0,
            GL::R8 as i32,
            PLACEHOLDER_ATLAS_SIZE,
            PLACEHOLDER_ATLAS_SIZE,
            0,
            GL::RED,
            GL::UNSIGNED_BYTE,
            Some(&pixel),
        )
        .map_err(|e| format!("tex_image_2d failed: {:?}", e))?;
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MIN_FILTER, GL::LINEAR as i32);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MAG_FILTER, GL::LINEAR as i32);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_WRAP_S, GL::CLAMP_TO_EDGE as i32);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_WRAP_T, GL::CLAMP_TO_EDGE as i32);
        gl.bind_texture(GL::TEXTURE_2D, None);

        let u_vp = gl
            .get_uniform_location(&program, "u_vp")
            .ok_or("Missing u_vp uniform")?;
        let u_atlas = gl
            .get_uniform_location(&program, "u_atlas")
            .ok_or("Missing u_atlas uniform")?;

        Ok(Self {
            program,
            vao,
            vertex_buffer,
            atlas_texture,
            u_vp,
            u_atlas,
            vertex_count: 0,
        })
    }

    /// Upload pre-built glyph quad vertices.
    /// Each vertex has 11 floats (position, texcoord, offset, color, scale).
    /// `vertex_count` is the total number of vertices (should be multiple of 6 for quads).
    pub fn upload(&mut self, gl: &GL, data: &[f32], vertex_count: usize) {
        self.vertex_count = vertex_count as i32;
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&self.vertex_buffer));
        unsafe {
            let view = js_sys::Float32Array::view(data);
            gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &view, GL::DYNAMIC_DRAW);
        }
    }

    /// Draw all uploaded text glyphs.
    pub fn draw(&self, gl: &GL, vp_matrix: &[f32; 16]) {
        if self.vertex_count == 0 {
            return;
        }
        gl.use_program(Some(&self.program));
        gl.uniform_matrix4fv_with_f32_array(Some(&self.u_vp), false, vp_matrix);

        // Bind atlas to texture unit 0
        gl.active_texture(GL::TEXTURE0);
        gl.bind_texture(GL::TEXTURE_2D, Some(&self.atlas_texture));
        gl.uniform1i(Some(&self.u_atlas), 0);

        gl.bind_vertex_array(Some(&self.vao));
        gl.draw_arrays(GL::TRIANGLES, 0, self.vertex_count);
        gl.bind_vertex_array(None);
    }
}
