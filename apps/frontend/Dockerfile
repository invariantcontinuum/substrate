FROM node:22-alpine AS build

ARG GITHUB_TOKEN=""
# Vite reads these at build time. Promote them from build ARG → env so
# import.meta.env.VITE_* resolves during `pnpm run build`.
ARG VITE_KEYCLOAK_URL="http://localhost:8080"
ARG VITE_KEYCLOAK_REALM="substrate"
ARG VITE_KEYCLOAK_CLIENT_ID="substrate-frontend"
ARG VITE_GATEWAY_URL=""
ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL
ENV VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM
ENV VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID
ENV VITE_GATEWAY_URL=$VITE_GATEWAY_URL

WORKDIR /workspace

# Enable pnpm via corepack (bundled with node:22)
RUN corepack enable && corepack prepare pnpm@10 --activate

# Configure npm auth for @invariantcontinuum scoped packages (if ever used).
# Harmless when GITHUB_TOKEN is empty and no such package is in deps.
RUN npm config set @invariantcontinuum:registry https://npm.pkg.github.com/ \
    && npm config set //npm.pkg.github.com/:_authToken "$GITHUB_TOKEN"

# Workspace root + shared package (needed for pnpm workspace resolution)
COPY pnpm-workspace.yaml /workspace/pnpm-workspace.yaml
COPY package.json /workspace/package.json
COPY packages/substrate-web-common /workspace/packages/substrate-web-common

# Frontend manifest
COPY apps/frontend/package.json /workspace/apps/frontend/package.json

# Install in the workspace (resolves substrate-web-common via workspace:*)
RUN pnpm install --filter frontend...

# Frontend source
COPY apps/frontend /workspace/apps/frontend

WORKDIR /workspace/apps/frontend
RUN pnpm run build

# Build documentation (mkdocs)
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

# Production stage
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
