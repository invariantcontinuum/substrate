// crates/graph-worker-wasm/src/websocket.rs
use std::cell::RefCell;
use std::collections::VecDeque;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use web_sys::{CloseEvent, ErrorEvent, MessageEvent, WebSocket};

pub struct WsClient {
    ws: WebSocket,
    messages: Rc<RefCell<VecDeque<String>>>,
    _on_message: Closure<dyn FnMut(MessageEvent)>,
    _on_close: Closure<dyn FnMut(CloseEvent)>,
    _on_error: Closure<dyn FnMut(ErrorEvent)>,
}

impl WsClient {
    pub fn connect(url: &str, token: &str) -> Result<Self, JsValue> {
        let full_url = format!("{}/ws?token={}", url, token);
        let ws = WebSocket::new(&full_url)?;

        let messages: Rc<RefCell<VecDeque<String>>> = Rc::new(RefCell::new(VecDeque::new()));

        let msgs = messages.clone();
        let on_message = Closure::wrap(Box::new(move |e: MessageEvent| {
            if let Some(txt) = e.data().as_string() {
                msgs.borrow_mut().push_back(txt);
            }
        }) as Box<dyn FnMut(MessageEvent)>);
        ws.set_onmessage(Some(on_message.as_ref().unchecked_ref()));

        let on_close = Closure::wrap(Box::new(move |_: CloseEvent| {
            log::info!("WebSocket closed");
        }) as Box<dyn FnMut(CloseEvent)>);
        ws.set_onclose(Some(on_close.as_ref().unchecked_ref()));

        let on_error = Closure::wrap(Box::new(move |_: ErrorEvent| {
            log::warn!("WebSocket error");
        }) as Box<dyn FnMut(ErrorEvent)>);
        ws.set_onerror(Some(on_error.as_ref().unchecked_ref()));

        Ok(Self {
            ws,
            messages,
            _on_message: on_message,
            _on_close: on_close,
            _on_error: on_error,
        })
    }

    pub fn poll(&mut self) -> Option<String> {
        self.messages.borrow_mut().pop_front()
    }

    pub fn send(&self, msg: &str) -> Result<(), JsValue> {
        self.ws.send_with_str(msg)
    }

    pub fn close(&self) {
        let _ = self.ws.close();
    }
}
