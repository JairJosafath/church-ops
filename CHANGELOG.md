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
- The plan's Teams section: set how many people each position needs, see
  who was asked with their answer and the open slots, and find who can fill
  a position, with badges for a blockout and its reason, a request the same
  day or at the same plan, and a decline here; Ask anyway still sends.
- Who can fill each position, added and removed on the People page.
- The Matrix: the next 12 plans side by side against the positions, each
  cell with its people, their status and the open slots, opening that plan's
  Teams section.
- My schedule: decline with a reason, see what you are confirmed for with
  links to the plan and its rehearse page, and withdraw from it with a
  reason when you can't make it after all.
- Live timers: the current item counts down from its length, into overtime
  below zero, and the projected end of the service stands next to the
  planned end.

### Changed

- My requests is now My schedule.
- A blockout's reason is shown to the planner who asks the person (the api
  gives it to the scheduler only); the blockout form says so.
- The plan's free choice of any person for any position is replaced by the
  Teams section, which asks the people who can fill the position.
