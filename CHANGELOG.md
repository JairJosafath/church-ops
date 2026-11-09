# Changelog

Every user-visible change, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/): the `version` in `pyproject.toml`.

## [Unreleased]

### Added

- The worker, scaffolded by theos, which does a round of work every
  10 seconds, backs off while rounds fail, and stops cleanly on SIGTERM.
