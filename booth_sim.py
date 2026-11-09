"""A stand-in for the booth, for trying church-ops without OBS or Ableton.

- obs-websocket v5 on ws://127.0.0.1:4455 (password from BOOTH_OBS_PASSWORD),
  answering SetCurrentProgramScene, SetCurrentPreviewScene, SetInputSettings
  and GetVersion, and remembering what it was told.
- OSC over UDP on 127.0.0.1:11000, remembering the messages (Ableton's side).
- A page on http://127.0.0.1:18092 showing program, preview, the lower third,
  the last song loaded and tempo, and the last events.

Run: uv run --with websockets python booth_sim.py
"""

import asyncio
import base64
import hashlib
import html
import json
import os
import secrets
import struct
import time
from http import HTTPStatus

from websockets.asyncio.server import ServerConnection, serve

PASSWORD = os.environ.get("BOOTH_OBS_PASSWORD", "")
# The church's scene collection, as the demo plan names it.
SCENES = ["Wide", "Band", "Lectern", "Pulpit", "Holding"]
STATE: dict[str, object] = {
    "program": "-",
    "preview": "-",
    "lower_third": "",
    "tempo": "-",
    "loaded": "-",
    "events": [],
}


def event(text: str) -> None:
    events = STATE["events"]
    assert isinstance(events, list)
    events.insert(0, f"{time.strftime('%H:%M:%S')}  {text}")
    del events[30:]
    print(text, flush=True)


def b64sha(text: str) -> str:
    return base64.b64encode(hashlib.sha256(text.encode()).digest()).decode()


async def obs(conn: ServerConnection) -> None:
    hello: dict[str, object] = {"obsWebSocketVersion": "5.5.0", "rpcVersion": 1}
    salt, challenge = secrets.token_urlsafe(16), secrets.token_urlsafe(16)
    if PASSWORD:
        hello["authentication"] = {"challenge": challenge, "salt": salt}
    await conn.send(json.dumps({"op": 0, "d": hello}))
    identify = json.loads(await conn.recv())
    if identify.get("op") != 1:
        await conn.close(4007, "Identify expected")
        return
    if PASSWORD:
        want = b64sha(b64sha(PASSWORD + salt) + challenge)
        if identify["d"].get("authentication") != want:
            event("OBS: a client failed authentication")
            await conn.close(4009, "Authentication failed")
            return
    await conn.send(json.dumps({"op": 2, "d": {"negotiatedRpcVersion": 1}}))
    event("OBS: the worker connected")
    async for raw in conn:
        msg = json.loads(raw)
        if msg.get("op") != 6:
            continue
        d = msg["d"]
        kind, data = d.get("requestType"), d.get("requestData") or {}
        ok, comment = True, None
        response_data: dict[str, object] | None = None
        if kind == "GetSceneList":
            response_data = {
                "currentProgramSceneName": STATE["program"],
                "currentPreviewSceneName": STATE["preview"],
                "scenes": [{"sceneName": name, "sceneIndex": i} for i, name in enumerate(SCENES)],
            }
        elif kind == "SetCurrentProgramScene":
            STATE["program"] = data.get("sceneName", "")
            event(f"OBS program -> {STATE['program']}")
        elif kind == "SetCurrentPreviewScene":
            STATE["preview"] = data.get("sceneName", "")
            event(f"OBS preview -> {STATE['preview']}")
        elif kind == "SetInputSettings":
            text = (data.get("inputSettings") or {}).get("text", "")
            STATE["lower_third"] = text
            event(f"OBS {data.get('inputName')} text -> {text!r}")
        elif kind == "GetVersion":
            pass
        else:
            ok, comment = False, f"{kind} is not simulated"
        status: dict[str, object] = {"result": ok, "code": 100 if ok else 204}
        if comment:
            status["comment"] = comment
        reply: dict[str, object] = {"requestType": kind, "requestId": d.get("requestId"), "requestStatus": status}
        if response_data is not None:
            reply["responseData"] = response_data
        await conn.send(json.dumps({"op": 7, "d": reply}))


def osc_decode(data: bytes) -> tuple[str, list[object]]:
    def string(at: int) -> tuple[str, int]:
        end = data.index(b"\0", at)
        return data[at:end].decode(), (end + 4) & ~3

    address, at = string(0)
    tags, at = string(at) if at < len(data) else (",", at)
    args: list[object] = []
    for tag in tags[1:]:
        if tag == "i":
            args.append(struct.unpack(">i", data[at : at + 4])[0]); at += 4
        elif tag == "f":
            args.append(round(struct.unpack(">f", data[at : at + 4])[0], 2)); at += 4
        elif tag == "s":
            value, at = string(at); args.append(value)
    return address, args


class Osc(asyncio.DatagramProtocol):
    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        try:
            address, args = osc_decode(data)
        except (ValueError, struct.error):
            event("Ableton: an OSC packet that doesn't decode")
            return
        if address == "/live/song/set/tempo" and args:
            STATE["tempo"] = args[0]
        elif address.endswith("/load"):
            STATE["loaded"] = " · ".join(str(a) for a in args)
        if "transport" in address or address in {"/live/song/start_playing", "/live/song/stop_playing"}:
            event(f"Ableton: TRANSPORT {address} {args}  <- must never happen")
        else:
            event(f"Ableton {address} {args}")


PAGE = """<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<meta http-equiv=refresh content=1><title>Booth simulator</title>
<style>body{{font:16px system-ui;margin:16px;background:#111;color:#eee}}.g{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}}
.c{{background:#222;border-radius:10px;padding:12px}}.l{{color:#999;font-size:13px}}.v{{font-size:24px;margin-top:4px}}.p{{border:2px solid #e33}}.pv{{border:2px solid #3a3}}pre{{background:#000;padding:10px;border-radius:8px;white-space:pre-wrap}}</style>
<h1>Booth simulator</h1><p class=l>Stands in for OBS (obs-websocket v5) and Ableton Live (OSC) while you try church-ops. Refreshes every second.</p>
<div class=g><div class="c p"><div class=l>OBS program (on air)</div><div class=v>{program}</div></div>
<div class="c pv"><div class=l>OBS preview</div><div class=v>{preview}</div></div>
<div class=c><div class=l>Lower third</div><div class=v>{lower_third}</div></div>
<div class=c><div class=l>Ableton: loaded / tempo</div><div class=v>{loaded} / {tempo}</div></div></div>
<h2>Events</h2><pre>{events}</pre>"""


async def page(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    await reader.readuntil(b"\r\n\r\n")
    events = STATE["events"]
    assert isinstance(events, list)
    body = PAGE.format(
        program=html.escape(str(STATE["program"])), preview=html.escape(str(STATE["preview"])),
        lower_third=html.escape(str(STATE["lower_third"]) or "(none)"), loaded=html.escape(str(STATE["loaded"])),
        tempo=html.escape(str(STATE["tempo"])), events=html.escape("\n".join(events) or "(nothing yet)"),
    ).encode()
    writer.write(f"HTTP/1.1 {HTTPStatus.OK.value} OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {len(body)}\r\nConnection: close\r\n\r\n".encode() + body)
    await writer.drain()
    writer.close()


async def main() -> None:
    loop = asyncio.get_running_loop()
    await loop.create_datagram_endpoint(Osc, local_addr=("127.0.0.1", 11000))
    http_server = await asyncio.start_server(page, "127.0.0.1", 18092)
    async with serve(obs, "127.0.0.1", 4455), http_server:
        print("booth simulator: OBS ws://127.0.0.1:4455, OSC udp 127.0.0.1:11000, page http://127.0.0.1:18092", flush=True)
        await asyncio.Future()


asyncio.run(main())
