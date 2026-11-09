# The church domain

What software for a church to organize itself is about, for the agents that
build and review it: planning services, scheduling the people who serve in
them, running the stream and the band's computer on a Sunday, telling the
right people the right thing at the right time, and receiving gifts. The
practices that hold across churches, the mistakes that recur, and the
controversies with the choice this domain makes in each. Plain prose and no
stack: the Standard has the stack, this folder has the subject. The church
is in the Netherlands: the GDPR as the Dutch implement it (the UAVG), the
Belastingdienst's ANBI rules, euros.

Read this file, then the topic file for the part you touch. The implementer
follows the practices and makes the listed choices unless the issue says
otherwise; the reviewer checks a change against the *Common mistakes* of
the topics it touches. These files belong to the factory: an agent reads
them and never edits them.

## Glossary

- **Service type**: a recurring kind of gathering (Sunday morning, youth
  evening, a midweek prayer meeting) with its own default order, teams and
  times.
- **Service** (a plan): one gathering of a service type on a date, with its
  times (rehearsals, the service itself), its items and the people
  scheduled for it.
- **Item**: one entry of a service: a song, a reading, a sermon, a prayer, a
  video, an announcement, a header. It has a length, a title and notes per
  team.
- **Service order**: the items of a service in sequence, as the congregation
  and the leaders see it. **Run sheet**: the same order with the clock times,
  the cues for each team (camera, sound, lyrics, lights) and the notes the
  congregation never sees; what the crew follows live.
- **Live mode**: the run sheet while the service is happening, with a
  current item that one person advances and everyone else follows.
- **Song**: a work, with its title, authors, copyright and licence numbers
  (CCLI). **Arrangement**: one way this church plays a song: its sequence
  (verse, chorus, bridge), its tempo, meter, length, its chord chart and its
  default key. A service item names an arrangement, never just a song.
- **Key**: the tonal centre an arrangement is played in. The arrangement has
  a default; a service item may set its own (for the leader who sings it
  that week), and the charts transpose to it.
- **Rehearsal**: a time in a service's plan when its teams practise,
  scheduled with the same people as the service unless said otherwise.
- **Person**: anyone the church keeps a record of. **Member**: a person on
  the church's formal membership roll; **attender** or **guest**: someone
  who comes without being one. Membership is a status, not a kind of record.
- **Minor**: a person under eighteen. **Guardian**: a parent or legal
  guardian linked to a minor, who consents and is contacted for them.
- **Volunteer**: a person who serves in a team. **Team**: a group that
  serves (worship band, sound, stream, kids' church, welcome), with
  **positions** (drums, front-of-house, camera 2, group leader).
- **Schedule**: who fills which position at which service. A **request** is
  an invitation to fill a position, which the person accepts or declines;
  only an accepted request schedules them.
- **Availability**: when a person can serve; a **blockout** is a date or
  range they cannot, set by themselves.
- **Pastoral data**: what the church knows about a person's life in
  confidence: prayer requests, care notes, counselling, illness, marriage,
  grief. Seen only by the people the person would expect to see it.
- **Special category data**: data the GDPR protects most (article 9), which
  includes religious belief. In a church, being on the roll at all reveals
  it, so every person record is special category data.
- **VOG** (Verklaring Omtrent het Gedrag): the Dutch certificate of conduct
  that volunteers working with minors hold.
- **Scene**: one composed picture in OBS (a wide shot, the preacher with
  their name, the lyrics over the band). **Program** is the scene on air;
  **preview** is the one about to be.
- **Lower third**: a caption in the lower part of the picture: a name, a
  Bible reference, a song's credits.
- **Live** (streaming) and **recording**: two separate outputs; a service may
  be streamed and recorded, only recorded, or neither.
- **Click**: the metronome the band hears in their ears and the congregation
  never does. **Backing tracks** (stems): pre-recorded parts played in time
  with the band. **Cues**: spoken prompts in the band's ears ("chorus",
  "last time").
- **Ableton Link**: a protocol that keeps tempo and beat in step between
  devices on one network, with no leader. **MIDI**: the musical instruments'
  control protocol (notes, program changes, clock). **OSC** (Open Sound
  Control): a network message protocol for controlling audio software.
- **Notification**: a message the app sends a person (a request, a
  reminder, a change). **Adapter**: the part that delivers it through one
  channel (Matrix, Slack, WhatsApp, e-mail).
- **Gift** (a donation): money a person gives the church. **Fund**: what a
  gift is for (the general fund, missions, the building). **Collection**: the
  gathering of gifts in a service, in the plate or digitally.
- **ANBI** (algemeen nut beogende instelling): a Belastingdienst status that
  makes gifts to the church tax-deductible for the giver, with publication
  and administration duties for the church. **RSIN**: the church's fiscal
  number, which a periodic-gift agreement names.
- **Periodic gift**: a gift of a fixed amount, at least yearly, for at least
  five years, set down in a written agreement; deductible without a
  threshold.

## Topics

One file per area; each has *Practices*, *Common mistakes*, *Controversies*
(the choice this domain makes and why) and *Sources*.

- `services-and-planning.md`: service types and services, the service order
  and the run sheet, songs, arrangements and keys, rehearsals, live mode
  and song licensing.
- `people-and-teams.md`: people, members and guests, teams and positions,
  scheduling requests, availability and blockouts, and the privacy of
  minors and pastoral data under the GDPR in the Netherlands.
- `streaming-and-obs.md`: driving OBS over obs-websocket v5, scenes tied to
  the run sheet, lower thirds, live against recording, who may be seen on
  a stream, and what fails during a live service.
- `sound-and-ableton.md`: Ableton Live through Link, OSC and MIDI, the click
  and backing tracks, tempo and key from the arrangement, and what must
  never happen mid-song.
- `chat-and-notifications.md`: team chat and reminders through Matrix, Slack
  and WhatsApp adapters, who is told what and when, quiet hours, and what
  never goes into a chat.
- `giving-and-finance.md`: gifts and funds, the payment provider, periodic
  gifts and annual statements under the ANBI rules, the books, and never a
  card number in the app.
