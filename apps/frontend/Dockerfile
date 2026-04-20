FROM node:22-alpine AS build

ARG GITHUB_TOKEN=""
# Vite bakes these at build time. Compose passes them via build args from
# .env (see compose.yaml frontend.build.args). No defaults on purpose —
# an unbranded build would leak dev URLs into a prod bundle.
ARG VITE_KEYCLOAK_URL
ARG VITE_KEYCLOAK_REALM
ARG VITE_KEYCLOAK_CLIENT_ID
ARG VITE_GATEWAY_URL=""
ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL
ENV VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM
ENV VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID
ENV VITE_GATEWAY_URL=$VITE_GATEWAY_URL

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10 --activate

RUN npm config set @invariantcontinuum:registry https://npm.pkg.github.com/ \
    && npm config set //npm.pkg.github.com/:_authToken "$GITHUB_TOKEN"

COPY pnpm-workspace.yaml /workspace/pnpm-workspace.yaml
COPY package.json /workspace/package.json
COPY packages/substrate-web-common /workspace/packages/substrate-web-common

COPY apps/frontend/package.json /workspace/apps/frontend/package.json

RUN pnpm install --filter frontend...

COPY apps/frontend /workspace/apps/frontend

WORKDIR /workspace/apps/frontend
RUN test -n "$VITE_KEYCLOAK_URL" || (echo "VITE_KEYCLOAK_URL build arg is required" >&2 && exit 1)
RUN pnpm run build

FROM python:3.12-alpine AS docs-build

WORKDIR /src

RUN pip install --no-cache-dir \
    mkdocs \
    mkdocs-material \
    mkdocs-minify-plugin

COPY apps/frontend/docs/mkdocs.yml /src/mkdocs.yml
COPY apps/frontend/docs /src/docs

RUN mkdocs build --site-dir /src/site \
    || (mkdir -p /src/site && echo '<html><body><h1>Documentation build skipped</h1></body></html>' > /src/site/index.html)

RUN find /src/site -name "*.html" -exec sed -i 's|<head>|<head><base href="/docs/">|' {} +

FROM nginx:alpine

COPY --from=build /workspace/apps/frontend/dist /usr/share/nginx/html
COPY --from=docs-build /src/site /usr/share/nginx/html/docs
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/frontend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

CMD ["/docker-entrypoint.sh"]
