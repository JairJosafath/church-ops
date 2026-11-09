# Changelog

Every user-visible change, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/): the `version` in `package.json`.

## [Unreleased]

### Added

- The web app, scaffolded by theos.
- Services: list them, create one, and copy a past service to a new date.
- A plan page that adds, edits, reorders and removes items, with each item's
  start computed from the lengths before it and the service's end, in Dutch
  time; a view for the band and one for the stream.
- Songs with arrangements; a song item plays an arrangement, may set its own
  key, and the plan shows the key it is played in.
- Teams, positions and people; requests sent from the plan page, with a
  warning when the person blocked the date out.
- My requests: accept or decline in one tap, and add or remove blockouts.
- Live mode: one person holds control and moves on with Next and Back,
  everyone else follows every second and can be handed control; OBS and
  Ableton show their state.
- "You are": the person this browser acts for, until there is a sign-in.
