"""Open Sound Control 1.0 messages, encoded for one UDP datagram.

A message is its address, its type tags (`,` then one letter per argument)
and its arguments, each padded to a multiple of 4 bytes, numbers big-endian.
Strings are UTF-8, as the common OSC libraries read them.
"""

import struct
from typing import assert_never

type Argument = str | int | float
"""An OSC argument: a string (`s`), an int32 (`i`) or a float32 (`f`)."""

_INT32_MIN = -(2**31)
_INT32_MAX = 2**31 - 1


class EncodeError(ValueError):
    """A value that OSC cannot carry; the message says which and why."""


def message(address: str, *arguments: Argument) -> bytes:
    """Encode an OSC message.

    Args:
        address: Where it goes, such as `/live/song/set/tempo`.
        *arguments: Its arguments, in order; none is allowed.

    Returns:
        The datagram's bytes, a multiple of 4 long.

    Raises:
        EncodeError: When the address does not start with `/`, a string holds a
            NUL character, a number does not fit 32 bits, or an argument is of
            another type (`bool` included).
    """
    if not address.startswith("/"):
        msg = f"an OSC address starts with /, got {address!r}"
        raise EncodeError(msg)
    tags = ","
    data = []
    for argument in arguments:
        tag, encoded = _argument(argument)
        tags += tag
        data.append(encoded)
    return b"".join([_string(address), _string(tags), *data])


def _string(value: str) -> bytes:
    if "\0" in value:
        msg = f"an OSC string cannot hold a NUL character, got {value!r}"
        raise EncodeError(msg)
    encoded = value.encode() + b"\0"
    return encoded + b"\0" * (-len(encoded) % 4)


def _argument(argument: Argument) -> tuple[str, bytes]:
    match argument:
        case bool():
            # bool is an int in Python; OSC has its own T and F tags, unused here.
            msg = f"an OSC argument is a str, int or float, got {type(argument).__name__}"
            raise EncodeError(msg)
        case str():
            return "s", _string(argument)
        case int():
            if not _INT32_MIN <= argument <= _INT32_MAX:
                msg = f"an OSC int32 is from {_INT32_MIN} to {_INT32_MAX}, got {argument}"
                raise EncodeError(msg)
            return "i", struct.pack(">i", argument)
        case float():
            try:
                return "f", struct.pack(">f", argument)
            except OverflowError as err:
                msg = f"an OSC float32 cannot hold {argument}"
                raise EncodeError(msg) from err
        case _ as unreachable:
            assert_never(unreachable)
