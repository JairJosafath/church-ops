# Agent guide

This repository is Web, the `web` web app of church-ops: a page in React
and TypeScript, built with Vite, scaffolded by theos with the `ts-standard`
Standard. Build it to the rules below. What the app is for, and what it must
never do, is in the issue you were given and the system's needs: follow those.

## The one rule

`make check` must pass before every commit. It installs the exact packages in
`package-lock.json`, then runs Prettier (check), ESLint with `eslint.config.mjs`
(typescript-eslint strict, no warnings allowed), `tsc` with the strict
`tsconfig.json`, the vitest unit tests, and builds the site to prove it
still builds. CI runs the same command, and nothing reaches `main` without it
passing and a review. Never commit red.

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
   `Makefile`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`,
   `.editorconfig`, `AGENTS.md`, `docs/style/` and `docs/agents/` belong to the
   Standard. `tsconfig.json` and `vite.config.ts` decide what the checks check: don't
   loosen them.

## Lints

- Fix every finding; don't silence it. An `eslint-disable-next-line <rule> -- <why>`
  is a last resort for a false positive: one rule, one reason. Never
  `@ts-ignore`; never a file-wide disable.
- `make fmt` formats; never hand-format.
- Add packages with `npm install --save-exact` (`--save-dev` for tools), and
  commit `package-lock.json`. Vite bundles what the page imports, so
  `node_modules` never ships; what the page imports is a `dependency`, tools
  are `devDependencies`. Prefer the platform, React and the browser's APIs; then few,
  maintained, well-known packages with a licence that fits. A new install
  script needs an `allowScripts` entry in `package.json`: allow it only when the
  package can't work without it.
- A factory package (another Container of this project, published as
  `@theos/<container>`) is added the same way, at an exact version:
  `npm install --save-exact @theos/<container>@<version>`. The scope
  routes to the owner's registry through `~/.npmrc`, which your pod and CI
  write; never put the registry or a token in `package.json` or a committed
  `.npmrc`.

## Review rules (lint can't check these)

1. **Components are pure:** the same props and state render the same output;
   no side effects, `Date.now()` or randomness in render; props and state are
   never mutated. Components are defined at module level.
2. **State:** the least state that works, owned by the closest common parent;
   nothing stored that can be computed from props or other state.
3. **Effects only sync with something outside React** (a subscription, a
   timer, a request, a browser API), and return the cleanup that undoes it.
   Data changes from an event happen in the event handler. A request in an
   effect ignores or aborts a stale answer.
4. **Accessibility:** semantic elements (`button`, `a`, `label`, headings in
   order), every input labelled, images with `alt`, everything usable by
   keyboard with visible focus, status messages in an `aria-live` region
   (WCAG 2.2 AA).
5. **Errors users see** are on the page and say what happened and what to do;
   never only in the console. A failed request leaves the page usable.
6. **Never a secret in the bundle:** every `VITE_` variable and everything the
   page imports is public. Untrusted input never reaches
   `dangerouslySetInnerHTML` or a `javascript:` URL.
7. **Types:** no `any` (narrow `unknown` at the boundary, checked at runtime when
   the input is untrusted); no non-null assertion without a disable comment
   saying why; no `as` to silence the compiler; exhaustive switches over unions.
8. **Pure modules:** logic lives in modules that import neither React nor the
   DOM, tested with plain vitest. A component test brings its own DOM
   (`// @vitest-environment jsdom`) and queries by role and label.
9. **Tests:** next to the code (`foo.test.ts`), `it.each` tables, names that say
   what is expected; no real timers, network or shared state between tests.
10. **Performance:** when the issue or the system's needs state a budget, a test
    or benchmark measures it on realistic input and the pull request gives the
    numbers.
11. **Input:** empty, huge, malformed and non-ASCII input never breaks the
    page; lists have stable keys from the data, never the index of a list
    that changes.
12. **Releases:** user-visible changes get a `CHANGELOG.md` entry under
    "Unreleased"; the version in `package.json` changes only in a release issue.
13. **Names:** `lowerCamelCase` values, `UpperCamelCase` types, `CONSTANT_CASE`
    module constants, acronyms as words (`HttpUrl`); files `snake_case.ts`.
14. **No dead code:** no commented-out code, speculative options or "for later"
    features; no TODO without an issue number.

## Style guides

Offline digests (read the one for what you are touching):

- `docs/style/typescript.md`: Google's TypeScript style, the handbook's do's and
  don'ts and typescript-eslint, each rule marked [lint] or [review]
- `docs/style/react.md`: components, hooks, state, effects, accessibility,
  performance, Vite, security and tests
- `docs/style/principles.md`: cross-language principles, with sources
- `docs/style/SOURCES.md`: every source URL, with the date it was read

Online (canonical): https://google.github.io/styleguide/tsguide.html ·
https://typescript-eslint.io/rules/ · https://react.dev/reference/rules ·
https://react.dev/learn/you-might-not-need-an-effect ·
https://vite.dev/guide/ · https://www.w3.org/WAI/WCAG22/quickref/
