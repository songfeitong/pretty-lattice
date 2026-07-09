from __future__ import annotations

import socket
import subprocess
import sys

import typer.main
from typer.testing import CliRunner

import pretty_lattice.cli as cli
from pretty_lattice import __version__
from pretty_lattice.cli import _choose_port, _wait_for_server

runner = CliRunner()


def test_choose_requested_port() -> None:
    assert _choose_port("127.0.0.1", 8765) == 8765


def test_choose_free_port() -> None:
    port = _choose_port("127.0.0.1", 0)

    assert port > 0


def test_default_port_falls_back_when_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(cli, "_is_port_available", lambda host, port: False)
    monkeypatch.setattr(cli, "_choose_free_port", lambda host: 54321)

    assert (
        _choose_port("127.0.0.1", 8765, fallback_to_available_port=True) == 54321
    )


def test_explicit_port_does_not_fallback(monkeypatch) -> None:
    def choose_free_port(host: str) -> int:
        raise AssertionError("explicit ports should not fall back")

    monkeypatch.setattr(cli, "_is_port_available", lambda host, port: False)
    monkeypatch.setattr(cli, "_choose_free_port", choose_free_port)

    assert _choose_port("127.0.0.1", 8765) == 8765


def test_port_availability_rejects_listening_port() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind(("127.0.0.1", 0))
        server.listen()
        port = int(server.getsockname()[1])

        assert not cli._is_port_available("127.0.0.1", port)


def test_cli_import_defers_server_app() -> None:
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import sys; "
                "import pretty_lattice.cli; "
                "print('pretty_lattice.server.app' in sys.modules)"
            ),
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    assert result.stdout.strip() == "False"


def test_root_command_starts_gui(monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    def run_gui(**kwargs: object) -> None:
        calls.append(kwargs)

    monkeypatch.setattr(cli, "_run_gui", run_gui)

    result = runner.invoke(cli.app, [])

    assert result.exit_code == 0
    assert calls == [
        {
            "host": "127.0.0.1",
            "port": 8765,
            "no_open": False,
            "reload": False,
            "verbose": False,
            "fallback_to_available_port": True,
        }
    ]


def test_root_command_accepts_gui_options(monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    def run_gui(**kwargs: object) -> None:
        calls.append(kwargs)

    monkeypatch.setattr(cli, "_run_gui", run_gui)

    result = runner.invoke(
        cli.app,
        ["--host", "0.0.0.0", "-p", "0", "--no-open", "--reload", "--verbose"],
    )

    assert result.exit_code == 0
    assert calls == [
        {
            "host": "0.0.0.0",
            "port": 0,
            "no_open": True,
            "reload": True,
            "verbose": True,
            "fallback_to_available_port": False,
        }
    ]


def test_root_command_treats_explicit_default_port_as_strict(monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    def run_gui(**kwargs: object) -> None:
        calls.append(kwargs)

    monkeypatch.setattr(cli, "_run_gui", run_gui)

    result = runner.invoke(cli.app, ["--port", "8765"])

    assert result.exit_code == 0
    assert calls == [
        {
            "host": "127.0.0.1",
            "port": 8765,
            "no_open": False,
            "reload": False,
            "verbose": False,
            "fallback_to_available_port": False,
        }
    ]


def test_gui_command_remains_compatibility_alias(monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    def run_gui(**kwargs: object) -> None:
        calls.append(kwargs)

    monkeypatch.setattr(cli, "_run_gui", run_gui)

    result = runner.invoke(cli.app, ["gui", "--no-open"])

    assert result.exit_code == 0
    assert calls == [
        {
            "host": "127.0.0.1",
            "port": 8765,
            "no_open": True,
            "reload": False,
            "verbose": False,
            "fallback_to_available_port": True,
        }
    ]


def test_run_gui_prints_compact_startup_banner(monkeypatch) -> None:
    uvicorn_calls: list[dict[str, object]] = []

    def run_uvicorn(*_args: object, **kwargs: object) -> None:
        uvicorn_calls.append(kwargs)

    monkeypatch.setattr(cli, "metadata_version", lambda package_name: __version__)
    monkeypatch.setattr(cli, "_is_port_available", lambda host, port: True)
    monkeypatch.setattr(cli, "_load_uvicorn_run", lambda: run_uvicorn)

    result = runner.invoke(cli.app, ["--no-open"])

    assert result.exit_code == 0
    assert result.output == (
        "╭──────────────────────────────────────────╮\n"
        f"│ 💠 Pretty Lattice  v{__version__}                │\n"
        "│                                          │\n"
        "│ ›  Local server:  http://localhost:8765/ │\n"
        "│ ›  press ctrl + c to quit                │\n"
        "╰──────────────────────────────────────────╯\n"
    )
    assert uvicorn_calls == [
        {
            "host": "127.0.0.1",
            "port": 8765,
            "access_log": False,
            "log_level": "warning",
        }
    ]


def test_run_gui_falls_back_from_default_port_when_occupied(monkeypatch) -> None:
    uvicorn_calls: list[dict[str, object]] = []

    def run_uvicorn(*_args: object, **kwargs: object) -> None:
        uvicorn_calls.append(kwargs)

    monkeypatch.setattr(cli, "_is_port_available", lambda host, port: False)
    monkeypatch.setattr(cli, "_choose_free_port", lambda host: 54321)
    monkeypatch.setattr(cli, "_load_uvicorn_run", lambda: run_uvicorn)

    result = runner.invoke(cli.app, ["--no-open"])

    assert result.exit_code == 0
    assert "http://localhost:54321/" in result.output
    assert uvicorn_calls == [
        {
            "host": "127.0.0.1",
            "port": 54321,
            "access_log": False,
            "log_level": "warning",
        }
    ]


def test_display_url_uses_localhost_for_default_host() -> None:
    assert cli._display_url("127.0.0.1", 8765) == "http://localhost:8765/"
    assert cli._display_url("0.0.0.0", 8765) == "http://0.0.0.0:8765/"


def test_startup_banner_does_not_clear_terminal(monkeypatch) -> None:
    console_calls: list[str] = []

    class FakeConsole:
        def clear(self) -> None:
            console_calls.append("clear")

        def print(self, *_args: object, **_kwargs: object) -> None:
            console_calls.append("print")

    monkeypatch.setattr(cli, "Console", FakeConsole)

    cli._print_startup_banner("http://127.0.0.1:8765/")

    assert "clear" not in console_calls


def test_run_gui_verbose_enables_server_logs(monkeypatch) -> None:
    uvicorn_calls: list[dict[str, object]] = []

    def run_uvicorn(*_args: object, **kwargs: object) -> None:
        uvicorn_calls.append(kwargs)

    monkeypatch.setattr(cli, "_load_uvicorn_run", lambda: run_uvicorn)
    monkeypatch.setattr(cli, "_is_port_available", lambda host, port: True)

    result = runner.invoke(cli.app, ["--no-open", "--verbose"])

    assert result.exit_code == 0
    assert uvicorn_calls == [
        {
            "host": "127.0.0.1",
            "port": 8765,
            "access_log": True,
            "log_level": "info",
        }
    ]


def test_run_gui_handles_keyboard_interrupt_without_traceback(monkeypatch) -> None:
    def run_uvicorn(*_args: object, **_kwargs: object) -> None:
        raise KeyboardInterrupt

    monkeypatch.setattr(cli, "_load_uvicorn_run", lambda: run_uvicorn)
    monkeypatch.setattr(cli, "_is_port_available", lambda host, port: True)

    result = runner.invoke(cli.app, ["--no-open"])

    assert result.exit_code == 0
    assert "Pretty Lattice stopped" not in result.output
    assert "KeyboardInterrupt" not in result.output


def test_gui_help_shows_port_short_option() -> None:
    command = typer.main.get_command(cli.app).commands["gui"]
    port_option = next(param for param in command.params if param.name == "port")

    assert "--port" in port_option.opts
    assert "-p" in port_option.opts


def test_root_version_option_is_registered() -> None:
    command = typer.main.get_command(cli.app)
    version_option = next(param for param in command.params if param.name == "version")

    assert "--version" in version_option.opts
    assert "-V" in version_option.opts
    assert "version" not in command.commands


def test_root_version_option_prints_current_version(monkeypatch) -> None:
    monkeypatch.setattr(cli, "metadata_version", lambda package_name: __version__)

    result = runner.invoke(cli.app, ["--version"])

    assert result.exit_code == 0
    assert result.output == f"Pretty Lattice {__version__}\n"


def test_root_version_short_option_prints_current_version(monkeypatch) -> None:
    monkeypatch.setattr(cli, "metadata_version", lambda package_name: __version__)

    result = runner.invoke(cli.app, ["-V"])

    assert result.exit_code == 0
    assert result.output == f"Pretty Lattice {__version__}\n"


def test_help_accepts_short_option() -> None:
    root_result = runner.invoke(cli.app, ["-h"])
    gui_result = runner.invoke(cli.app, ["gui", "-h"])

    assert root_result.exit_code == 0
    assert gui_result.exit_code == 0
    assert "Start the Pretty Lattice local GUI." in root_result.output
    assert "gui" not in root_result.output
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
