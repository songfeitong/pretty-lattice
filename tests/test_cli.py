from __future__ import annotations

import socket

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
        }
    ]


def test_run_gui_prints_compact_startup_banner(monkeypatch) -> None:
    uvicorn_calls: list[dict[str, object]] = []

    def run_uvicorn(*_args: object, **kwargs: object) -> None:
        uvicorn_calls.append(kwargs)

    monkeypatch.setattr(cli, "metadata_version", lambda package_name: __version__)
    monkeypatch.setattr(cli.uvicorn, "run", run_uvicorn)

    result = runner.invoke(cli.app, ["--no-open"])

    assert result.exit_code == 0
    assert result.output == (
        "\n"
        f"Pretty Lattice  v{__version__}\n"
        "\n"
        "›  Local server:  http://127.0.0.1:8765/\n"
        "›  press ctrl + c to quit\n"
        "\n"
        "\n"
        "›  Pretty Lattice stopped.\n"
    )
    assert uvicorn_calls == [
        {
            "host": "127.0.0.1",
            "port": 8765,
            "access_log": False,
            "log_level": "warning",
        }
    ]


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

    monkeypatch.setattr(cli.uvicorn, "run", run_uvicorn)

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


def test_run_gui_prints_shutdown_banner_after_keyboard_interrupt(monkeypatch) -> None:
    def run_uvicorn(*_args: object, **_kwargs: object) -> None:
        raise KeyboardInterrupt

    monkeypatch.setattr(cli.uvicorn, "run", run_uvicorn)

    result = runner.invoke(cli.app, ["--no-open"])

    assert result.exit_code == 0
    assert "›  Pretty Lattice stopped.\n" in result.output
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
