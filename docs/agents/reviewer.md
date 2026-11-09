# Reviewer guide

You review one pull request against the issue it closes: its acceptance
criteria, the diff, CI's result and the C4 context. You judge the change; you
don't rewrite it. Your task prompt says how to give your verdict; this guide
says what to check.

## Checklist, in priority order

1. **Acceptance criteria.** Report each one as met or not met, naming the test
   that proves it. A criterion is met only when a test would fail without the
   change. Missing or untested is not met.
2. **Correctness and edge cases.** Empty, huge, malformed and non-ASCII
   input; the first render and every later one; requests that fail, are slow
   or answer out of order (an effect ignores or aborts a stale one); every
   error handled and shown to the user.
3. **Tests.** They test behaviour through exports, would fail without the
   change, cover the edge cases above, and are deterministic: no real timers
   or real-time bounds (fake timers instead), no network. Component tests
   query by role and label, never by implementation details.
4. **Design.** Logic in pure modules, components only rendering and wiring;
   no state that can be derived from props or other state; effects only to
   sync with something outside React; names; no dead code; no speculative
   generality (options nobody needs, abstractions with one use); the change
   stays in the issue's scope.
5. **Errors and resources.** Every effect that subscribes, starts a timer or
   opens a connection returns the cleanup that ends it; promises are awaited
   or deliberately voided; errors reach the user on the page, saying what to
   do, never only in the console.
6. **Performance.** Nothing heavy runs on every render or keystroke; long
   lists have stable keys; a large dependency or page is loaded with `lazy`
   when it isn't needed at first; budgets from the issue or the system's
   needs are measured by a bench, never by a test with a time bound.
7. **Accessibility and docs.** Semantic elements, every input labelled, images
   with `alt`, everything usable by keyboard (WCAG 2.2 AA,
   `docs/style/react.md`); README and the CHANGELOG match the behaviour;
   messages tell a user what happened and what to do.
8. **Security.** No `dangerouslySetInnerHTML` or `javascript:` URLs from
   untrusted input; no secrets in `import.meta.env` or anywhere in the
   bundle; no user data in logs; new install scripts justified.

## The domains

This system is about church-ops. Check the change against
each domain's *Common mistakes*, in the topic files its guide names for the
part the change touches:

- `docs/agents/domain/church-ops/README.md`

A change that makes one is blocking: name the mistake and where, as for any
finding. Where a domain lists a choice, the change makes its choice unless the
issue says otherwise.

## Verdict

- **Blocking** means the change would ship a defect or break a stated need or
  acceptance criterion. Request changes only for blocking findings, and for a
  red CI (quote the failing step).
- **Everything else is non-blocking:** list it and approve.
- Each finding says what is wrong, where (`file:line`), the input that shows it,
  and what would fix it. No vague advice.
- Don't ask for style the linters already enforce, or for rules `docs/style/`
  doesn't have.

## Follow-ups

Name up to three issues worth filing later: non-blocking points that deserve
their own work. Each is a title and one to three sentences saying what and why.
The factory files them as `status/proposed` issues when the pull request merges.
A blocking problem is never a follow-up.

## When CI runs the full check

When `.gitea/workflows/check.yaml` has a `full` job, the Container's owner chose
`BeforeRelease`: green CI on the pull request means `make check-light` passed
(lint and the type or vet checks), not the tests. Take the tests' result
from the implementer's _How it was checked_ and judge the tests in the diff
yourself; the full `make check` runs on the release's commit before its tag.

## Standard changes

- **In a normal pull request,** don't require a change to a protected file
  (listed in `AGENTS.md`). Those change through a Standard change, a separate
  Task. An implementer's `Standard change:` line in the summary is only a note.
- **In a pull request that carries a Standard change,** it changes the paths
  its issue names, and other files only where `make check` fails without them.
  Require changes unless all four hold:
  - it weakens no check, and turns none off;
  - every other file it changes changes only what `make check` fails on
    without it, such as a test that checks what the protected paths produce;
  - it works with this change alone, without another branch;
  - it does no more than its issue asks.

## TypeScript and React notes

- `make check` built the site, and CI is green on the last commit.
- Look for: state copied from props or computed from other state; effects
  that only transform data or respond to an event; a fetch in an effect
  without an ignore flag or `AbortController`; missing effect cleanups;
  `as` casts or disable comments that hide a real type error; `console`
  logging; inputs without labels; values in `VITE_` variables that must stay
  secret.
- Behaviour only a real browser can show (layout, focus order, screen
  readers) is "could not be verified" unless a person tried it: say so rather
  than approving on faith.
