FROM pgvector/pgvector:pg16

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential flex bison libreadline-dev \
    postgresql-server-dev-16 git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --branch release/PG16/1.6.0 --depth 1 https://github.com/apache/age.git /tmp/age \
    && cd /tmp/age \
    && make -j$(nproc) && make install \
    && rm -rf /tmp/age

RUN apt-get purge -y build-essential flex bison git postgresql-server-dev-16 \
    && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
