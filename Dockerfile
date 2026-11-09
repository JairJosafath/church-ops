# syntax=docker/dockerfile:1
# Image for a Vite web app (the react-vite Framework layout): npm builds the
# static site into dist/, and an unprivileged nginx serves it on port 8080.
# Build it with: docker build -t <image> .

ARG NODE_IMAGE=node:24-bookworm-slim
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.29-alpine

# The build runs once, on the builder's own platform: Vite's output is the
# same on every platform, so the target stage only copies it.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
WORKDIR /app
# Dependencies first, so this layer stays cached while only the code changes.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM ${NGINX_IMAGE}
COPY --from=build /app/dist /usr/share/nginx/html
# The image's own user (nginx, 101), named by number so Kubernetes can check
# runAsNonRoot.
USER 101
EXPOSE 8080
