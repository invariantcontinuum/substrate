FROM node:22-alpine AS build

ARG GITHUB_TOKEN
WORKDIR /app

# Configure npm to authenticate with GitHub Packages
RUN npm config set @invariantcontinuum:registry https://npm.pkg.github.com/ && \
    npm config set //npm.pkg.github.com/:_authToken ${GITHUB_TOKEN}

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Build documentation
FROM python:3.12-alpine AS docs-build

WORKDIR /src

# Install mkdocs and dependencies
RUN pip install --no-cache-dir \
    mkdocs \
    mkdocs-material \
    mkdocs-minify-plugin

# Stage mkdocs.yml at /src and content at /src/docs for the default mkdocs layout.
# The second COPY also brings mkdocs.yml into /src/docs/ which mkdocs ignores.
COPY docs/mkdocs.yml /src/mkdocs.yml
COPY docs /src/docs

# Build documentation. If mkdocs fails (WIP docs site), fall back to an empty
# placeholder so the final image still assembles.
RUN mkdocs build --site-dir /src/site \
    || (mkdir -p /src/site && echo '<html><body><h1>Documentation build skipped</h1></body></html>' > /src/site/index.html)

# Production stage
FROM nginx:alpine

# Copy frontend build
COPY --from=build /app/dist /usr/share/nginx/html

# Copy built documentation
COPY --from=docs-build /src/site /usr/share/nginx/html/docs

# Copy nginx configuration, overwriting the stock default.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Entrypoint scrubs unreachable IPv6 host.docker.internal from /etc/hosts
# before launching nginx so upstreams resolve cleanly.
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose port
EXPOSE 3000

# Health check — force IPv4 because nginx only listens on 0.0.0.0:3000 and
# busybox wget on Alpine prefers IPv6 when resolving localhost.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# Start nginx via entrypoint
CMD ["/docker-entrypoint.sh"]
