FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# Install Flyway
ARG FLYWAY_VERSION=10.20.0
RUN curl -fsSL https://repo1.maven.org/maven2/org/flywaydb/flyway-commandline/${FLYWAY_VERSION}/flyway-commandline-${FLYWAY_VERSION}-linux-x64.tar.gz \
    | tar -xz -C /opt \
    && ln -s /opt/flyway-${FLYWAY_VERSION}/flyway /usr/local/bin/flyway

# Install neo4j-migrations
ARG NEO4J_MIGRATIONS_VERSION=2.13.0
RUN curl -fsSL -o /tmp/neo4j-migrations.zip \
    https://github.com/michael-simons/neo4j-migrations/releases/download/${NEO4J_MIGRATIONS_VERSION}/neo4j-migrations-${NEO4J_MIGRATIONS_VERSION}-linux-x86_64.zip \
    && apt-get update && apt-get install -y --no-install-recommends unzip \
    && unzip /tmp/neo4j-migrations.zip -d /opt \
    && ln -s /opt/neo4j-migrations-${NEO4J_MIGRATIONS_VERSION}/bin/neo4j-migrations /usr/local/bin/neo4j-migrations \
    && rm /tmp/neo4j-migrations.zip \
    && apt-get remove -y unzip && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

COPY pyproject.toml .
RUN uv sync --no-dev --frozen 2>/dev/null || uv sync --no-dev

COPY migrations/ migrations/
COPY src/ src/
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

EXPOSE 8082

ENTRYPOINT ["./entrypoint.sh"]
