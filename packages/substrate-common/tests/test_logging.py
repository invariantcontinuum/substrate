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


def test_logger_exception_emits_traceback(capsys):
    """logger.exception() must include the formatted traceback in JSON output.

    Regression for DSG-2026-04-27-A §1.5 — structlog without
    format_exc_info silently drops exc_info from the rendered event.
    """
    # Force JSON renderer (pretty=False).
    configure_logging("test-svc", pretty=False)
    log = structlog.get_logger()
    try:
        raise RuntimeError("boom")
    except RuntimeError:
        log.exception("operation_failed", op="probe")

    captured = capsys.readouterr().out.strip().splitlines()
    assert captured, "no log output captured"
    rec = json.loads(captured[-1])
    assert rec["event"] == "operation_failed"
    assert rec["service"] == "test-svc"
    assert rec["op"] == "probe"
    assert "exception" in rec, f"traceback missing from record: {rec}"
    assert "RuntimeError: boom" in rec["exception"]
    assert "test_logging.py" in rec["exception"]
