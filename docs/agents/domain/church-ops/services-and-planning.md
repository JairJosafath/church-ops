# Services and planning

A church plans the same kind of gathering every week, and every week is a
little different: other songs, another preacher, a baptism, a guest band.
The plan is read by more people than anything else in the app: the leader
who builds it, the band who rehearse from it, the crew who run it live, the
pastor who wants to know how long they have. This topic is about a plan
that is easy to repeat, that says the same thing to everyone, and that
holds up while the service is happening.

## Practices

- A service belongs to a service type, and the type holds the defaults: the
  usual items in their usual order, the usual times, the teams and
  positions it needs. A new service starts from its type or from a past
  service the planner picks, never from an empty page, and a change to the
  type's template does not rewrite services already planned.
- A service has times, not one time: one or more rehearsals, the service
  itself, and for a church with two morning services, each of them. Every
  time is stored with the Dutch time zone and shown in local time, so a
  service in the week the clocks change starts when people think it does.
- The service order is a list of items, each with a kind, a title, a planned
  length and notes per team. Headers ("Worship", "Word", "Response") group
  items and take no time. The plan shows the running clock for every item
  from the service's start, and the total against the slot, so the planner
  sees a twenty-minute overrun before Sunday.
- A song item names an arrangement and a key. The arrangement carries the
  sequence, the tempo, the meter and the chart; the item may override the
  key and the sequence for that week, and the charts, the lyrics and the
  sound team's tempo follow the item, not the arrangement's default. A
  person may have a preferred key for an arrangement (the leader who sings
  it lower), offered as a suggestion when they are scheduled to lead it.
- Keys transpose correctly: a chart moved from G to B flat spells its
  chords in flats, and a capo shows the shapes the guitarist plays and the
  key that sounds. Charts are stored as chords over lyrics, not as images,
  so they can be transposed; an uploaded PDF is an attachment, labelled with
  the key it is in.
- The service order is what the congregation and the leaders see; the run
  sheet is the same items with the cues and notes for each team. One list
  serves both, with each note marked for the teams that should see it, so
  the run sheet can never disagree with the order.
- A plan has a state that people can trust: being drafted, ready for the
  teams (published), and done. Changes after publication are shown to the
  people they affect, and a song added or changed after the band's
  rehearsal is called out, not slipped in.
- Live mode is one current item, advanced by one person (the service
  producer), that every other screen follows: the band's charts, the lyric
  operator, the stream, the sound computer. Advancing is a deliberate
  action with an undo, and the item's real start and end times are
  recorded, so next week's plan can learn how long things take.
- Song usage is recorded from what was actually played in live mode, or
  from the published plan when there was no live mode, and reported to the
  licence holder (CCLI in the Netherlands as elsewhere) on its schedule.
  Each song records its licence number and whether it may be shown, printed
  and streamed under the church's licences.
- A service is planned weeks ahead, so the plan reads the people's
  availability and blockouts while it is being made, not only when the
  requests go out (`people-and-teams.md`).

## Common mistakes

- A song item without an arrangement, so the band, the lyrics and the click
  each pick a different version of the same song.
- Storing the key on the song, so changing it for one Sunday changes it for
  every Sunday that song is played.
- A transposer that spells every key with sharps, giving a guitarist A sharp
  major instead of B flat.
- A run sheet kept as a separate document that someone copies the order
  into, so the 10:47 cue for camera 2 points at an item that was moved.
- Durations that do not add up: a running clock that ignores headers, or one
  that ignores the gap between the welcome and the first song.
- Times stored without a time zone, so in the week of the clock change the
  rehearsal moves by an hour in the calendar invites.
- Editing a published plan silently: the drummer learns about the new song
  at the sound check.
- Live mode that every device can advance, so a tap on a phone in the band
  skips the lyrics ahead during the prayer.
- Treating lyrics on the screen as free to stream: the church's licence to
  project lyrics in the building is not a licence to stream them.
- Copying last year's Christmas service by reference, so editing it this
  year edits last year's record.

## Controversies

- **Build each service from scratch, from a template, or from last week?**
  Templates keep the structure; copying last week keeps the songs that
  worked. *The choice:* a new service starts from its type's template by
  default, and the planner may start from any past service instead; either
  way it is a copy, with no link back. Why: a template is the church's
  habit and a past service is a shortcut, and neither should change when
  the copy does.
- **Chord charts as text or as uploaded files?** Many bands bring PDFs.
  *The choice:* the chart of record is text (chords over lyrics, sections
  named), so it transposes and its sequence follows the item; PDFs are
  attachments. Why: a key change is the most common edit to a plan, and an
  image cannot follow it.
- **One running order, or one per team?** Each team wants its own view.
  *The choice:* one list of items, with notes and cues marked per team, and
  a view per team over it. Why: two lists drift; one list cannot disagree
  with itself.
- **Who advances live mode?** The worship leader, the producer, or anyone?
  *The choice:* one named person per service holds live control, it can be
  handed over explicitly, and everyone else follows. Why: a live service has
  one clock; two people moving it is the failure, not the feature.
- **Plan with exact clock times, or with lengths?** Times look precise and
  break when one item overruns. *The choice:* items have lengths and the
  clock is computed from the start time; a fixed time (a broadcast slot, the
  end of the service) is a constraint the plan warns against, not a field
  on every item. Why: an overrun moves everything after it, and the plan
  should show that, not hide it.

## Sources

- CCLI, the Church Copyright Licence, the Streaming Licence and usage
  reporting: https://ccli.com/
- Planning Center Services, as the reference for service types, plans,
  arrangements and live mode: https://www.planningcenter.com/services
- The Nashville Number System, the common way bands write charts
  independent of key: Chas Williams, *The Nashville Number System*
  (self-published, many editions).
- Rijksoverheid, summer and winter time in the Netherlands:
  https://www.rijksoverheid.nl/onderwerpen/zomertijd-wintertijd
