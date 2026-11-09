"""Ableton Live on the music computer, driven over OSC: load a song and set its tempo.

The worker never starts or stops the transport; the band leader starts each
song. UDP confirms nothing, so a load that was sent is not known to have
arrived.
"""

from typing import Protocol

from app import osc
from app.config import OscTarget
from app.live import SongLoad

TEMPO_ADDRESS = "/live/song/set/tempo"
"""AbletonOSC's address for the session tempo, a float in beats per minute."""

LOAD_ADDRESS = "/church-ops/load"
"""The church's control surface script's address to load a song: title, then key."""


class AbletonError(Exception):
    """A message could not be sent to the music computer."""


class DatagramSocket(Protocol):
    """What the client needs of a UDP socket: `socket.socket` has it."""

    def sendto(self, data: bytes, address: tuple[str, int], /) -> int:
        """Send one datagram to `address`, returning the bytes sent."""
        ...


class Client:
    """Sends a song's load and tempo to Ableton Live's OSC control surface."""

    def __init__(self, sock: DatagramSocket, target: OscTarget) -> None:
        """Send through `sock`, which the caller opens and closes, to `target`.

        Args:
            sock: An open UDP socket.
            target: Where Live's OSC control surface listens.
        """
        self._sock = sock
        self._target = target

    def load(self, song: SongLoad) -> None:
        """Have Live load `song`, then set the session tempo to the song's.

        The tempo goes last, so the arrangement's tempo stands even if the load
        brings a tempo of its own.

        Args:
            song: The song, its key and its tempo.

        Raises:
            osc.EncodeError: When OSC cannot carry the song's title or key; then
                nothing is sent.
            AbletonError: When a message could not be sent.
        """
        messages = (
            osc.message(LOAD_ADDRESS, song.title, song.key),
            osc.message(TEMPO_ADDRESS, float(song.tempo_bpm)),
        )
        address = (self._target.host, self._target.port)
        for data in messages:
            try:
                self._sock.sendto(data, address)
            except OSError as err:
                msg = f"could not send to Ableton at {address[0]}:{address[1]}: {err}"
                raise AbletonError(msg) from err
