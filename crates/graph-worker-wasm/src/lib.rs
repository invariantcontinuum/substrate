use wasm_bindgen::prelude::*;

// TODO: implement engine module (Task 2)
// pub mod engine;
pub mod protocol;
pub mod websocket;

#[wasm_bindgen(start)]
pub fn init() {
    console_log::init_with_level(log::Level::Info).ok();
}
