# Streaming and OBS

Many churches stream their services, and most do it with OBS on one
computer at the back of the room, run by a volunteer who also has to watch
the preacher. The app helps by driving OBS from the run sheet: the right
scene and the right caption at the right item, so the volunteer watches
instead of clicking. Everything here is about a stream that follows the
service, that shows only who agreed to be shown, and that degrades
gracefully when something breaks with three hundred people watching.

## Practices

- The app talks to OBS over obs-websocket protocol version 5, which ships
  with OBS: it connects, answers the authentication challenge with the
  password the operator set, identifies with only the event subscriptions
  it uses, and treats OBS as the source of truth for what scenes and
  outputs exist. It never assumes a scene exists because the plan names it;
  it checks, and reports a missing one before the service.
- The connection is to the OBS on the streaming computer's own network, the
  password is kept as a secret of the church, and the port is not exposed
  to the internet.
- Each run sheet item may name a scene and the captions it shows. The
  church maps item kinds to default scenes (a song to the band with lyrics,
  the sermon to the pulpit camera with the speaker's name), and an item may
  override. The mapping is checked against OBS when the plan is published
  and again when the stream computer connects.
- Scene changes follow live mode's current item, through studio mode where
  the church uses it: the next item's scene goes to preview, and the
  operator, or the item advance, takes it to program. An operator's manual
  change in OBS always wins: the app notices it and stops changing scenes
  until the next item, rather than fighting the person at the desk.
- Lower thirds take their text from the plan: the speaker's name and role,
  the reading's reference, the song's title and credits with the licence
  line the licence requires. A person's name appears on a lower third only
  if they consented to be named on the stream.
- Streaming and recording are separate outputs with separate decisions. A
  service may be recorded for the archive and not streamed, or streamed and
  not kept. The plan says which, per service and, where it matters, per item:
  a prayer ministry time, a baptism of a child, or a testimony may be marked
  "off stream", and the stream shows a holding scene for it.
- Before the service the app runs a preflight with the operator: OBS
  connected, the scenes the plan needs exist, the stream key is set,
  the recording disk has room for the planned length, the outputs are
  stopped. Starting the stream and the recording are deliberate actions
  with a confirm, never a side effect of opening the plan.
- Who can be seen is set by the room, not by the software alone: cameras
  point at the front, the congregation is not framed, and a sign at the
  door says the service is streamed. Children's moments at the front are
  either off stream or shot so no child is identifiable, unless their
  guardians agreed (`people-and-teams.md`).
- Failure is planned for: if the socket drops, OBS keeps doing what it was
  doing (the stream does not stop because the app went away), the app
  reconnects with backoff and resyncs to OBS's current scene before it
  changes anything, and the operator can always run OBS by hand. The app
  shows the stream's health (dropped frames, bitrate, whether the output is
  active) and warns before it fails, not after.
- The stream's own recording and the platform's archive are not the
  church's only copy when the service is meant to be kept; the local
  recording is.

## Common mistakes

- Starting the stream when the plan opens, or when the app reconnects
  after a drop, so a stopped stream goes live with the sound check.
- Stopping the stream or the recording because the app lost its
  connection to OBS.
- Switching scenes by name without checking the scene exists, so a renamed
  scene leaves the stream on whatever was last shown.
- The app and the operator both changing scenes, so the picture jumps back
  every time the operator corrects it.
- A lower third with a child's name, or a congregation member's name from
  the plan, without their consent.
- A pastoral moment on the stream: the prayer for a named, ill person read
  out in front of the stream camera, or the counselling corner in the wide
  shot.
- Streaming lyrics without a streaming licence, or streaming a recorded
  track the licence does not cover, so the platform mutes or removes the
  stream mid-service.
- The obs-websocket password or the stream key in the plan's notes, in a
  chat message or in a log.
- Exposing obs-websocket's port beyond the church's network so the app can
  reach it from outside.
- No preflight, so the first sign that the recording disk is full is the
  missing sermon.

## Controversies

- **Should the app switch scenes at all, or only suggest?** Automation
  frees the volunteer and surprises them. *The choice:* the app sets
  preview from the run sheet and takes it to program on the item advance
  when the operator has turned automatic switching on for that service;
  with it off, the app only sets preview. Either way a manual change in OBS
  pauses automation until the next item. Why: a small church with one
  volunteer needs the automation; a larger one with a director wants the
  suggestion; both need the human to win.
- **Lower thirds in OBS sources or in a browser source the app serves?**
  *The choice:* captions are text the app sets on sources the church's OBS
  scene collection already has, through obs-websocket, not a page the app
  serves into OBS. Why: the stream must not depend on the app's web server
  being reachable from the streaming computer during the service.
- **Stream everything or choose per item?** *The choice:* the service is
  streamed or not, and any item may be marked off stream with a holding
  scene; testimonies, child dedications, prayer ministry and anything with
  pastoral content default to off stream and are put on stream on purpose.
  Why: once a moment is broadcast it cannot be taken back.
- **One computer for OBS and the app, or two?** *The choice:* the app does
  not need to run on the streaming computer; it reaches OBS over the
  church's local network, and the streaming computer runs OBS and little
  else. Why: the streaming computer's CPU belongs to the encoder, and a
  crash of one should not take the other with it.

## Sources

- obs-websocket 5.x protocol, the authentication, identification, requests,
  batches and events:
  https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
- OBS Project, the remote control guide (enabling obs-websocket, the port
  and the password): https://obsproject.com/kb/remote-control-guide
- CCLI, the Streaming Licence and what it covers: https://ccli.com/
- YouTube Help, how Content ID works, which also claims and mutes live
  streams:
  https://support.google.com/youtube/answer/2797370
- Regulation (EU) 2016/679 (GDPR), articles 6, 8 and 9: images of people
  are personal data, and in a church service special category data:
  https://eur-lex.europa.eu/eli/reg/2016/679/oj
- Autoriteit Persoonsgegevens, on photos and video of people and of
  children: https://autoriteitpersoonsgegevens.nl/
