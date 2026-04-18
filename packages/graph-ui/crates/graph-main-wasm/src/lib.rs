use wasm_bindgen::prelude::*;

pub mod engine;
pub mod spatial;

#[wasm_bindgen(start)]
pub fn init() {
    console_log::init_with_level(log::Level::Info).ok();
}
