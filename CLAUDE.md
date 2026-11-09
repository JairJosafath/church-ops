# church-ops

This repository is the model of church-ops, a product built by
[theos](https://github.com/JairJosafath/theos), a Kubernetes software factory.
It holds no application code. theos creates a Git repository for each
Container itself, scaffolds it from the catalog, and its Crews build each one
from issues. What lives here is the C4 story theos builds from, plus the
domain text its agents read.

## What is here

| Path | What it is |
| --- | --- |
| `model/project.yaml` | Project `church-ops` and the Persons: worship leader, volunteer, pastor, tech and stream operator, member |
| `model/domain.yaml` | Domain `church-ops`, pinned to this repository's domain files at a commit |
| `model/systems.yaml` | SoftwareSystem `church-ops` (Internal, `domainRefs: [church-ops]`), and the External systems `obs`, `ableton` and `chat-host` |
| `model/containers.yaml` | Containers `web` (react-vite, static-site), `api` (python-fastapi, service) and `integrations-worker` (python-cli, worker), all on k8s-manifests, and DataStore `church-ops-db` (postgres) |
| `model/relationships.yaml` | Who uses what, and how the parts and the External systems talk |
| `model/crews.yaml` | A Crew per Container: implementer, reviewer, triager, spec writer, `specApproval: Person` |
| `brief.yaml` | The same product as a Brief in plain words, for the planner |
| `README.md`, `*.md` at the root, `.theos/` | The church-ops Domain template: what the product is about, for the implementer and reviewer agents |

Everything is `theos.factory.io/v1beta1` in namespace `church-ops`. The
Project's name equals its namespace. The model is shaped like theos's
reference application, `config/samples/webshop`.

## Applying it

The catalog (Frameworks, Standards, Compute, Deployments, the `postgres`
Connector), the Agents and GitProvider `gitea` are made per namespace by the
theos chart. Install or upgrade it with `church-ops` in `gitea.projects`
(for example `--set 'gitea.projects={webshop,church-ops}'`), and make Secret
`claude-credentials` (theos's `docs/getting-started.md`, steps 1 and 2).
Without that, nothing in `model/` resolves. Copying the catalog into the
namespace yourself is the other way.

**The planner's way.** The planner writes the model from the Brief:

```bash
kubectl apply -f model/project.yaml -f model/domain.yaml
kubectl apply -f brief.yaml
kubectl -n church-ops wait brief/church-ops --for=jsonpath='{.status.phase}'=Planned --timeout=45m
kubectl -n church-ops get theos
```

**The hand-written model.** Use it as the fallback if the planner's round
fails (`Planned=False`), or on its own:

```bash
kubectl -n church-ops delete brief church-ops --ignore-not-found   # keeps what it made
kubectl apply -f model/
kubectl -n church-ops get theos
```

Delete anything a failed round created under names that differ from
`model/`. Applying `brief.yaml` after `model/` keeps the hand-written model:
the planner then only files the Containers' first issues.

## The rules

- The factory's rules are in the theos repository: `docs/design.md` ("The
  model", "Briefs", "Crews and releases"), `docs/getting-started.md`, and
  the CRDs in `config/crd/bases`. This repository follows them and doesn't
  restate or bend them.
- Anything theos lacks, or gets wrong, is filed as an issue in
  [JairJosafath/theos](https://github.com/JairJosafath/theos/issues), not
  worked around here. For example, theos can't point a template at a
  subdirectory ([theos#35](https://github.com/JairJosafath/theos/issues/35)).
- Every `frameworkRef`, `standardRef`, `computeRef`, `deploymentRef` and
  `connectorRef` names an entry of the seed catalog
  (`templates/versions.txt` in theos) that supports the Container's type.
  Every Crew names seed Agents (`planner`, `designer`, `implementer`,
  `reviewer`). The chart has no `triager` or spec-writer Agent.
- A Container is scaffolded once. A change to an existing Container is an
  issue in its own repository, not an edit of the template here.
- Validate before you push. Apply `model/` and `brief.yaml` with a
  server-side dry run against a cluster or an envtest API server that has
  theos's CRDs installed, so the schemas and the CEL rules are checked.

## The domain in this repository

theos reads a Domain's whole repository at the pinned ref. Every file
outside `.theos/` must be Markdown (anything else fails every Container's
scaffold with `DomainNotMarkdown`), and every Markdown file is copied into
each Container's `docs/agents/domain/church-ops/`. This `CLAUDE.md`,
`model/` and `brief.yaml` sit on `main` beside the domain, so:

- `model/domain.yaml` pins tag `v0.1.0` (commit `f182c4a`), the domain
  alone.
- Until theos#35 lands, cut the next domain tag from a commit that holds
  only the domain's Markdown and `.theos/`, never from `main`.
  `.theos/CLAUDE.md` has the steps for the domain's content and versions.
- Once theos#35 lands, move the domain into a subdirectory, set
  `template.path` in `model/domain.yaml`, and tag from `main`.
