FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /workspace

# Workspace root + shared package (for uv workspace resolution)
COPY pyproject.toml /workspace/pyproject.toml
COPY uv.lock /workspace/uv.lock
COPY packages/substrate-common /workspace/packages/substrate-common

# Service manifest (copy first for better layer caching of deps)
COPY services/gateway/pyproject.toml /workspace/services/gateway/pyproject.toml

WORKDIR /workspace/services/gateway
RUN uv sync --frozen --no-dev

# Service source + canonical default config
COPY services/gateway/src /workspace/services/gateway/src
COPY services/gateway/config.yaml /workspace/services/gateway/config.yaml

EXPOSE 8080

CMD ["uv", "run", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]
