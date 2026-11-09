import pytest

from app import osc
from app.ableton import LOAD_ADDRESS, TEMPO_ADDRESS, AbletonError, Client
from app.config import OscTarget
from app.live import SongLoad

TARGET = OscTarget(host="10.0.0.6", port=11000)
SONG = SongLoad(item_id=1, title="Groot is uw trouw", key="Bb", tempo_bpm=72)


class FakeSocket:
    """A UDP socket that keeps what it was asked to send, or fails."""

    def __init__(self, error: OSError | None = None) -> None:
        self.sent: list[tuple[bytes, tuple[str, int]]] = []
        self.error = error

    def sendto(self, data: bytes, address: tuple[str, int], /) -> int:
        if self.error is not None:
            raise self.error
        self.sent.append((data, address))
        return len(data)


def test_a_load_sends_the_song_and_then_its_tempo_and_nothing_else() -> None:
    sock = FakeSocket()
    Client(sock, TARGET).load(SONG)
    assert sock.sent == [
        (osc.message(LOAD_ADDRESS, "Groot is uw trouw", "Bb"), ("10.0.0.6", 11000)),
        (osc.message(TEMPO_ADDRESS, 72.0), ("10.0.0.6", 11000)),
    ]


def test_the_addresses_are_the_contracts_and_never_the_transport() -> None:
    assert TEMPO_ADDRESS == "/live/song/set/tempo"
    assert LOAD_ADDRESS == "/church-ops/load"


def test_a_failed_send_is_an_ableton_error_naming_the_target() -> None:
    sock = FakeSocket(OSError("Network is unreachable"))
    with pytest.raises(AbletonError, match=r"10\.0\.0\.6:11000: Network is unreachable"):
        Client(sock, TARGET).load(SONG)


def test_a_song_osc_cannot_carry_sends_nothing() -> None:
    sock = FakeSocket()
    with pytest.raises(osc.EncodeError, match="NUL"):
        Client(sock, TARGET).load(SongLoad(item_id=1, title="a\0b", key="G", tempo_bpm=90))
    assert sock.sent == []
