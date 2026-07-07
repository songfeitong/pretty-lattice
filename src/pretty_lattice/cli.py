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
from rich.console import Console
from rich.text import Text

from pretty_lattice import __version__
from pretty_lattice.server.app import create_app

HELP_OPTION_NAMES = ["-h", "--help"]
PACKAGE_NAME = "pretty-lattice"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
LOGO_PRETTY_COLOR = "#9772c0"
LOGO_LATTICE_COLOR = LOGO_PRETTY_COLOR
PROMPT_SYMBOL = "›"

HostOption = Annotated[str, typer.Option(help="Host address for the local GUI server.")]
PortOption = Annotated[
    int,
    typer.Option(
        "--port",
        "-p",
        help="Port for the local GUI server. Use 0 for any free port.",
    ),
]
NoOpenOption = Annotated[
    bool,
    typer.Option("--no-open", help="Do not open the browser automatically."),
]
ReloadOption = Annotated[bool, typer.Option(help="Reload the server when Python files change.")]
VerboseOption = Annotated[
    bool,
    typer.Option("--verbose", help="Show server startup and request logs."),
]


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
    help="Start the Pretty Lattice local GUI.",
    context_settings={"help_option_names": HELP_OPTION_NAMES},
    subcommand_metavar="",
)


@app.callback(invoke_without_command=True)
def main(
    ctx: typer.Context,
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
    host: HostOption = DEFAULT_HOST,
    port: PortOption = DEFAULT_PORT,
    no_open: NoOpenOption = False,
    reload: ReloadOption = False,
    verbose: VerboseOption = False,
) -> None:
    """Start the Pretty Lattice local GUI."""
    if ctx.invoked_subcommand is None:
        _run_gui(host=host, port=port, no_open=no_open, reload=reload, verbose=verbose)


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


def _uvicorn_log_options(verbose: bool) -> dict[str, object]:
    return {
        "access_log": verbose,
        "log_level": "info" if verbose else "warning",
    }


def _startup_title() -> Text:
    return Text.assemble(
        ("Pretty", f"bold {LOGO_PRETTY_COLOR}"),
        " ",
        ("Lattice", f"bold {LOGO_LATTICE_COLOR}"),
        "  ",
        (f"v{_current_version()}", "dim"),
    )


def _print_startup_banner(url: str) -> None:
    console = Console()
    console.print()
    console.print(_startup_title(), highlight=False)
    console.print()
    console.print(
        f"[green]{PROMPT_SYMBOL}[/green]  [bold]Local server:[/bold]  [cyan]{url}[/cyan]",
        highlight=False,
    )
    console.print(
        Text.assemble(
            (PROMPT_SYMBOL, "green"),
            "  ",
            ("press ", "dim"),
            ("ctrl + c", "bold"),
            (" to quit", "dim"),
        ),
        highlight=False,
    )
    console.print()


def _print_shutdown_banner() -> None:
    console = Console()
    console.print()
    console.print(
        Text.assemble((PROMPT_SYMBOL, "green"), "  ", ("Pretty Lattice stopped.", "dim"))
    )


def _run_uvicorn(*args: object, **kwargs: object) -> None:
    try:
        uvicorn.run(*args, **kwargs)
    except KeyboardInterrupt:
        pass
    _print_shutdown_banner()


def _run_gui(host: str, port: int, no_open: bool, reload: bool, verbose: bool) -> None:
    selected_port = _choose_port(host, port)
    url = f"http://{host}:{selected_port}/"

    _print_startup_banner(url)
    if not no_open:
        _start_browser_opener(url, host, selected_port)

    log_options = _uvicorn_log_options(verbose)
    if reload:
        _run_uvicorn(
            "pretty_lattice.server.app:create_app",
            host=host,
            port=selected_port,
            factory=True,
            reload=True,
            **log_options,
        )
        return

    _run_uvicorn(create_app(), host=host, port=selected_port, **log_options)


@app.command(context_settings={"help_option_names": HELP_OPTION_NAMES}, hidden=True)
def gui(
    host: HostOption = DEFAULT_HOST,
    port: PortOption = DEFAULT_PORT,
    no_open: NoOpenOption = False,
    reload: ReloadOption = False,
    verbose: VerboseOption = False,
) -> None:
    """Start the local Pretty Lattice GUI server.

    Kept as a compatibility alias for `prl`.
    """
    _run_gui(host=host, port=port, no_open=no_open, reload=reload, verbose=verbose)
