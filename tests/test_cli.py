from __future__ import annotations

import socket
from pathlib import Path

import typer.main
from typer.testing import CliRunner

import pretty_lattice.cli as cli
from pretty_lattice.cli import _choose_port, _gui_url, _rewrite_file_open_args, _wait_for_server

runner = CliRunner()


def test_choose_requested_port() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(("127.0.0.1", 0))
        port = int(server.getsockname()[1])

    assert _choose_port("127.0.0.1", port) == port


def test_choose_requested_port_falls_back_when_busy() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(("127.0.0.1", 0))
        server.listen()
        busy_port = int(server.getsockname()[1])

        assert _choose_port("127.0.0.1", busy_port) != busy_port


def test_choose_free_port() -> None:
    port = _choose_port("127.0.0.1", 0)

    assert port > 0


def test_gui_help_shows_port_short_option() -> None:
    command = typer.main.get_command(cli.app).commands["gui"]
    port_option = next(param for param in command.params if param.name == "port")

    assert "--port" in port_option.opts
    assert "-p" in port_option.opts


def test_rewrite_file_open_args_inserts_gui_command(tmp_path: Path) -> None:
    structure_file = tmp_path / "SrTiO3.vasp"
    structure_file.write_text("structure")

    assert _rewrite_file_open_args([str(structure_file)]) == [
        "gui",
        "--file",
        str(structure_file),
    ]


def test_rewrite_file_open_args_keeps_existing_commands() -> None:
    assert _rewrite_file_open_args(["gui", "--no-open"]) == ["gui", "--no-open"]
    assert _rewrite_file_open_args(["-h"]) == ["-h"]


def test_rewrite_file_open_args_handles_missing_structure_like_path() -> None:
    assert _rewrite_file_open_args(["missing.vasp", "--no-open"]) == [
        "gui",
        "--file",
        "missing.vasp",
        "--no-open",
    ]


def test_multiple_file_open_args_are_detected() -> None:
    assert cli._is_multiple_file_open_args(["first.vasp", "second.cif"])
    assert not cli._is_multiple_file_open_args(["first.vasp"])
    assert not cli._is_multiple_file_open_args(["gui", "--no-open"])
    assert not cli._is_multiple_file_open_args(["first.vasp", "--no-open"])


def test_multi_file_child_command_uses_free_port(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(cli.sys, "argv", ["prl"])
    structure_file = tmp_path / "SrTiO3.vasp"

    assert cli._multi_file_child_command(structure_file) == [
        "prl",
        "gui",
        "--file",
        str(structure_file),
        "--port",
        "0",
    ]


def test_multiple_file_open_rejects_missing_files(tmp_path: Path) -> None:
    missing_file = tmp_path / "missing.vasp"

    assert cli._run_multiple_file_open_args([str(missing_file), str(missing_file)]) == 2


def test_gui_url_marks_startup_structure() -> None:
    assert _gui_url("127.0.0.1", 8765) == "http://127.0.0.1:8765"
    assert _gui_url("127.0.0.1", 8765, has_startup_structure=True) == (
        "http://127.0.0.1:8765?startup=1"
    )


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

    def open_url(url: str) -> bool:
        opened_urls.append(url)
        return True

    monkeypatch.setattr(cli, "_wait_for_server", wait_for_server)
    monkeypatch.setattr(cli, "_open_url", open_url)

    cli._open_browser_when_ready("http://127.0.0.1:8765", "127.0.0.1", 8765)

    assert opened_urls == ["http://127.0.0.1:8765"]


def test_open_browser_when_ready_skips_unavailable_server(monkeypatch) -> None:
    opened_urls: list[str] = []

    def wait_for_server(host: str, port: int) -> bool:
        assert host == "127.0.0.1"
        assert port == 8765
        return False

    def open_url(url: str) -> bool:
        opened_urls.append(url)
        return True

    monkeypatch.setattr(cli, "_wait_for_server", wait_for_server)
    monkeypatch.setattr(cli, "_open_url", open_url)

    cli._open_browser_when_ready("http://127.0.0.1:8765", "127.0.0.1", 8765)

    assert opened_urls == []


def test_open_url_command_uses_wslview_before_xdg_open(monkeypatch) -> None:
    monkeypatch.setattr(
        cli.shutil,
        "which",
        lambda name: f"/usr/bin/{name}" if name in {"wslview", "xdg-open"} else None,
    )

    assert cli._open_url_command() == ["wslview"]


def test_open_url_command_uses_powershell_in_wsl(monkeypatch) -> None:
    monkeypatch.setattr(cli, "_is_wsl", lambda: True)
    monkeypatch.setattr(
        cli.shutil,
        "which",
        lambda name: f"/usr/bin/{name}" if name == "powershell.exe" else None,
    )

    assert cli._open_url_command() == [
        "powershell.exe",
        "-NoProfile",
        "-Command",
        "Start-Process",
    ]


def test_open_url_command_uses_xdg_open(monkeypatch) -> None:
    monkeypatch.setattr(cli, "_is_wsl", lambda: False)
    monkeypatch.setattr(
        cli.shutil,
        "which",
        lambda name: f"/usr/bin/{name}" if name == "xdg-open" else None,
    )

    assert cli._open_url_command() == ["xdg-open"]
