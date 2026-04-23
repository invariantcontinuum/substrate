FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /workspace

# Workspace root + shared packages (for uv workspace resolution)
COPY pyproject.toml /workspace/pyproject.toml
COPY uv.lock /workspace/uv.lock
COPY packages/substrate-common /workspace/packages/substrate-common
COPY packages/substrate-graph-builder /workspace/packages/substrate-graph-builder

# Service manifest (copy first for better layer caching of deps)
COPY services/ingestion/pyproject.toml /workspace/services/ingestion/pyproject.toml

WORKDIR /workspace/services/ingestion
RUN uv sync --frozen --no-dev

# Service source + entrypoint
COPY services/ingestion/src /workspace/services/ingestion/src
COPY services/ingestion/entrypoint.sh /workspace/services/ingestion/entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 8081

ENTRYPOINT ["./entrypoint.sh"]
