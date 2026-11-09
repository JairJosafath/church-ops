import pytest

from app.config import (
    DEFAULT_HOLDING_SCENE,
    DEFAULT_LOWER_THIRD_INPUT,
    DEFAULT_OSC_PORT,
    DEFAULT_POLL_SECONDS,
    ConfigError,
    MatrixSettings,
    ObsSettings,
    OscTarget,
    from_environ,
)

API = {"API_URL": "http://api:8000"}
MATRIX = {
    "CHAT_ADAPTER": "matrix",
    "MATRIX_HOMESERVER": "https://matrix.example.org",
    "MATRIX_ACCESS_TOKEN": "syt_secret_token",
    "MATRIX_ROOM_ID": "!crew:example.org",
}


def test_only_api_url_gives_the_defaults_and_unconfigured_devices() -> None:
    config = from_environ(API)
    assert config.api_url == "http://api:8000"
    assert config.poll_seconds == DEFAULT_POLL_SECONDS
    assert config.scenes.holding == DEFAULT_HOLDING_SCENE
    assert config.scenes.lower_third_input == DEFAULT_LOWER_THIRD_INPUT
    assert config.obs is None
    assert config.ableton is None
    assert config.matrix is None


def test_every_setting_is_read() -> None:
    environ = (
        API
        | MATRIX
        | {
            "POLL_SECONDS": "2.5",
            "OBS_URL": "ws://10.0.0.5:4455",
            "OBS_PASSWORD": "hunter2",
            "OBS_HOLDING_SCENE": "Logo",
            "OBS_LOWER_THIRD_INPUT": "Caption",
            "ABLETON_OSC_HOST": "10.0.0.6",
            "ABLETON_OSC_PORT": "11001",
        }
    )
    config = from_environ(environ)
    assert config.poll_seconds == 2.5
    assert config.obs == ObsSettings(url="ws://10.0.0.5:4455", password=environ["OBS_PASSWORD"])
    assert config.scenes.holding == "Logo"
    assert config.scenes.lower_third_input == "Caption"
    assert config.ableton == OscTarget(host="10.0.0.6", port=11001)
    assert config.matrix == MatrixSettings(
        homeserver="https://matrix.example.org",
        access_token=MATRIX["MATRIX_ACCESS_TOKEN"],
        room_id="!crew:example.org",
    )


def test_ableton_port_defaults_to_abletonosc() -> None:
    config = from_environ(API | {"ABLETON_OSC_HOST": "music.local"})
    assert config.ableton == OscTarget(host="music.local", port=DEFAULT_OSC_PORT)


def test_empty_optional_settings_count_as_unset() -> None:
    config = from_environ(API | {"OBS_URL": "", "ABLETON_OSC_HOST": " ", "OBS_HOLDING_SCENE": ""})
    assert config.obs is None
    assert config.ableton is None
    assert config.scenes.holding == DEFAULT_HOLDING_SCENE


def test_obs_without_a_password_has_an_empty_one() -> None:
    config = from_environ(API | {"OBS_URL": "ws://obs:4455"})
    assert config.obs == ObsSettings(url="ws://obs:4455", password="")


def test_secrets_are_not_in_the_repr() -> None:
    config = from_environ(API | MATRIX | {"OBS_URL": "ws://obs:4455", "OBS_PASSWORD": "hunter2"})
    assert "hunter2" not in repr(config)
    assert "syt_secret_token" not in repr(config)


@pytest.mark.parametrize(
    ("environ", "message"),
    [
        ({}, "API_URL is not set"),
        ({"API_URL": "ftp://api"}, "API_URL must be an http or https URL, got 'ftp://api'"),
        ({"API_URL": "http://"}, "API_URL must be an http or https URL, got 'http://'"),
        (API | {"POLL_SECONDS": "soon"}, "POLL_SECONDS must be a number of seconds, got 'soon'"),
        (API | {"POLL_SECONDS": "0"}, "POLL_SECONDS must be more than 0, got '0'"),
        (API | {"POLL_SECONDS": "nan"}, "POLL_SECONDS must be more than 0, got 'nan'"),
        (API | {"OBS_URL": "http://obs:4455"}, "OBS_URL must be a ws or wss URL"),
        (
            API | {"ABLETON_OSC_HOST": "m", "ABLETON_OSC_PORT": "x"},
            "ABLETON_OSC_PORT must be a port from 1 to 65535, got 'x'",
        ),
        (
            API | {"ABLETON_OSC_HOST": "m", "ABLETON_OSC_PORT": "70000"},
            "ABLETON_OSC_PORT must be a port from 1 to 65535, got '70000'",
        ),
        (API | {"CHAT_ADAPTER": "slack"}, "CHAT_ADAPTER must be log or matrix, got 'slack'"),
        (API | {"CHAT_ADAPTER": "matrix"}, "MATRIX_HOMESERVER is not set"),
        (
            API | MATRIX | {"MATRIX_HOMESERVER": "matrix.example.org"},
            "MATRIX_HOMESERVER must be an http or https URL",
        ),
        (API | MATRIX | {"MATRIX_ACCESS_TOKEN": ""}, "MATRIX_ACCESS_TOKEN is not set"),
        (API | MATRIX | {"MATRIX_ROOM_ID": ""}, "MATRIX_ROOM_ID is not set"),
    ],
    ids=[
        "no-api-url",
        "api-url-scheme",
        "api-url-host",
        "poll-not-a-number",
        "poll-zero",
        "poll-nan",
        "obs-url-scheme",
        "osc-port-not-a-number",
        "osc-port-too-big",
        "unknown-adapter",
        "matrix-without-homeserver",
        "matrix-homeserver-scheme",
        "matrix-without-token",
        "matrix-without-room",
    ],
)
def test_a_bad_setting_is_an_error_naming_it(environ: dict[str, str], message: str) -> None:
    with pytest.raises(ConfigError, match=message):
        from_environ(environ)


def test_the_adapter_name_ignores_case_and_spaces() -> None:
    config = from_environ(API | MATRIX | {"CHAT_ADAPTER": " Matrix "})
    assert config.matrix is not None
