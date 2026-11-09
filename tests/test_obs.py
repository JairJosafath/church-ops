import json
import logging
from collections import deque
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from typing import Any

import pytest

from app.config import ObsSettings
from app.live import LowerThird, PreviewScene, ProgramScene
from app.obs import Client, ObsError, Session, Socket, authentication, websocket

# The example of obs-websocket's protocol documentation.
DOCS_PASSWORD = "supersecretpassword"  # noqa: S105  the public example in the docs
DOCS_SALT = "lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI="
DOCS_CHALLENGE = "+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY="
DOCS_AUTHENTICATION = "1Ct943GAT+6YQUUX47Ia/ncufilbe6+oD6lY+5kaCu4="

OBS_URL = "ws://10.0.0.5:4455"
STUDIO_MODE_NOT_ACTIVE = 506
RESOURCE_NOT_FOUND = 600


class FakeObs:
    """obs-websocket 5 at the other end of a socket, with a scene collection."""

    def __init__(
        self,
        *,
        password: str | None = None,
        scenes: Sequence[str] = ("Band", "Pulpit", "Holding"),
        studio_mode: bool = True,
    ) -> None:
        self.password = password
        self.scenes = list(scenes)
        self.studio_mode = studio_mode
        self.inputs = {"Lower third": ""}
        self.program = "Holding"
        self.preview = "Holding"
        self.outbox: deque[str] = deque()
        # Decoded JSON, as the client sent it.
        self.received: list[dict[str, Any]] = []
        self.requests: list[tuple[str, object]] = []
        self.event_before_responses = False
        self.connections: list[str] = []
        hello: dict[str, object] = {"obsWebSocketVersion": "5.5.6", "rpcVersion": 1}
        if password is not None:
            hello["authentication"] = {"challenge": DOCS_CHALLENGE, "salt": DOCS_SALT}
        self._reply(0, hello)

    @contextmanager
    def connect(self, url: str) -> Iterator[Socket]:
        self.connections.append(url)
        yield self

    def _reply(self, op: int, data: dict[str, object]) -> None:
        self.outbox.append(json.dumps({"op": op, "d": data}))

    def send(self, message: str, /) -> None:
        received = json.loads(message)
        self.received.append(received)
        data = received["d"]
        match received["op"]:
            case 1:
                if self.password is not None and data.get("authentication") != authentication(
                    self.password, DOCS_SALT, DOCS_CHALLENGE
                ):
                    # What the websocket adapter raises when OBS closes with 4009.
                    msg = (
                        f"lost OBS at {OBS_URL}: received 4009 (private use) Authentication failed."
                    )
                    raise ObsError(msg)
                self._reply(2, {"negotiatedRpcVersion": 1})
            case 6:
                self._request(data)
            case op:
                pytest.fail(f"the client sent op {op}")

    def _request(self, data: dict[str, object]) -> None:
        request_type = data["requestType"]
        request_data = data.get("requestData")
        self.requests.append((str(request_type), request_data))
        ok, code, comment, response = self._handle(str(request_type), request_data)
        if self.event_before_responses:
            self._reply(5, {"eventType": "CurrentProgramSceneChanged", "eventIntent": 4})
            self._reply(7, {"requestType": request_type, "requestId": "other"})
        status: dict[str, object] = {"result": ok, "code": code}
        if comment:
            status["comment"] = comment
        reply: dict[str, object] = {
            "requestType": request_type,
            "requestId": data["requestId"],
            "requestStatus": status,
        }
        if response is not None:
            reply["responseData"] = response
        self._reply(7, reply)

    def _handle(
        self, request_type: str, data: object
    ) -> tuple[bool, int, str, dict[str, object] | None]:
        assert isinstance(data, dict) or data is None
        match request_type, data:
            case "GetSceneList", None:
                scenes = [
                    {"sceneName": name, "sceneIndex": i} for i, name in enumerate(self.scenes)
                ]
                return True, 100, "", {"currentProgramSceneName": self.program, "scenes": scenes}
            case (("SetCurrentProgramScene" | "SetCurrentPreviewScene"), {"sceneName": str(name)}):
                return self._set_scene(request_type, name)
            case "SetInputSettings", {"inputName": str(name), "inputSettings": {"text": str(text)}}:
                if name not in self.inputs:
                    return (
                        False,
                        RESOURCE_NOT_FOUND,
                        f"No source was found by the name of `{name}`.",
                        None,
                    )
                self.inputs[name] = text
                return True, 100, "", None
            case _:
                return False, RESOURCE_NOT_FOUND, "Not found.", None

    def _set_scene(self, request_type: str, name: str) -> tuple[bool, int, str, None]:
        if name not in self.scenes:
            return False, RESOURCE_NOT_FOUND, f"No scene was found by the name of `{name}`.", None
        if request_type == "SetCurrentProgramScene":
            self.program = name
        elif not self.studio_mode:
            return False, STUDIO_MODE_NOT_ACTIVE, "Studio mode is not active.", None
        else:
            self.preview = name
        return True, 100, "", None

    def recv(self) -> str:
        if not self.outbox:
            msg = f"OBS at {OBS_URL} did not answer within 5 s"
            raise ObsError(msg)
        return self.outbox.popleft()


def client(fake: FakeObs, password: str = "") -> Client:
    return Client(ObsSettings(url=OBS_URL, password=password), "Lower third", fake.connect)


ADVANCE = (ProgramScene("Band"), LowerThird("Groot is uw trouw"), PreviewScene("Pulpit"))


def test_authentication_matches_the_protocol_documentation() -> None:
    assert authentication(DOCS_PASSWORD, DOCS_SALT, DOCS_CHALLENGE) == DOCS_AUTHENTICATION


def test_identify_answers_the_password_challenge_and_subscribes_to_no_events() -> None:
    fake = FakeObs(password=DOCS_PASSWORD)
    client(fake, DOCS_PASSWORD).apply([])
    assert fake.connections == [OBS_URL]
    assert fake.received[0] == {
        "op": 1,
        "d": {"rpcVersion": 1, "eventSubscriptions": 0, "authentication": DOCS_AUTHENTICATION},
    }


def test_identify_without_a_password_sends_no_authentication() -> None:
    fake = FakeObs()
    client(fake).apply([])
    assert fake.received[0] == {"op": 1, "d": {"rpcVersion": 1, "eventSubscriptions": 0}}


def test_a_wrong_password_is_an_error_without_the_password() -> None:
    fake = FakeObs(password=DOCS_PASSWORD)
    with pytest.raises(ObsError, match="Authentication failed") as caught:
        client(fake, "wrong-password").apply(ADVANCE)
    assert "wrong-password" not in str(caught.value)
    assert fake.program == "Holding"


def test_obs_asking_for_a_password_when_none_is_set_is_an_error() -> None:
    fake = FakeObs(password=DOCS_PASSWORD)
    with pytest.raises(ObsError, match="OBS asks for a password; set OBS_PASSWORD"):
        client(fake).apply(ADVANCE)


def test_an_advance_sets_program_lower_third_and_preview_in_order() -> None:
    fake = FakeObs(password=DOCS_PASSWORD)
    client(fake, DOCS_PASSWORD).apply(ADVANCE)
    assert fake.requests == [
        ("GetSceneList", None),
        ("SetCurrentProgramScene", {"sceneName": "Band"}),
        (
            "SetInputSettings",
            {"inputName": "Lower third", "inputSettings": {"text": "Groot is uw trouw"}},
        ),
        ("SetCurrentPreviewScene", {"sceneName": "Pulpit"}),
    ]
    assert (fake.program, fake.preview, fake.inputs["Lower third"]) == (
        "Band",
        "Pulpit",
        "Groot is uw trouw",
    )


def test_preview_without_studio_mode_is_logged_and_the_rest_still_goes(
    caplog: pytest.LogCaptureFixture,
) -> None:
    fake = FakeObs(studio_mode=False)
    client(fake).apply((PreviewScene("Pulpit"), LowerThird("Preek")))
    assert fake.inputs["Lower third"] == "Preek"
    assert (
        "OBS refused preview 'Pulpit' (SetCurrentPreviewScene): 506 Studio mode is not active."
        in caplog.text
    )


def test_a_scene_obs_does_not_have_is_not_asked_for(caplog: pytest.LogCaptureFixture) -> None:
    fake = FakeObs(scenes=["Band", "Holding"])
    client(fake).apply((ProgramScene("Pulpit"), LowerThird("")))
    assert [request for request, _ in fake.requests] == ["GetSceneList", "SetInputSettings"]
    assert fake.program == "Holding"
    assert "OBS has no scene 'Pulpit'; program 'Pulpit' not sent" in caplog.text


def test_a_missing_lower_third_input_is_logged(caplog: pytest.LogCaptureFixture) -> None:
    fake = FakeObs()
    fake.inputs = {}
    client(fake).apply((LowerThird("x"),))
    assert "OBS refused lower third 'x' (SetInputSettings): 600" in caplog.text


def test_events_and_other_responses_are_skipped() -> None:
    fake = FakeObs()
    fake.event_before_responses = True
    client(fake).apply(ADVANCE)
    assert (fake.program, fake.preview) == ("Band", "Pulpit")


def test_success_is_logged_one_line_per_request(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO)
    client(FakeObs()).apply(ADVANCE)
    assert [record.getMessage() for record in caplog.records] == [
        "OBS: program 'Band'",
        "OBS: lower third 'Groot is uw trouw'",
        "OBS: preview 'Pulpit'",
    ]


class ScriptedSocket:
    """A socket whose OBS sends the given messages, whatever it is sent."""

    def __init__(self, *messages: str) -> None:
        self.messages = deque(messages)

    def send(self, message: str, /) -> None:
        pass

    def recv(self) -> str:
        if not self.messages:
            msg = "OBS did not answer"
            raise ObsError(msg)
        return self.messages.popleft()


HELLO = json.dumps({"op": 0, "d": {"rpcVersion": 1}})
IDENTIFIED = json.dumps({"op": 2, "d": {"negotiatedRpcVersion": 1}})


@pytest.mark.parametrize(
    ("messages", "error"),
    [
        (["not json"], "OBS sent a message that is not JSON: 'not json'"),
        (['{"op": 0}'], "OBS sent a message without an op and data"),
        ([IDENTIFIED], r"OBS sent op 2 where op 0 \(HELLO\) was expected"),
        (
            [json.dumps({"op": 0, "d": {"authentication": {"salt": "x"}}})],
            "authentication without a challenge and salt",
        ),
        ([HELLO], "OBS did not answer"),
        (
            [HELLO, IDENTIFIED, json.dumps({"op": 7, "d": {"requestId": "1"}})],
            "without a request status",
        ),
        (
            [
                HELLO,
                IDENTIFIED,
                json.dumps(
                    {
                        "op": 7,
                        "d": {
                            "requestId": "1",
                            "requestStatus": {"result": False, "code": 207, "comment": "Not ready"},
                        },
                    }
                ),
            ],
            "OBS did not list its scenes: 207 Not ready",
        ),
        (
            [HELLO, IDENTIFIED] + [json.dumps({"op": 5, "d": {}})] * 100,
            "OBS sent 100 messages without answering GetSceneList",
        ),
    ],
    ids=[
        "not-json",
        "no-data",
        "wrong-op",
        "half-an-authentication",
        "no-identified",
        "no-request-status",
        "scene-list-refused",
        "endless-events",
    ],
)
def test_a_broken_conversation_is_an_obs_error(messages: list[str], error: str) -> None:
    @contextmanager
    def connect(_url: str) -> Iterator[Socket]:
        yield ScriptedSocket(*messages)

    with pytest.raises(ObsError, match=error):
        Client(ObsSettings(url=OBS_URL, password=""), "Lower third", connect).apply([])


def test_request_ids_are_unique_within_a_session() -> None:
    fake = FakeObs()
    session = Session.identify(fake, "")
    session.request("GetSceneList")
    session.request("GetSceneList")
    assert [message["d"]["requestId"] for message in fake.received[1:]] == ["1", "2"]


def test_the_real_connection_turns_a_failure_into_an_obs_error() -> None:
    # An http URL fails in websockets before any socket is opened.
    with (
        pytest.raises(ObsError, match="could not connect to OBS at http://obs:4455"),
        websocket("http://obs:4455"),
    ):
        pytest.fail("connected")
