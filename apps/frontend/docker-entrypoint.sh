#!/bin/sh
# Docker populates /etc/hosts with both IPv4 and IPv6 entries for
# host.docker.internal. Nginx uses getaddrinfo at config load time, and
# depending on order may try the IPv6 address first, which is unreachable
# from inside the container on Docker Desktop / WSL2 and produces noisy
# "connect() to [fdc4:...] failed (Network unreachable)" errors.
#
# Strip any AAAA mapping for host.docker.internal so nginx only sees IPv4.
# The /etc/hosts file is writable by root inside the container.
if [ -w /etc/hosts ]; then
    tmp=$(mktemp) || exit 0
    awk '!(/[[:space:]]host\.docker\.internal([[:space:]]|$)/ && $1 ~ /:/)' \
        /etc/hosts > "$tmp" && cat "$tmp" > /etc/hosts
    rm -f "$tmp"
fi

exec nginx -g 'daemon off;'
