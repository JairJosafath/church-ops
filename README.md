# church-ops v0.1: the demo kit

A snapshot, kept on the `factory/demo` branch, of what was used to run church-ops v0.1 on the
night of 2026-11-09. It is not part of the model on `main`.

- `CONTRACT.md`: the HTTP contract the three Containers were built against.
- `seed_demo.py`: fills an api with a demo church: seven people, three teams, five
  public-domain hymns, next Sunday's service and a copy of it.
- `booth_sim.py`: stands in for OBS (obs-websocket v5, password auth) and Ableton
  (OSC/UDP), with a page showing program, preview, lower third and the song loaded.
- `start-demo.sh`: brings it all up from the factory's Gitea. The paths in it are
  the cloud session's own.

The Containers' code is on the branches `factory/api`, `factory/web` and
`factory/integrations-worker`. Each is a copy of that repository's `main` in the
factory's Gitea, where theos scaffolded it and the work merged through pull requests
after CI.
