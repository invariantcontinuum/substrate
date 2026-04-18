import contextlib
import io
import json

import structlog

from substrate_common.logging import configure_logging


def test_emits_json_with_standard_fields():
    configure_logging(service="gateway", pretty=False)
    log = structlog.get_logger()

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        log.info("http_request", path="/health")

    lines = [ln for ln in buf.getvalue().splitlines() if ln.strip()]
    assert lines, "expected at least one log line"
    rec = json.loads(lines[0])
    assert rec["service"] == "gateway"
    assert rec["event"] == "http_request"
    assert rec["path"] == "/health"
    assert "ts" in rec
    assert rec["level"] == "info"
