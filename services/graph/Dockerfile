FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# Install Flyway
ARG FLYWAY_VERSION=10.20.0
RUN curl -fsSL https://repo1.maven.org/maven2/org/flywaydb/flyway-commandline/${FLYWAY_VERSION}/flyway-commandline-${FLYWAY_VERSION}-linux-x64.tar.gz \
    | tar -xz -C /opt \
    && ln -s /opt/flyway-${FLYWAY_VERSION}/flyway /usr/local/bin/flyway

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /workspace

# Workspace root + shared package (for uv workspace resolution)
COPY pyproject.toml /workspace/pyproject.toml
COPY packages/substrate-common /workspace/packages/substrate-common

COPY services/graph/pyproject.toml /workspace/services/graph/pyproject.toml

WORKDIR /workspace/services/graph
RUN uv sync --no-dev

COPY services/graph/migrations /workspace/services/graph/migrations
COPY services/graph/src /workspace/services/graph/src
COPY services/graph/entrypoint.sh /workspace/services/graph/entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 8082

ENTRYPOINT ["./entrypoint.sh"]
