# church-ops (Domain, catalog entry `church`)

What software for a church to organize itself is about, as Markdown an
agent reads before it plans or reviews a change: a `README.md` with a
glossary and one line per topic file, and a topic file per area (services
and planning, people and teams, streaming and OBS, sound and Ableton, chat
and notifications, giving and finance), each with *Practices*, *Common
mistakes*, *Controversies* (the choice and why) and *Sources*. Plain prose,
no code to copy and no stack: the Standard has the stack. Written for a
church in the Netherlands (GDPR and UAVG, ANBI, euros).

- **Named by:** a SoftwareSystem's `spec.domainRefs` (`church`). Every
  Container of that system gets it, whatever its type: a Domain has no
  `supportedTypes`.
- **Writes:** every file outside this `.theos/` folder under
  `docs/agents/domain/church/`; the operator adds the prefix, so the files
  name each other by their bare names. Markdown only: a file of any other
  kind fails the Container. This folder is not rendered.
- **Read by:** the Standards' `AGENTS.md` and `docs/agents/reviewer.md`,
  which tell the implementer to read the README and the topic files for the
  part it touches, and the reviewer to check a change against each topic's
  *Common mistakes*.
- **Scaffold once:** written at the Container's scaffold and never updated
  by the operator; a person may update a scaffolded copy by hand.
- **Shape:** the same as theos's `templates/webshop-domain`, which
  `TestDomainTemplatesHaveTheShape` checks: Markdown only, a README naming
  every topic file, the four headings in each.

How to maintain this repository and cut a release is in `CLAUDE.md` next
to this file.
