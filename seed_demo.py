"""Fill a running church-ops api with a demo church: people, teams, songs, two services.

Usage: python3 -I seed_demo.py http://127.0.0.1:18090
Only public-domain hymns, so no licence is needed for the demo charts.
"""

import json
import sys
import urllib.request

BASE = sys.argv[1].rstrip("/")


def call(method: str, path: str, body: object | None = None) -> object:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=10) as resp:
        raw = resp.read()
    return json.loads(raw) if raw else None


def post(path: str, body: object) -> dict:
    out = call("POST", path, body)
    assert isinstance(out, dict), out
    return out


if call("GET", "/people"):
    print("api already has people; not seeding again")
    sys.exit(0)

people = {
    name: post("/people", {"name": name, "email": email})
    for name, email in [
        ("Anna de Vries", "anna@example.org"),
        ("Pieter Bakker", "pieter@example.org"),
        ("Sanne Jansen", "sanne@example.org"),
        ("Daan Visser", "daan@example.org"),
        ("Eva Smit", "eva@example.org"),
        ("Lars Mulder", "lars@example.org"),
        ("Noor Bos", "noor@example.org"),
    ]
}

teams: dict[str, dict] = {}
positions: dict[str, dict] = {}
for team, names in [
    ("Band", ["Vocals", "Keys", "Drums", "Guitar"]),
    ("Tech", ["Front of house", "Stream", "Lyrics"]),
    ("Welcome", ["Door"]),
]:
    teams[team] = post("/teams", {"name": team})
    for name in names:
        positions[f"{team}/{name}"] = post(f"/teams/{teams[team]['id']}/positions", {"name": name})

songs: dict[str, dict] = {}
arrangements: dict[str, dict] = {}
for title, authors, arr in [
    ("Be Thou My Vision", "Traditional Irish, tr. Mary Byrne", ("Standard", "D", 72, "3/4", 240, "V1 V2 V3 V4", "[D] Be thou my [G] vision, O [D] Lord of my [A] heart")),
    ("Amazing Grace", "John Newton", ("Hymn", "G", 76, "3/4", 270, "V1 V2 V3 V4", "A[G]mazing [G7] grace how [C] sweet the [G] sound")),
    ("It Is Well with My Soul", "Horatio Spafford", ("Full band", "C", 80, "4/4", 300, "V1 C V2 C V4 C", "When [C] peace like a [F] river at[C]tendeth my way")),
    ("Holy, Holy, Holy", "Reginald Heber", ("Opening", "Eb", 92, "4/4", 210, "V1 V2 V3 V4", "[Eb] Holy, holy, [Cm] holy! [Bb] Lord God Al[Eb]mighty")),
    ("Come Thou Fount", "Robert Robinson", ("Folk", "D", 88, "3/4", 230, "V1 V2 V3", "[D] Come thou fount of [G] every [D] blessing")),
]:
    song = post("/songs", {"title": title, "authors": authors})
    songs[title] = song
    name, key, bpm, meter, length, sequence, chart = arr
    arrangements[title] = post(
        f"/songs/{song['id']}/arrangements",
        {"name": name, "key": key, "tempo_bpm": bpm, "meter": meter, "length_seconds": length, "sequence": sequence, "chart": chart},
    )

service = post(
    "/services",
    {"title": "Sunday morning", "service_type": "Sunday morning", "starts_at": "2026-11-15T10:00:00+01:00"},
)
sid = service["id"]
for item in [
    {"kind": "announcement", "title": "Welcome", "length_seconds": 120, "scene": "Wide", "lower_third": "Welcome to church"},
    {"kind": "song", "title": "Holy, Holy, Holy", "length_seconds": 210, "arrangement_id": arrangements["Holy, Holy, Holy"]["id"], "scene": "Band", "lower_third": "Holy, Holy, Holy · Reginald Heber"},
    {"kind": "song", "title": "Be Thou My Vision", "length_seconds": 240, "arrangement_id": arrangements["Be Thou My Vision"]["id"], "key": "C", "scene": "Band", "lower_third": "Be Thou My Vision · Traditional", "notes": "Sanne leads in C this week"},
    {"kind": "reading", "title": "Psalm 23", "length_seconds": 180, "scene": "Lectern", "lower_third": "Psalm 23"},
    {"kind": "sermon", "title": "The Lord is my shepherd", "length_seconds": 1500, "scene": "Pulpit", "lower_third": "Ds. Pieter Bakker"},
    {"kind": "prayer", "title": "Prayers for the church", "length_seconds": 300, "scene": "Wide", "off_stream": True, "notes": "Off stream: names of people prayed for"},
    {"kind": "song", "title": "It Is Well with My Soul", "length_seconds": 300, "arrangement_id": arrangements["It Is Well with My Soul"]["id"], "scene": "Band", "lower_third": "It Is Well with My Soul · Horatio Spafford"},
    {"kind": "announcement", "title": "Blessing and notices", "length_seconds": 180, "scene": "Wide"},
]:
    post(f"/services/{sid}/items", item)

post(f"/people/{people['Lars Mulder']['id']}/blockouts", {"starts_on": "2026-11-14", "ends_on": "2026-11-22", "reason": "Holiday"})
for who, pos in [
    ("Anna de Vries", "Band/Keys"),
    ("Sanne Jansen", "Band/Vocals"),
    ("Lars Mulder", "Band/Drums"),
    ("Daan Visser", "Tech/Stream"),
    ("Noor Bos", "Welcome/Door"),
]:
    post(f"/services/{sid}/requests", {"position_id": positions[pos]["id"], "person_id": people[who]["id"]})
for req in call("GET", f"/requests?service_id={sid}") or []:
    if req["person"]["name"] in {"Anna de Vries", "Daan Visser"}:
        post(f"/requests/{req['id']}/answer", {"accept": True})

post(f"/services/{sid}/copy", {"starts_at": "2026-11-22T10:00:00+01:00", "title": "Sunday morning"})
print(f"seeded {len(people)} people, {len(songs)} songs, services {sid} and a copy")
