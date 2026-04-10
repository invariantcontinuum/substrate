import init, { handle_message, tick } from "../graph_worker_wasm.js";

let initPromise: Promise<void> | null = null;
let layoutRunning = false;
let tickScheduled = false;

self.onmessage = async (e: MessageEvent) => {
  if (!initPromise) {
    initPromise = init();
  }
  await initPromise;

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
