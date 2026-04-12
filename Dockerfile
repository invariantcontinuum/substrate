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

WORKDIR /docs

# Install mkdocs and dependencies
RUN pip install --no-cache-dir \
    mkdocs \
    mkdocs-material \
    mkdocs-minify-plugin

# Copy documentation source
COPY docs /docs

# Build documentation
RUN mkdocs build --site-dir /docs/site

# Production stage
FROM nginx:alpine

# Copy frontend build
COPY --from=build /app/dist /usr/share/nginx/html

# Copy built documentation
COPY --from=docs-build /docs/site /usr/share/nginx/html/docs

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Remove default nginx config
RUN rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
