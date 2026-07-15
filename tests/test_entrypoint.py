from __future__ import annotations

from pretty_lattice.entrypoint import _unsupported_python_message, main


def test_supported_python_has_no_runtime_error() -> None:
    assert _unsupported_python_message((3, 12, 0)) is None
    assert _unsupported_python_message((3, 14, 1)) is None


def test_unsupported_python_error_names_required_and_running_versions() -> None:
    message = _unsupported_python_message((3, 8, 18))

    assert message is not None
    assert "Python 3.12 or newer" in message
    assert "Python 3.8.18" in message


def test_entrypoint_stops_before_loading_cli_on_unsupported_python(
    monkeypatch,
    capsys,
) -> None:
    monkeypatch.setattr("pretty_lattice.entrypoint.sys.version_info", (3, 8, 18))

    assert main() == 1
    assert "Pretty Lattice requires Python 3.12 or newer" in capsys.readouterr().err
