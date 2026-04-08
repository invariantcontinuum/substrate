import json
import asyncio
import nats
import structlog
from nats.js import JetStreamContext
from src.graph.store import GraphNode, GraphEdge, merge_nodes_batch, merge_edges_batch

logger = structlog.get_logger()

_nc: nats.NATS | None = None
_js: JetStreamContext | None = None
_sub = None
_on_delta_callback = None


def parse_graph_event(event_data: dict) -> tuple[list[GraphNode], list[GraphEdge]]:
    """Parse a GraphEvent dict into nodes and edges."""
    nodes = []
    for n in event_data.get("nodes_affected", []):
        nodes.append(
            GraphNode(
                id=n["id"],
                name=n["name"],
                type=n["type"],
                domain=n.get("domain", ""),
                source=event_data["source"],
                meta=n.get("meta", {}),
            )
        )
    edges = []
    for e in event_data.get("edges_affected", []):
        edges.append(
            GraphEdge(
                id=f"{e['source_id']}->{e['target_id']}",
                source=e["source_id"],
                target=e["target_id"],
                type=e.get("type", "depends"),
                label=e.get("label", ""),
            )
        )
    return nodes, edges


async def connect(url: str, on_delta=None) -> None:
    global _nc, _js, _on_delta_callback
    _nc = await nats.connect(url)
    _js = _nc.jetstream()
    _on_delta_callback = on_delta

    try:
        await _js.add_stream(name="signals", subjects=["signals.graph.>"])
    except Exception:
        pass

    try:
        await _js.add_stream(name="graph_updates", subjects=["graph.updates.>"])
    except Exception:
        pass

    logger.info("nats_consumer_connected", url=url)


async def start_consuming() -> None:
    global _sub
    if not _js:
        raise RuntimeError("NATS not connected")

    _sub = await _js.subscribe(
        "signals.graph.>",
        durable="graph-service",
        stream="signals",
    )

    async def _consume():
        async for msg in _sub.messages:
            try:
                event_data = json.loads(msg.data.decode())
                nodes, edges = parse_graph_event(event_data)

                await merge_nodes_batch(nodes)
                await merge_edges_batch(edges)

                delta = {
                    "type": "batch",
                    "events": [],
                    "timestamp": event_data.get("timestamp", ""),
                }
                for node in nodes:
                    delta["events"].append({
                        "type": "node_added",
                        "node": {
                            "id": node.id,
                            "name": node.name,
                            "type": node.type,
                            "domain": node.domain,
                            "status": node.status,
                            "source": node.source,
                            "meta": node.meta,
                        },
                    })
                for edge in edges:
                    delta["events"].append({
                        "type": "edge_added",
                        "edge": {
                            "id": edge.id,
                            "source": edge.source,
                            "target": edge.target,
                            "type": edge.type,
                            "label": edge.label,
                        },
                    })

                if _js and delta["events"]:
                    await _js.publish(
                        "graph.updates.delta",
                        json.dumps(delta).encode(),
                    )

                if _on_delta_callback and delta["events"]:
                    await _on_delta_callback(delta)

                await msg.ack()
                logger.info(
                    "event_processed",
                    nodes=len(nodes),
                    edges=len(edges),
                )
            except Exception as e:
                import traceback
                logger.error("event_processing_failed", error=str(e), traceback=traceback.format_exc())
                await msg.nak()

    asyncio.create_task(_consume())
    logger.info("consumer_started")


async def disconnect() -> None:
    global _nc, _sub
    if _sub:
        await _sub.unsubscribe()
        _sub = None
    if _nc:
        await _nc.close()
        _nc = None
    logger.info("nats_consumer_disconnected")
