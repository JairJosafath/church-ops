import pytest

from app.osc import Argument, EncodeError, message


@pytest.mark.parametrize(
    ("address", "arguments", "expected"),
    [
        (
            "/oscillator/4/frequency",
            (440.0,),
            "2f6f7363 696c6c61 746f722f 342f6672 65717565 6e637900 2c660000 43dc0000",
        ),
        (
            "/foo",
            (1000, -1, "hello", 1.234, 5.678),
            (
                "2f666f6f 00000000 2c696973 66660000 000003e8 ffffffff"
                " 68656c6c 6f000000 3f9df3b6 40b5b22d"
            ),
        ),
        ("/x", (), "2f780000 2c000000"),
        ("/abc", ("",), "2f616263 00000000 2c730000 00000000"),
    ],
    ids=["spec-float", "spec-mixed", "no-arguments", "empty-string"],
)
def test_messages_encode_as_the_osc_spec_shows(
    address: str, arguments: tuple[Argument, ...], expected: str
) -> None:
    assert message(address, *arguments) == bytes.fromhex(expected.replace(" ", ""))


def test_strings_are_utf8_and_padded_to_four_bytes() -> None:
    encoded = message("/t", "Heer, U bent mijn leven · ë")
    assert len(encoded) % 4 == 0
    assert "Heer, U bent mijn leven · ë".encode() + b"\0" in encoded


@pytest.mark.parametrize(
    ("address", "arguments", "error"),
    [
        ("live/tempo", (), "an OSC address starts with /, got 'live/tempo'"),
        ("/t", ("a\0b",), "an OSC string cannot hold a NUL character"),
        ("/t", (2**31,), "an OSC int32 is from -2147483648 to 2147483647, got 2147483648"),
        ("/t", (1e39,), "an OSC float32 cannot hold 1e"),
        ("/t", (True,), "an OSC argument is a str, int or float, got bool"),
    ],
    ids=["relative-address", "nul-in-string", "int-too-big", "float-too-big", "bool"],
)
def test_what_osc_cannot_carry_is_an_encode_error(
    address: str, arguments: tuple[Argument, ...], error: str
) -> None:
    with pytest.raises(EncodeError, match=error):
        message(address, *arguments)
