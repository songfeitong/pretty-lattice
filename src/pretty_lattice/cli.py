from __future__ import annotations

import socket
import threading
import time
import webbrowser
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as metadata_version
from typing import Annotated

import typer
import uvicorn

from pretty_lattice import __version__
from pretty_lattice.server.app import create_app

HELP_OPTION_NAMES = ["-h", "--help"]
PACKAGE_NAME = "pretty-lattice"


def _current_version() -> str:
    try:
        return metadata_version(PACKAGE_NAME)
    except PackageNotFoundError:
        return __version__


def _print_version(show_version: bool) -> None:
    if show_version:
        typer.echo(f"Pretty Lattice {_current_version()}")
        raise typer.Exit()


app = typer.Typer(
    help="Pretty Lattice command line tools.",
    context_settings={"help_option_names": HELP_OPTION_NAMES},
)


@app.callback()
def main(
    version: Annotated[
        bool,
        typer.Option(
            "--version",
            "-V",
            help="Show the installed Pretty Lattice version.",
            callback=_print_version,
            is_eager=True,
        ),
    ] = False,
) -> None:
    """Pretty Lattice command line tools."""


def _choose_port(host: str, requested_port: int) -> int:
    if requested_port != 0:
        return requested_port

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def _wait_for_server(host: str, port: int, timeout_seconds: float = 30.0) -> bool:
    deadline = time.monotonic() + timeout_seconds

    while time.monotonic() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.2):
                return True
        except OSError:
            time.sleep(0.05)

    return False


def _open_browser_when_ready(url: str, host: str, port: int) -> None:
    if _wait_for_server(host, port):
        webbrowser.open(url)


def _start_browser_opener(url: str, host: str, port: int) -> None:
    threading.Thread(
        target=_open_browser_when_ready,
        args=(url, host, port),
        daemon=True,
    ).start()


@app.command(context_settings={"help_option_names": HELP_OPTION_NAMES})
def gui(
    host: str = typer.Option("127.0.0.1", help="Host address for the local GUI server."),
    port: int = typer.Option(
        8765,
        "--port",
        "-p",
        help="Port for the local GUI server. Use 0 for any free port.",
    ),
    no_open: bool = typer.Option(False, "--no-open", help="Do not open the browser automatically."),
    reload: bool = typer.Option(False, help="Reload the server when Python files change."),
) -> None:
    """Start the local Pretty Lattice GUI server."""
    selected_port = _choose_port(host, port)
    url = f"http://{host}:{selected_port}"

    typer.echo(f"Starting Pretty Lattice GUI at {url}")
    if not no_open:
        _start_browser_opener(url, host, selected_port)

    if reload:
        uvicorn.run(
            "pretty_lattice.server.app:create_app",
            host=host,
            port=selected_port,
            factory=True,
            reload=True,
        )
        return

    uvicorn.run(create_app(), host=host, port=selected_port)
