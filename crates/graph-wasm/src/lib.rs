use wasm_bindgen::prelude::*;

pub mod engine;
pub mod websocket;
pub mod events;
pub mod render_loop;
pub mod interop;

#[wasm_bindgen(start)]
pub fn init() {
    console_log::init_with_level(log::Level::Info).ok();
}
