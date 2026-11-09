# Agent guide

This repository is API, the `api` service of church-ops: one Python
project managed with uv, scaffolded by theos with the `python-standard`
Standard. Build it to the rules below. What it is for, and what it must never
do, is in the issue you were given and the system's needs: follow those.

## The one rule

`make check` must pass before every commit. It installs the exact packages in
`uv.lock` (and fails when the lock is stale), then runs `ruff format` (check),
ruff with `ruff.toml` (every rule, no findings allowed), mypy `--strict` with
`mypy.ini`, pytest, and builds the wheel and sdist to prove the project still
builds. CI runs the same command, and nothing reaches `main` without it passing
and a review. Never commit red.

## The domains

This system is about church-ops. Before you plan a
change, read each domain's guide and the topic files it names for the part
you touch:

- `docs/agents/domain/church-ops/README.md`

Follow their practices, and where they list a choice, make theirs unless the
issue says otherwise. Like `AGENTS.md`, they belong to the factory and never
change here.

## Workflow

1. Read the issue, its acceptance criteria, and your role guide:
   `docs/agents/implementer.md` or `docs/agents/reviewer.md`.
2. Read the code you are about to change and match it.
3. Write a failing test first: one per acceptance criterion, or one that shows the bug.
4. Make the smallest change that meets every criterion. One concern per commit.
5. `make check`, then commit with a Conventional Commit message
   (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`).
6. `AGENTS.md`, `docs/agents/` and `.theos.yaml` never change. Other protected files
   change only through a Standard change (see your role guide), never in a normal pull
   request. `.devcontainer/`, `.theos.yaml` and `.gitea/` belong to the platform.
   `Makefile`, `ruff.toml`, `mypy.ini`, `.editorconfig`, `AGENTS.md`, `docs/style/`
   and `docs/agents/` belong to the Standard. ruff and mypy read their own files
   first, so a `[tool.ruff]` or `[tool.mypy]` table in `pyproject.toml` changes
   nothing: don't add one.

## Lints

- Fix every finding; don't silence it. A `# noqa: <code>  <why>` or a
  `# type: ignore[<code>]  # <why>` is a last resort for a false positive: one
  code, one reason. Never a bare `noqa` or `type: ignore` (ruff rejects
  both), never a file-wide one.
- `make fmt` formats and sorts imports; never hand-format.
- Add packages with `uv add <package>` (`uv add --dev` for tools), and commit
  `pyproject.toml` with `uv.lock`. Prefer the standard library; then few,
  maintained, well-known packages with type hints (`py.typed`) and a licence
  that fits. A package without types needs its stubs (`types-<name>`) as a dev
  dependency, never an ignore.
- A factory package (another Container of this project) comes from the
  owner's index, declared once in `pyproject.toml` and the package pinned to
  it, so every other package stays on PyPI:

  ```toml
  [[tool.uv.index]]
  name = "theos"
  url = "<index>"
  explicit = true

  [tool.uv.sources]
  <container> = { index = "theos" }
  ```

  then `uv add <container>==<version>`. The index URL is the one your pod's
  `THEOS_PYPI_INDEX` names (the owner's Gitea by default,
  `<gitea>/api/packages/<owner>/pypi/simple`); the credentials come from
  `~/.netrc`, which your pod and CI write, never from `pyproject.toml`.

## Review rules (lint can't check these)

1. **Modules:** one purpose per module, named for what it provides; never
   `utils`, `common`, `helpers`. Imports point one way; no cycles, no imports
   inside functions to dodge one. Private by default: a leading underscore for
   names other modules don't use.
2. **Types:** precise types at every boundary; `Any` only where the value truly
   is anything, and narrowed (`isinstance`, a pydantic model) before use.
   Untrusted input is parsed into a typed value once, at the edge. No `cast()`
   to silence mypy; `Protocol` for what a caller needs, not a base class.
3. **Errors:** raise specific exceptions (your own subclass when callers branch
   on it) with what was being done and the input; `raise ... from err` when
   translating. Catch the narrowest exception, as close to the cause as can
   handle it; never `except Exception` to keep going. Handle an error once:
   raise it or log it, never both.
4. **Resources:** files, connections and clients in `with` (or `async with`);
   nothing opened at import time.
5. **No global state:** no mutable module variables, no work at import time.
   Configuration is read once, at start-up, from the environment, and passed
   down; inject clocks, clients and file systems so tests can replace them.
6. **Data:** `@dataclass(frozen=True, slots=True)` or a pydantic model for
   records, not dicts passed around; `enum.Enum` for closed sets; exhaustive
   `match` ending in `assert_never`.
7. **Tests:** pytest functions, `@pytest.mark.parametrize` tables with `ids`,
   names that say what is expected (`test_total_of_empty_order_is_zero`);
   fixtures for setup, `monkeypatch` and `tmp_path` instead of touching the real
   environment. No `time.sleep`, real network or order dependence. Test
   behaviour through the public API.
8. **Docs:** every public module, class and function has a docstring (ruff
   checks it is there; you check it says something): what it does, its units,
   what `None` and empty mean, what it raises (Google style, `Raises:`).
9. **Performance:** when the issue or the system's needs state a budget, a
   benchmark on realistic input measures it, and the pull request gives the
   numbers. No optimisation without a measurement.
10. **Input:** empty, malformed, huge and non-ASCII input never crash; error
    messages say what was wrong and where.
11. **The HTTP API:** pydantic models for every request and response body, never
    bare dicts; the right status code (201 with the created resource, 404 for a
    missing one, 422 is FastAPI's for invalid input); `HTTPException` with a
    `detail` a client can act on. Path operations stay thin: they parse, call a
    function that holds the logic, and map its result and errors to HTTP.
    Dependencies (`Depends`, `Annotated`) for shared resources, so tests
    override them with `app.dependency_overrides`. `/healthz` stays cheap and
    never calls a dependency.
12. **Async:** `async def` only when everything the path operation awaits is
    async; a blocking call (a sync database driver, `requests`, file I/O) goes in
    a plain `def`, which FastAPI runs in a thread. Never block the event loop.
13. **Names:** `snake_case` functions, variables and modules,
    `CapWords` classes, `UPPER_CASE` module constants; no `get_` prefix on
    plain reads; acronyms as words (`HttpClient`).
14. **No dead code:** no commented-out code, speculative options or "for later"
    features; no TODO without an issue number.

## Style guides

Offline digests (read the one for what you are touching):

- `docs/style/python.md`: PEP 8, PEP 257, Google's Python style, typing and
  pytest practice, each rule marked [lint] or [review]; its FastAPI and
  command-line sections apply to services and CLIs
- `docs/style/principles.md`: cross-language principles, with sources
- `docs/style/SOURCES.md`: every source URL, with the date it was read

Online (canonical): https://peps.python.org/pep-0008/ ·
https://google.github.io/styleguide/pyguide.html · https://docs.astral.sh/ruff/rules/ ·
https://mypy.readthedocs.io/en/stable/ · https://docs.pytest.org/en/stable/explanation/goodpractices.html ·
https://fastapi.tiangolo.com/tutorial/
