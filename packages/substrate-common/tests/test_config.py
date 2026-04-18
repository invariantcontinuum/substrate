from pydantic_settings import BaseSettings

from substrate_common.config import load_settings


class _GatewaySettings(BaseSettings):
    service_name: str
    app_port: int = 8080


def test_load_settings_reads_prefixed_env(monkeypatch):
    monkeypatch.setenv("GATEWAY_SERVICE_NAME", "gateway")
    monkeypatch.setenv("GATEWAY_APP_PORT", "8080")
    s = load_settings("GATEWAY", _GatewaySettings)
    assert s.service_name == "gateway"
    assert s.app_port == 8080


def test_load_settings_ignores_extras(monkeypatch):
    monkeypatch.setenv("GATEWAY_SERVICE_NAME", "gateway")
    monkeypatch.setenv("GATEWAY_UNRELATED_VAR", "ok-to-ignore")
    s = load_settings("GATEWAY", _GatewaySettings)
    assert s.service_name == "gateway"
    assert s.app_port == 8080
