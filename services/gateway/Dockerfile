FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /workspace

# Workspace root + shared package (for uv workspace resolution)
COPY pyproject.toml /workspace/pyproject.toml
COPY packages/substrate-common /workspace/packages/substrate-common

# Service manifest (copy first for better layer caching of deps)
COPY services/gateway/pyproject.toml /workspace/services/gateway/pyproject.toml

WORKDIR /workspace/services/gateway
RUN uv sync --no-dev

# Service source
COPY services/gateway/src /workspace/services/gateway/src

EXPOSE 8080

CMD ["uv", "run", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]
