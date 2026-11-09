"""OBS Studio, driven over obs-websocket protocol version 5: scenes and the lower third.

Each item advance opens a connection, identifies (answering the password
challenge, subscribing to no events), checks the scenes OBS has, sends its
requests and closes. OBS keeps running as it was whatever happens to the
connection, and the stream and recording are never started or stopped here.
"""

import base64
import hashlib
import itertools
import json
import logging
from collections.abc import Callable, Iterator, Mapping, Sequence
from contextlib import AbstractContextManager, contextmanager
from dataclasses import dataclass
from enum import IntEnum
from typing import Protocol, assert_never

from websockets.exceptions import WebSocketException
from websockets.sync.client import ClientConnection, connect
from websockets.typing import Subprotocol

from app.config import ObsSettings
from app.live import LowerThird, ObsAction, PreviewScene, ProgramScene, describe

RPC_VERSION = 1
"""The obs-websocket RPC version the worker speaks."""

TIMEOUT_SECONDS = 5.0
"""The longest the worker waits to connect to OBS, or for one of its answers."""

_MAX_MESSAGE_BYTES = 1024 * 1024
_MAX_SKIPPED_MESSAGES = 100

logger = logging.getLogger(__name__)


class _Op(IntEnum):
    HELLO = 0
    IDENTIFY = 1
    IDENTIFIED = 2
    REQUEST = 6
    REQUEST_RESPONSE = 7


class ObsError(Exception):
    """OBS could not be reached, refused the password, or broke the protocol."""


class Socket(Protocol):
    """A WebSocket connection to obs-websocket, as the session needs it."""

    def send(self, message: str, /) -> None:
        """Send one text message.

        Raises:
            ObsError: When the connection is lost.
        """
        ...

    def recv(self) -> str:
        """Receive the next text message.

        Raises:
            ObsError: When the connection is lost or OBS does not answer in time.
        """
        ...


type Connect = Callable[[str], AbstractContextManager[Socket]]
"""Opens a connection to the obs-websocket URL given, closing it on exit."""


def authentication(password: str, salt: str, challenge: str) -> str:
    """Answer obs-websocket's authentication challenge.

    The secret is base64(sha256(password + salt)); the answer is
    base64(sha256(secret + challenge)).

    Args:
        password: The password set in OBS.
        salt: The salt of OBS's Hello.
        challenge: The challenge of OBS's Hello.

    Returns:
        The `authentication` string of the Identify message.
    """
    secret = base64.b64encode(hashlib.sha256((password + salt).encode()).digest()).decode()
    return base64.b64encode(hashlib.sha256((secret + challenge).encode()).digest()).decode()


@dataclass(frozen=True, slots=True)
class RequestResult:
    """OBS's answer to one request.

    Attributes:
        ok: Whether OBS did what was asked.
        code: OBS's status code (100 is success).
        comment: OBS's explanation of a failure; empty when it gave none.
        data: The response data; empty when there is none.
    """

    ok: bool
    code: int
    comment: str
    data: Mapping[str, object]


def _decode(message: str) -> tuple[int, dict[str, object]]:
    try:
        value = json.loads(message)
    except ValueError as err:
        msg = f"OBS sent a message that is not JSON: {message[:80]!r}"
        raise ObsError(msg) from err
    match value:
        case {"op": int(op), "d": dict(data)}:
            return op, data
        case _:
            msg = f"OBS sent a message without an op and data: {message[:80]!r}"
            raise ObsError(msg)


class Session:
    """An identified obs-websocket connection that sends requests."""

    def __init__(self, socket: Socket) -> None:
        """Send requests over `socket`, which `identify` has identified.

        Args:
            socket: The connection.
        """
        self._socket = socket
        self._ids = itertools.count(1)

    @classmethod
    def identify(cls, socket: Socket, password: str) -> "Session":
        """Do obs-websocket's handshake: Hello, Identify, Identified.

        Args:
            socket: A connection OBS has just accepted.
            password: The obs-websocket password; empty when there is none.

        Returns:
            The identified session.

        Raises:
            ObsError: When OBS asks for a password and there is none, refuses
                the password (it closes the connection), or breaks the protocol.
        """
        hello = cls._expect(socket, _Op.HELLO)
        identify: dict[str, object] = {"rpcVersion": RPC_VERSION, "eventSubscriptions": 0}
        match hello.get("authentication"):
            case None:
                pass
            case {"challenge": str(challenge), "salt": str(salt)}:
                if not password:
                    msg = "OBS asks for a password; set OBS_PASSWORD"
                    raise ObsError(msg)
                identify["authentication"] = authentication(password, salt, challenge)
            case _:
                msg = "OBS's Hello has an authentication without a challenge and salt"
                raise ObsError(msg)
        socket.send(json.dumps({"op": _Op.IDENTIFY, "d": identify}))
        cls._expect(socket, _Op.IDENTIFIED)
        return cls(socket)

    @staticmethod
    def _expect(socket: Socket, op: _Op) -> dict[str, object]:
        received, data = _decode(socket.recv())
        if received != op:
            msg = f"OBS sent op {received} where op {op.value} ({op.name}) was expected"
            raise ObsError(msg)
        return data

    def request(self, request_type: str, data: Mapping[str, object] | None = None) -> RequestResult:
        """Send one request and wait for its response, skipping other messages.

        Args:
            request_type: The request, such as `SetCurrentProgramScene`.
            data: Its request data; `None` for none.

        Returns:
            OBS's answer, which may be a failure.

        Raises:
            ObsError: When the connection is lost, OBS does not answer in time,
                or it breaks the protocol.
        """
        request_id = str(next(self._ids))
        payload: dict[str, object] = {"requestType": request_type, "requestId": request_id}
        if data is not None:
            payload["requestData"] = dict(data)
        self._socket.send(json.dumps({"op": _Op.REQUEST, "d": payload}))
        for _ in range(_MAX_SKIPPED_MESSAGES):
            op, response = _decode(self._socket.recv())
            if op == _Op.REQUEST_RESPONSE and response.get("requestId") == request_id:
                return _result(request_type, response)
        msg = f"OBS sent {_MAX_SKIPPED_MESSAGES} messages without answering {request_type}"
        raise ObsError(msg)


def _result(request_type: str, response: Mapping[str, object]) -> RequestResult:
    match response.get("requestStatus"):
        case {"result": bool(ok), "code": int(code), **rest}:
            comment = rest.get("comment")
        case _:
            msg = f"OBS answered {request_type} without a request status"
            raise ObsError(msg)
    data = response.get("responseData")
    return RequestResult(
        ok=ok,
        code=code,
        comment=comment if isinstance(comment, str) else "",
        data=data if isinstance(data, dict) else {},
    )


def _scene_names(session: Session) -> frozenset[str]:
    result = session.request("GetSceneList")
    scenes = result.data.get("scenes")
    if not result.ok or not isinstance(scenes, list):
        msg = f"OBS did not list its scenes: {result.code} {result.comment}".rstrip()
        raise ObsError(msg)
    return frozenset(
        name
        for scene in scenes
        if isinstance(scene, dict) and isinstance(name := scene.get("sceneName"), str)
    )


class Client:
    """Drives OBS: program and preview scenes and the lower third's text."""

    def __init__(self, settings: ObsSettings, lower_third_input: str, connect: Connect) -> None:
        """Reach OBS at `settings.url` through `connect`.

        Args:
            settings: The URL and password.
            lower_third_input: The text input whose text is the caption.
            connect: Opens a connection; `websocket` in production.
        """
        self._settings = settings
        self._lower_third_input = lower_third_input
        self._connect = connect

    def apply(self, actions: Sequence[ObsAction]) -> None:
        """Connect to OBS and send `actions` in order, then disconnect.

        A scene OBS does not have is not asked for, and a request OBS refuses
        (a preview with studio mode off, a missing input) is logged and the
        rest still go: the stream stays on what it showed rather than stop.

        Args:
            actions: The requests; empty only checks that OBS answers.

        Raises:
            ObsError: When OBS cannot be reached, refuses the password, or
                breaks the protocol.
        """
        with self._connect(self._settings.url) as socket:
            session = Session.identify(socket, self._settings.password)
            scenes = _scene_names(session)
            for action in actions:
                self._apply(session, scenes, action)

    def _apply(self, session: Session, scenes: frozenset[str], action: ObsAction) -> None:
        match action:
            case ProgramScene():
                _set_scene(session, scenes, "SetCurrentProgramScene", action)
            case PreviewScene():
                _set_scene(session, scenes, "SetCurrentPreviewScene", action)
            case LowerThird(text):
                _send(
                    session,
                    "SetInputSettings",
                    {"inputName": self._lower_third_input, "inputSettings": {"text": text}},
                    action,
                )
            case _ as unreachable:
                assert_never(unreachable)


def _set_scene(
    session: Session, scenes: frozenset[str], request: str, action: ProgramScene | PreviewScene
) -> None:
    # Never switch by name alone: a renamed scene would leave the stream on
    # whatever it showed, with nobody told.
    if action.name not in scenes:
        logger.warning("OBS has no scene %r; %s not sent", action.name, describe(action))
        return
    _send(session, request, {"sceneName": action.name}, action)


def _send(session: Session, request: str, data: Mapping[str, object], action: ObsAction) -> None:
    result = session.request(request, data)
    if result.ok:
        logger.info("OBS: %s", describe(action))
    else:
        logger.warning(
            "OBS refused %s (%s): %d %s", describe(action), request, result.code, result.comment
        )


@contextmanager
def websocket(url: str) -> Iterator[Socket]:
    """Open a WebSocket connection to obs-websocket at `url`; a `Connect`.

    OBS is on the church's own network, so no proxy is used. Connecting and
    each answer wait at most `TIMEOUT_SECONDS`.

    Args:
        url: The `ws://` or `wss://` URL.

    Yields:
        The open connection, closed on exit.

    Raises:
        ObsError: When OBS cannot be reached.
    """
    try:
        connection = connect(
            url,
            subprotocols=[Subprotocol("obsws.json")],
            proxy=None,
            open_timeout=TIMEOUT_SECONDS,
            close_timeout=TIMEOUT_SECONDS,
            max_size=_MAX_MESSAGE_BYTES,
        )
    except (OSError, WebSocketException) as err:
        msg = f"could not connect to OBS at {url}: {err}"
        raise ObsError(msg) from err
    with connection:
        yield _WebSocket(connection, url)


class _WebSocket:
    """A `websockets` connection as a `Socket`, its errors as `ObsError`."""

    def __init__(self, connection: ClientConnection, url: str) -> None:
        self._connection = connection
        self._url = url

    def send(self, message: str, /) -> None:
        try:
            self._connection.send(message)
        except (OSError, WebSocketException) as err:
            msg = f"lost OBS at {self._url}: {err}"
            raise ObsError(msg) from err

    def recv(self) -> str:
        try:
            message = self._connection.recv(TIMEOUT_SECONDS, decode=True)
        except TimeoutError as err:
            msg = f"OBS at {self._url} did not answer within {TIMEOUT_SECONDS:g} s"
            raise ObsError(msg) from err
        except UnicodeDecodeError as err:
            msg = f"OBS at {self._url} sent a binary message that is not UTF-8"
            raise ObsError(msg) from err
        except (OSError, WebSocketException) as err:
            msg = f"lost OBS at {self._url}: {err}"
            raise ObsError(msg) from err
        return message
