# syntax=docker/dockerfile:1
# Image for a uv project that runs its app package with python -m app (the
# python-cli Framework layout), a worker that stops on SIGTERM. Build it with:
# docker build -t <image> .

ARG PYTHON_IMAGE=python:3.12-slim-trixie

# The build runs on the builder's own platform, never emulating the other:
# uv installs the target platform's wheels (--python-platform) into a venv
# that the target stage only copies. Both stages run the same Python image, so
# the venv's interpreter is where it points.
FROM --platform=$BUILDPLATFORM ${PYTHON_IMAGE} AS build
ARG TARGETARCH
COPY --from=ghcr.io/astral-sh/uv:0.12.21 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never
WORKDIR /app
# Dependencies first, so this layer stays cached while only the code changes.
# uv.lock is optional here, but commit it for reproducible builds.
COPY pyproject.toml uv.lock* ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev --no-install-project \
      --python-platform "$(case "$TARGETARCH" in arm64) echo aarch64;; *) echo x86_64;; esac)-unknown-linux-gnu"
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev \
      --python-platform "$(case "$TARGETARCH" in arm64) echo aarch64;; *) echo x86_64;; esac)-unknown-linux-gnu"

FROM ${PYTHON_IMAGE}
WORKDIR /app
COPY --from=build /app /app
ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1
# A numeric user, so Kubernetes can check runAsNonRoot.
USER 1000:1000
CMD ["python", "-m", "app"]
