use wasm_bindgen::prelude::*;

pub mod camera_anim;
pub mod engine;
pub mod spatial;
pub mod spotlight;

#[wasm_bindgen(start)]
pub fn init() {
    console_log::init_with_level(log::Level::Info).ok();
}
