import init, { handle_message, tick } from "../graph_worker_wasm.js";

let initialized = false;
let layoutRunning = false;
let tickScheduled = false;

self.onmessage = async (e: MessageEvent) => {
  if (!initialized) {
    await init();
    initialized = true;
  }

  handle_message(e.data);

  if (
    e.data.type === "load_snapshot" ||
    e.data.type === "set_layout"
  ) {
    layoutRunning = true;
    scheduleTick();
  }
};

function scheduleTick() {
  if (tickScheduled) return;
  tickScheduled = true;

  setTimeout(() => {
    tickScheduled = false;
    if (!layoutRunning) return;

    const stillMoving = tick();
    if (stillMoving) {
      scheduleTick();
    } else {
      layoutRunning = false;
    }
  }, 16);
}
