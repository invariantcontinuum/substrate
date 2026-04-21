FROM python:3.12-alpine AS build

WORKDIR /src

RUN pip install --no-cache-dir \
    mkdocs \
    mkdocs-material \
    mkdocs-minify-plugin

COPY docs/mkdocs.yml /src/mkdocs.yml
COPY docs /src/docs

RUN mkdocs build --site-dir /src/site

FROM nginx:1.27-alpine

COPY --from=build /src/site /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1
