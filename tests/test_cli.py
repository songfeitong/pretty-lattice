from __future__ import annotations

import socket

import pretty_lattice.cli as cli
from pretty_lattice.cli import _choose_port, _wait_for_server
from typer.testing import CliRunner


runner = CliRunner()


def test_choose_requested_port() -> None:
    assert _choose_port("127.0.0.1", 8765) == 8765


def test_choose_free_port() -> None:
    port = _choose_port("127.0.0.1", 0)

    assert port > 0


def test_gui_help_shows_port_short_option() -> None:
    result = runner.invoke(cli.app, ["gui", "--help"])

    assert result.exit_code == 0
    assert "--port" in result.output
    assert "-p" in result.output


def test_help_accepts_short_option() -> None:
    root_result = runner.invoke(cli.app, ["-h"])
    gui_result = runner.invoke(cli.app, ["gui", "-h"])

    assert root_result.exit_code == 0
    assert gui_result.exit_code == 0
    assert "Pretty Lattice command line tools." in root_result.output
    assert "Start the local Pretty Lattice GUI server." in gui_result.output


def test_wait_for_server_accepts_ready_port() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(("127.0.0.1", 0))
        server.listen()
        port = int(server.getsockname()[1])

        assert _wait_for_server("127.0.0.1", port, timeout_seconds=0.5)


def test_open_browser_when_ready_waits_for_server(monkeypatch) -> None:
    opened_urls: list[str] = []

    def wait_for_server(host: str, port: int) -> bool:
        assert host == "127.0.0.1"
        assert port == 8765
        return True

    def open_browser(url: str) -> bool:
        opened_urls.append(url)
        return True

    monkeypatch.setattr(cli, "_wait_for_server", wait_for_server)
    monkeypatch.setattr(cli.webbrowser, "open", open_browser)

    cli._open_browser_when_ready("http://127.0.0.1:8765", "127.0.0.1", 8765)

    assert opened_urls == ["http://127.0.0.1:8765"]


def test_open_browser_when_ready_skips_unavailable_server(monkeypatch) -> None:
    opened_urls: list[str] = []

    def wait_for_server(host: str, port: int) -> bool:
        assert host == "127.0.0.1"
        assert port == 8765
        return False

    def open_browser(url: str) -> bool:
        opened_urls.append(url)
        return True

    monkeypatch.setattr(cli, "_wait_for_server", wait_for_server)
    monkeypatch.setattr(cli.webbrowser, "open", open_browser)

    cli._open_browser_when_ready("http://127.0.0.1:8765", "127.0.0.1", 8765)

    assert opened_urls == []
