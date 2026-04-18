use wasm_bindgen::JsCast;
use web_sys::{HtmlCanvasElement, WebGl2RenderingContext as GL, WebGlProgram, WebGlShader};

pub struct RenderContext {
    pub gl: GL,
    pub canvas: HtmlCanvasElement,
    pub width: u32,
    pub height: u32,
}

impl RenderContext {
    pub fn new(canvas: HtmlCanvasElement) -> Result<Self, String> {
        let gl = canvas
            .get_context("webgl2")
            .map_err(|e| format!("getContext failed: {:?}", e))?
            .ok_or("WebGL2 not available")?
            .dyn_into::<GL>()
            .map_err(|_| "Failed to cast to WebGL2")?;
        let width = canvas.width();
        let height = canvas.height();
        gl.viewport(0, 0, width as i32, height as i32);
        gl.enable(GL::BLEND);
        gl.blend_func(GL::SRC_ALPHA, GL::ONE_MINUS_SRC_ALPHA);
        Ok(Self {
            gl,
            canvas,
            width,
            height,
        })
    }

    pub fn resize(&mut self) {
        let dpr = web_sys::window().unwrap().device_pixel_ratio() as u32;
        let display_w = self.canvas.client_width() as u32 * dpr;
        let display_h = self.canvas.client_height() as u32 * dpr;
        if display_w != self.width || display_h != self.height {
            self.canvas.set_width(display_w);
            self.canvas.set_height(display_h);
            self.width = display_w;
            self.height = display_h;
            self.gl.viewport(0, 0, display_w as i32, display_h as i32);
        }
    }

    pub fn compile_shader(&self, shader_type: u32, source: &str) -> Result<WebGlShader, String> {
        let shader = self
            .gl
            .create_shader(shader_type)
            .ok_or("Cannot create shader")?;
        self.gl.shader_source(&shader, source);
        self.gl.compile_shader(&shader);
        if self
            .gl
            .get_shader_parameter(&shader, GL::COMPILE_STATUS)
            .as_bool()
            .unwrap_or(false)
        {
            Ok(shader)
        } else {
            let log = self.gl.get_shader_info_log(&shader).unwrap_or_default();
            self.gl.delete_shader(Some(&shader));
            Err(format!("Shader compile error: {log}"))
        }
    }

    pub fn link_program(&self, vert_src: &str, frag_src: &str) -> Result<WebGlProgram, String> {
        let vert = self.compile_shader(GL::VERTEX_SHADER, vert_src)?;
        let frag = self.compile_shader(GL::FRAGMENT_SHADER, frag_src)?;
        let program = self.gl.create_program().ok_or("Cannot create program")?;
        self.gl.attach_shader(&program, &vert);
        self.gl.attach_shader(&program, &frag);
        self.gl.link_program(&program);
        if self
            .gl
            .get_program_parameter(&program, GL::LINK_STATUS)
            .as_bool()
            .unwrap_or(false)
        {
            Ok(program)
        } else {
            let log = self.gl.get_program_info_log(&program).unwrap_or_default();
            Err(format!("Program link error: {log}"))
        }
    }

    pub fn clear(&self, r: f32, g: f32, b: f32, a: f32) {
        self.gl.clear_color(r, g, b, a);
        self.gl.clear(GL::COLOR_BUFFER_BIT);
    }
}
