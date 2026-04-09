import nats
import structlog
from nats.js import JetStreamContext
from src.schema import GraphEvent

logger = structlog.get_logger()

_nc: nats.NATS | None = None
_js: JetStreamContext | None = None


async def connect(url: str) -> None:
    global _nc, _js
    _nc = await nats.connect(url)
    _js = _nc.jetstream()
    try:
        await _js.add_stream(name="signals", subjects=["signals.graph.>"])
    except Exception:
        pass
    logger.info("nats_connected", url=url)


async def publish(event: GraphEvent) -> None:
    if not _js:
        raise RuntimeError("NATS not connected")
    subject = f"signals.graph.{event.source}.{event.event_type}"
    await _js.publish(subject, event.model_dump_json().encode())
    logger.info("event_published", subject=subject, event_id=event.id)


async def publish_raw(subject: str, data: bytes) -> None:
    if not _js:
        raise RuntimeError("NATS not connected")
    await _js.publish(subject, data)


async def disconnect() -> None:
    global _nc, _js
    if _nc:
        await _nc.close()
        _nc = None
        _js = None
        logger.info("nats_disconnected")
