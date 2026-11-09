# Changelog

Every user-visible change, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/): the `version` in `pyproject.toml`.

## [Unreleased]

### Added

- Live mode drives OBS over obs-websocket 5 on each item advance: program
  (with `auto_switch`, the holding scene for off-stream items and unstreamed
  services), preview of the next scene, and the lower third.
- Live mode drives Ableton Live over OSC on each item advance: the current
  song, else the next one, is loaded and its tempo set; never a transport
  start or stop.
- OBS's and Ableton's state (`ok`, `unreachable`, `unconfigured`) is reported
  to the api; without `OBS_URL` or `ABLETON_OSC_HOST` that side logs what it
  would have sent.
- Due notifications are delivered through the log (the default) or a Matrix
  room, and marked sent; a failed one is tried again on the next poll.
- Settings from the environment, documented in `README.md`.
- The worker, scaffolded by theos, which does a round of work every
  `POLL_SECONDS` (1 by default), backs off up to 30 seconds while rounds
  fail, and stops cleanly on SIGTERM.
