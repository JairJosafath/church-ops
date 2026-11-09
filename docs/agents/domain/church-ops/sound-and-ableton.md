# Sound and Ableton

A church band that plays to a click and backing tracks runs Ableton Live on
a laptop next to the drummer. The click and the cues go to the band's
in-ear monitors, the tracks go to the front-of-house mix, and the tempo and
key had better be the ones the band rehearsed. The app can set Live up from
the arrangement and follow the run sheet, but the laptop is part of the
music: anything the app does at the wrong moment, the whole room hears.

## Practices

- The arrangement is the source of the song's tempo, meter and sequence,
  and the service item of its key (`services-and-planning.md`). The app
  sends those to the music computer before the service, when the song is
  loaded, and never changes them while the song plays.
- Ableton Link keeps tempo and beat in step between the music computer,
  the app's devices and any other Link-enabled tool (a drummer's metronome
  app, a lighting desk) on the same local network. Link has no leader: any
  peer may change the tempo, and every peer follows. The app joins Link to
  read the tempo and the beat, and changes the session tempo only between
  songs, when the transport is stopped or the item is advancing.
- Link carries tempo, beat and phase, and, with start and stop sync enabled,
  transport start and stop. It does not carry the key, the song, the
  position in the song or the set list. Those go to Live as MIDI (program
  changes or notes mapped to scenes and to locators) or as OSC messages to
  a control surface script, set up by the church's sound team; the app
  speaks the mapping the church configured, and nothing else.
- Each song is prepared in Live in the keys the church plays it in: stems
  rendered or recorded per key, chosen when the item's key is set. Live can
  transpose audio, but backing vocals and pads warped across several
  semitones sound wrong; the app warns when an item's key has no prepared
  stems, before the service.
- The click, the count-in and the spoken cues go only to the band's in-ear
  mix, on their own outputs; the backing tracks go to the front-of-house
  mixer as their own channels, so the sound engineer controls their level
  and can mute them. The app never routes audio; the music computer's
  outputs and the mixer's channels are set by the sound team.
- The song starts when the band leader starts it: by a pedal, a pad, a
  button on the music computer, or the app's start control in the band's
  view. Advancing the run sheet loads the next song; it does not start it.
- The app knows when a song is playing (the transport is running, or the
  song's scene is active) and holds every change for the music computer
  until it stops: a new tempo, a new key, the next song's scene, a set
  reload. A held change is shown as pending, not dropped.
- Every song has a way out: the band leader can stop the tracks with the
  click and the band carries on, or loop the current section (a chorus
  repeated during a response time) without the app's involvement. These are
  controls in Live, mapped by the sound team; the app shows their state.
- The music computer runs on the church's local network with no
  dependence on the internet, and a lost connection to the app leaves Live
  playing exactly as it was.

## Common mistakes

- Changing the Link tempo for the next song while this one is still
  playing, so the band and the tracks lurch to the new tempo mid-verse.
- A phone or tablet running a Link-enabled app on the same network that
  someone taps, changing the tempo for everyone, because nothing says
  which devices may join.
- Starting the next song's transport as a side effect of advancing the run
  sheet, so the count-in starts during the pastor's prayer.
- The click or the cues on a channel that reaches the front-of-house mix,
  so the congregation hears "chorus, two, three, four".
- Reloading the Live set, or switching sets, during the service.
- Transposing backing tracks across many semitones in real time because
  the plan changed the key the night before, and nobody listened to it.
- Taking the tempo from the song record instead of the arrangement, so the
  band plays the original's tempo while the tracks were made at the
  church's.
- Treating Link's tempo as the song: assuming Link tells the app which song
  is loaded or where in it the band is.
- Retrying a failed MIDI or OSC message during a song, so a delayed program
  change fires in the bridge.
- Making the music computer depend on a cloud service or a login to load
  the set.

## Controversies

- **Should the app drive Live at all, or only display?** Every feature that
  sends to Live is a feature that can go wrong in front of the room.
  *The choice:* the app sends the song, tempo and key before a song and the
  "load next" on an item advance, holds all of it while a song plays, and
  never starts or stops the transport by itself; the band leader starts
  each song. Why: setting up the next song saves the band seconds and
  mistakes; starting it is a musical decision.
- **Link, MIDI clock or OSC for tempo?** MIDI clock has a leader and
  drifts with jitter; OSC is flexible and unstandardized for Live.
  *The choice:* Link for tempo and beat, MIDI or OSC as the church configured for
  everything else, and MIDI clock only to feed old hardware from Live, never
  from the app. Why: Link is built into Live, stays in phase across devices,
  and survives a peer leaving.
- **Who owns the tempo when several Link peers are on the network?**
  *The choice:* the music computer's Live is the tempo of record; the app warns
  when another peer changes the tempo, and the church puts Link devices
  that need no tempo control (lights, metronome apps on phones) in a mode
  that follows rather than sets, where the device offers it. Why: Link's
  equality of peers is a feature in a studio and a hazard on a stage.
- **Transpose in real time, or prepare keys?** *The choice:* prepare. The
  church renders or records each song's tracks in the keys it uses, and the
  app picks the prepared key; real-time transposition is a fallback the
  app warns about. Why: a pitch-shifted pad sounds like a mistake, and the
  key is known days ahead.

## Sources

- Ableton Link, the concepts (tempo, beat, phase, start and stop sync) and
  the guidelines for applications: https://ableton.github.io/link/
- Ableton Live manual, synchronizing with Link, Tempo Follower and MIDI:
  https://www.ableton.com/en/live-manual/12/synchronizing-with-link-tempo-follower-and-midi/
- The Open Sound Control 1.0 specification:
  https://opensoundcontrol.stanford.edu/spec-1_0.html
- AbletonOSC, a widely used control surface script that exposes Live over
  OSC: https://github.com/ideoforms/AbletonOSC
- MIDI Association, the MIDI 1.0 specification (program change, clock):
  https://midi.org/
