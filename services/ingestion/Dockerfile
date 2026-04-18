FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

COPY pyproject.toml .
RUN uv sync --no-dev --frozen 2>/dev/null || uv sync --no-dev

COPY src/ src/
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

EXPOSE 8081

ENTRYPOINT ["./entrypoint.sh"]
