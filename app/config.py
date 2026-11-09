"""The worker's settings, read once from the environment at start-up and passed down."""

import math
from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import Enum
from typing import assert_never
from urllib.parse import urlsplit

DEFAULT_POLL_SECONDS = 1.0
"""How often the worker polls the api when `POLL_SECONDS` is not set."""

DEFAULT_HOLDING_SCENE = "Holding"
"""The OBS scene for off-stream items when `OBS_HOLDING_SCENE` is not set."""

DEFAULT_LOWER_THIRD_INPUT = "Lower third"
"""The OBS text input of the caption when `OBS_LOWER_THIRD_INPUT` is not set."""

DEFAULT_OSC_PORT = 11000
"""The UDP port AbletonOSC listens on, used when `ABLETON_OSC_PORT` is not set."""

_MAX_PORT = 65535


class ConfigError(ValueError):
    """A setting in the environment is missing or malformed; the message names it."""


class ChatAdapter(Enum):
    """The channel notifications are delivered through (`CHAT_ADAPTER`)."""

    LOG = "log"
    MATRIX = "matrix"


@dataclass(frozen=True, slots=True)
class ObsSettings:
    """Where obs-websocket listens, and its password.

    Attributes:
        url: The `ws://` or `wss://` URL of obs-websocket (`OBS_URL`).
        password: The obs-websocket password (`OBS_PASSWORD`); empty when OBS asks
            for none. Kept out of the repr so it never reaches a log.
    """

    url: str
    password: str = field(repr=False)


@dataclass(frozen=True, slots=True)
class Scenes:
    """The names in the church's OBS scene collection the worker uses.

    Attributes:
        holding: The scene shown for off-stream items and unstreamed services.
        lower_third_input: The text input whose text is the caption.
    """

    holding: str
    lower_third_input: str


@dataclass(frozen=True, slots=True)
class OscTarget:
    """Where Ableton Live's OSC control surface listens (UDP).

    Attributes:
        host: The music computer's host name or IPv4 address.
        port: Its UDP port.
    """

    host: str
    port: int


@dataclass(frozen=True, slots=True)
class MatrixSettings:
    """The Matrix room notifications go to, and the bot's credentials.

    Attributes:
        homeserver: The homeserver's base URL, such as `https://matrix.example.org`.
        access_token: The bot's access token; kept out of the repr.
        room_id: The room's id, such as `!abc:example.org`.
    """

    homeserver: str
    access_token: str = field(repr=False)
    room_id: str


@dataclass(frozen=True, slots=True)
class Config:
    """Everything the worker reads from its environment.

    Attributes:
        api_url: The api's base URL (`API_URL`).
        poll_seconds: The wait between rounds when they succeed (`POLL_SECONDS`).
        scenes: The OBS scene and input names; used for logging even without OBS.
        obs: Where OBS is; `None` when `OBS_URL` is not set (unconfigured).
        ableton: Where Ableton is; `None` when `ABLETON_OSC_HOST` is not set
            (unconfigured).
        matrix: The Matrix room; `None` for the log adapter.
    """

    api_url: str
    poll_seconds: float
    scenes: Scenes
    obs: ObsSettings | None
    ableton: OscTarget | None
    matrix: MatrixSettings | None


def from_environ(environ: Mapping[str, str]) -> Config:
    """Read the worker's settings from `environ`, such as `os.environ`.

    A variable that is unset or blank counts as unset; optional ones take
    their default. Secrets never appear in an error message.

    Args:
        environ: The environment variables.

    Returns:
        The settings.

    Raises:
        ConfigError: When a required setting is missing or a setting is malformed.
    """
    obs_url = _optional(environ, "OBS_URL")
    if obs_url is not None and not _is_url(obs_url, ("ws", "wss")):
        msg = f"OBS_URL must be a ws or wss URL, got {obs_url!r}"
        raise ConfigError(msg)
    osc_host = _optional(environ, "ABLETON_OSC_HOST")
    return Config(
        api_url=_http_url(environ, "API_URL"),
        poll_seconds=_poll_seconds(environ),
        scenes=Scenes(
            holding=_optional(environ, "OBS_HOLDING_SCENE") or DEFAULT_HOLDING_SCENE,
            lower_third_input=(
                _optional(environ, "OBS_LOWER_THIRD_INPUT") or DEFAULT_LOWER_THIRD_INPUT
            ),
        ),
        obs=(
            None
            if obs_url is None
            else ObsSettings(url=obs_url, password=environ.get("OBS_PASSWORD", ""))
        ),
        ableton=None if osc_host is None else OscTarget(host=osc_host, port=_osc_port(environ)),
        matrix=_matrix(environ),
    )


def _optional(environ: Mapping[str, str], name: str) -> str | None:
    value = environ.get(name, "").strip()
    return value or None


def _required(environ: Mapping[str, str], name: str) -> str:
    value = _optional(environ, name)
    if value is None:
        msg = f"{name} is not set"
        raise ConfigError(msg)
    return value


def _is_url(value: str, schemes: tuple[str, ...]) -> bool:
    parts = urlsplit(value)
    return parts.scheme in schemes and bool(parts.netloc)


def _http_url(environ: Mapping[str, str], name: str) -> str:
    value = _required(environ, name)
    if not _is_url(value, ("http", "https")):
        msg = f"{name} must be an http or https URL, got {value!r}"
        raise ConfigError(msg)
    return value.rstrip("/")


def _poll_seconds(environ: Mapping[str, str]) -> float:
    value = _optional(environ, "POLL_SECONDS")
    if value is None:
        return DEFAULT_POLL_SECONDS
    try:
        seconds = float(value)
    except ValueError as err:
        msg = f"POLL_SECONDS must be a number of seconds, got {value!r}"
        raise ConfigError(msg) from err
    if not (math.isfinite(seconds) and seconds > 0):
        msg = f"POLL_SECONDS must be more than 0, got {value!r}"
        raise ConfigError(msg)
    return seconds


def _osc_port(environ: Mapping[str, str]) -> int:
    value = _optional(environ, "ABLETON_OSC_PORT")
    if value is None:
        return DEFAULT_OSC_PORT
    msg = f"ABLETON_OSC_PORT must be a port from 1 to {_MAX_PORT}, got {value!r}"
    try:
        port = int(value)
    except ValueError as err:
        raise ConfigError(msg) from err
    if not 1 <= port <= _MAX_PORT:
        raise ConfigError(msg)
    return port


def _matrix(environ: Mapping[str, str]) -> MatrixSettings | None:
    name = (_optional(environ, "CHAT_ADAPTER") or ChatAdapter.LOG.value).lower()
    try:
        adapter = ChatAdapter(name)
    except ValueError as err:
        msg = f"CHAT_ADAPTER must be log or matrix, got {name!r}"
        raise ConfigError(msg) from err
    match adapter:
        case ChatAdapter.LOG:
            return None
        case ChatAdapter.MATRIX:
            return MatrixSettings(
                homeserver=_http_url(environ, "MATRIX_HOMESERVER"),
                access_token=_required(environ, "MATRIX_ACCESS_TOKEN"),
                room_id=_required(environ, "MATRIX_ROOM_ID"),
            )
        case _ as unreachable:
            assert_never(unreachable)
