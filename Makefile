# The quality contract of this repository. CI runs `make check` on every pull
# request, or, when the Container's checks are BeforeRelease, `make check-light`
# there and `make check` before each release; agents and people run
# `make check` before every commit. `make help` lists the targets.

NAME := web
BIN := node_modules/.bin

.DEFAULT_GOAL := help
.PHONY: help check check-light deps fmt fmt-check lint typecheck test build-check dist clean

help: ## List the targets.
	@awk 'BEGIN {FS = ":.*## "} /^[a-z-]+:.*## / {printf "  %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

check: deps fmt-check lint typecheck test build-check ## Everything CI checks.

check-light: deps fmt-check lint typecheck ## check without the tests, which CI runs on each change with checks BeforeRelease.

deps: ## Install the exact packages in package-lock.json.
	npm ci --no-audit --no-fund

fmt: ## Format every file with Prettier.
	$(BIN)/prettier --write .

fmt-check: ## Fail when a file is not formatted.
	$(BIN)/prettier --check .

lint: ## Lint with eslint.config.mjs, failing on any finding.
	$(BIN)/eslint --max-warnings 0 .

typecheck: ## Type-check with tsconfig.json.
	$(BIN)/tsc --noEmit

test: ## Run the unit tests.
	$(BIN)/vitest run

build-check: ## Fail when the site does not build.
	@tmp=$$(mktemp -d) && trap 'rm -rf "$$tmp"' EXIT && \
		$(BIN)/vite build --outDir "$$tmp" --emptyOutDir

dist: deps ## Build the site into dist/ for a release.
	rm -rf dist
	$(BIN)/vite build

clean: ## Remove build output.
	rm -rf dist
