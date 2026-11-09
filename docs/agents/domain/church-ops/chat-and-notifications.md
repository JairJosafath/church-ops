# Chat and notifications

A church's volunteers already talk somewhere: a WhatsApp group per team,
a Slack for the staff, a Matrix space for the tech crew. The app does not
replace that; it tells people what they need to know (a request, a
reminder, a change to Sunday) through the channel each person reads, and
keeps the record of what was sent. Everything here is about telling the
right people the right thing once, at a decent hour, without leaking what
was said in confidence into a group chat.

## Practices

- The app is the source of truth and a chat is a delivery channel. A
  scheduling request is accepted in the app (or through a link or a button
  that the app verifies); a "yes" typed into a group chat is not an
  acceptance. Every notification links back to the thing it is about.
- Each channel is an adapter behind one interface: send a message to a
  person, send a message to a team's room, and, where the channel supports
  it, receive a reply or a button press. Matrix, Slack, WhatsApp and e-mail
  are adapters; e-mail is always there as the fallback. A team's room is a
  setting of the team, a person's channel is a setting of the person.
- Who is told what is a fixed table, not a free-for-all:
  - a scheduling request goes to the person asked, and its answer to the
    scheduler;
  - a reminder goes to each scheduled person before their service and
    before each rehearsal, at times the church sets (a week and a day
    before, by default);
  - a change after publication goes to the people it affects: a new song to
    the band, a moved rehearsal to everyone scheduled for it, a new speaker
    to the stream team for the lower third;
  - a cancellation goes to everyone scheduled, at once, and to the team
    rooms;
  - an unfilled position goes to the scheduler and the team leader, before
    it becomes urgent.
- Notifications are created from facts and sent from an outbox: the
  request, the change, the reminder's due time. Each has an identity, so a
  retry or a restart sends it once, and a change that is undone before it
  is sent is not sent.
- Changes are batched: ten edits to Saturday's plan become one message to
  the band, sent a few minutes after the last edit, not ten. Reminders
  respect quiet hours (no message between late evening and morning, a
  setting), except a cancellation or a change within the next day.
- Messages to a minor go to their guardians, or to the minor and the
  guardians together, as the church's safeguarding policy says, never to
  the minor alone in a private chat with an adult.
- Messages carry what the person needs and no more: the service, the
  position, the time, a link. No pastoral data, no blockout reasons, no
  giving information and no other person's contact details in any message,
  and nothing a person would not want read aloud from a phone's lock
  screen.
- WhatsApp is reached through the WhatsApp Business Platform with the
  church's own number, with the person's opt-in, and with approved message
  templates for anything the person did not just ask for; the app never
  adds people to groups or reads a personal account's chats. Matrix rooms
  may be encrypted; the app's bot is a member of the rooms it posts to and
  of no others. Slack is reached as an app installed in the church's
  workspace with the narrowest scopes it needs.
- A failed delivery is retried with backoff and then falls back to e-mail;
  the app shows the scheduler who has not been reached, so the person who
  never got the request is not counted as having ignored it.

## Common mistakes

- Treating a reply in a group chat as accepting or declining a request,
  so the schedule and the chat disagree.
- One message per edit, so the band gets nine notifications on Saturday
  night and mutes the app.
- A reminder at 06:00 on a Sunday, or a batch of requests sent at midnight.
- Sending the same reminder twice after a restart because the outbox had
  no identity for it.
- A prayer request, a care note or the reason for a blockout posted into a
  team's room.
- A message that lists everyone scheduled with their phone numbers.
- A team WhatsApp group that the app creates with everyone's number
  visible to everyone, children's leaders and parents included.
- An adult volunteer messaging a child privately because the app gave them
  the child's number.
- Building a chat server inside the app because the adapters were hard,
  and then having to moderate it.
- A failed delivery that is dropped silently, so the scheduler thinks the
  person said nothing.

## Controversies

- **Build chat into the app, or integrate the chat people already use?**
  *The choice:* integrate, through adapters; the app has comments on a plan
  item for the record, and no chat of its own. Why: the volunteers are
  already in their chat, and a church does not have staff to run and
  moderate another one.
- **WhatsApp at all?** It is where most Dutch church members are, it ties
  messages to phone numbers, and its business rules limit what may be
  sent. *The choice:* yes, as an adapter on the Business Platform with
  opt-in and templates, never by automating a personal account; Matrix as
  the open, self-hostable option; e-mail always. Why: a reminder nobody
  reads is not a reminder, and a personal account automated against the
  terms can be banned the week before Easter.
- **Remind once or many times?** *The choice:* a week and a day before by
  default, set per church and per team, and each person may turn off
  reminders for a channel but not the requests and cancellations. Why:
  requests need an answer and cancellations need to arrive; reminders are a
  courtesy, and too many are noise.
- **Who may message whom?** *The choice:* the app sends on behalf of the
  church, to people in the roles the table names; a volunteer can message a
  team's room through the app, and never reaches a person's private
  channel through it. Why: a person gave the church a way to reach them,
  not every volunteer.

## Sources

- Matrix specification, the client-server API and end-to-end encryption:
  https://spec.matrix.org/latest/
- Slack platform documentation, apps, scopes and messaging:
  https://docs.slack.dev/
- WhatsApp Business Platform, Cloud API (templates, opt-in, the customer
  service window): https://developers.facebook.com/docs/whatsapp/cloud-api/
- WhatsApp Business Messaging Policy: https://business.whatsapp.com/policy
- Regulation (EU) 2016/679 (GDPR), articles 5(1)(c) (data minimisation)
  and 28 (processors, which every adapter's service is):
  https://eur-lex.europa.eu/eli/reg/2016/679/oj
