# church-ops: maintainer notes

This repository's root Markdown is a theos Domain template
(github.com/JairJosafath/theos): the catalog entry `church-ops`
(`model/domain.yaml`), what software for a church to organize itself is
about, for theos's implementer and reviewer agents. It mirrors theos's
`templates/webshop-domain`. A theos `Domain` names this repository's URL
and a pinned ref; every Container of a SoftwareSystem whose `domainRefs`
names `church-ops` gets the files under `docs/agents/domain/church-ops/`.
The same repository also holds the product's model (`model/`, `brief.yaml`,
the root `CLAUDE.md`), which is not part of the domain: see *Cutting the
next tag*.

These notes live in `.theos/` on purpose: theos does not render `.theos/`,
and a `CLAUDE.md` at the root would be copied into every Container, where
the agents that read the domain would load it as instructions. Keep
maintainer material here.

## The rules

- Markdown only outside `.theos/`: any other file (a `.gitignore`, a
  licence without `.md`, an image) fails every Container that scaffolds
  this Domain with `DomainNotMarkdown`. Nothing goes at the root that is
  not a `.md` the agents should read.
- `README.md` is required: the purpose, the glossary, the sentence that
  agents read these files and never edit them, and one line per topic file
  naming it in backticks. A topic file the README does not name breaks the
  shape.
- Each topic file has, as `##` headings, exactly *Practices*, *Common
  mistakes*, *Controversies* and *Sources*, in that order. Each
  controversy ends with *The choice:* and a *Why:*. Plain prose: no code,
  no stack, no product the Standard should choose.
- The church is in the Netherlands: privacy is the GDPR with the UAVG,
  giving is under the Belastingdienst's ANBI rules, money is euros.

## Cutting the next tag

A tag is a release: theos pins it in the Domain's `spec.template.ref`, and
a tag is never moved or re-used once a Domain points at it (a scaffolded
Container records `church-ops@<tag>`).

1. Make the change on a branch and merge it to `main`.
2. Check the shape: only `.md` files outside `.theos/`, the README names
   every topic file, each topic file has the four headings.
3. Pick the version by semantic versioning: a patch (`v0.1.1`) for wording
   and fixes, a minor (`v0.2.0`) for a new topic, a changed choice or a new
   practice or common mistake, a major (`v1.0.0`) for a renamed or removed
   topic file or when the domain is declared stable.
4. Tag a commit that holds only the domain: the root `.md` files and
   `.theos/`. Until theos can read a subdirectory
   (github.com/JairJosafath/theos/issues/35), never tag `main`: it also
   holds `model/`, `brief.yaml` and a root `CLAUDE.md`, which would fail
   or leak into every Container. Make the domain-only commit from the
   last domain tag with the changed domain files checked out from `main`,
   then tag it with an annotated tag and push it:
   `git tag -a v0.2.0 -m "church domain v0.2.0: <what changed>"`, then
   `git push origin v0.2.0`.
5. Update the Domain's `spec.template.ref` to the new tag. A Domain is
   scaffolded once: Containers already scaffolded keep the old text, and a
   person updates their copy under `docs/agents/domain/church-ops/` by hand if
   they want it.

## Releases

- `v0.1.0`: the first version, with six topics: services and planning,
  people and teams, streaming and OBS, sound and Ableton, chat and
  notifications, giving and finance.
