from __future__ import annotations

import shutil
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path
from tempfile import TemporaryDirectory

import typer
import uvicorn

from pretty_lattice.server.app import create_app

HELP_OPTION_NAMES = ["-h", "--help"]
DEFAULT_PORT = 8765
AUTO_SHUTDOWN_HEARTBEAT_TIMEOUT_SECONDS = 6.0
COMMAND_NAMES = {"gui"}
STRUCTURE_PATH_NAMES = {"CONTCAR", "POSCAR", "STRU"}
STRUCTURE_PATH_SUFFIXES = {
    ".cif",
    ".contcar",
    ".cssr",
    ".mcif",
    ".poscar",
    ".vasp",
    ".xsf",
}

app = typer.Typer(
    help=(
        "Pretty Lattice command line tools. "
        "Open structures directly with 'prl STRUCTURE.vasp'."
    ),
    epilog=(
        "Examples:\n"
        "  prl gui\n"
        "  prl STRUCTURE.vasp\n"
        "  prl STRUCTURE_1.vasp STRUCTURE_2.cif"
    ),
    context_settings={"help_option_names": HELP_OPTION_NAMES},
)


@app.callback()
def main() -> None:
    """Pretty Lattice command line tools."""


def run() -> None:
    """Console-script entry point with VESTA-style file opening."""
    if _is_multiple_file_open_args(sys.argv[1:]):
        sys.exit(_run_multiple_file_open_args(sys.argv[1:]))

    sys.argv[1:] = _rewrite_file_open_args(sys.argv[1:])
    app()


def _is_multiple_file_open_args(args: list[str]) -> bool:
    return len(args) > 1 and all(
        not arg.startswith("-") and _looks_like_structure_path(arg) for arg in args
    )


def _run_multiple_file_open_args(args: list[str]) -> int:
    structure_paths = [Path(arg).resolve() for arg in args]
    missing_paths = [path for path in structure_paths if not path.is_file()]
    if missing_paths:
        for path in missing_paths:
            typer.echo(f"File does not exist: {path}", err=True)
        return 2

    processes: list[subprocess.Popen[bytes]] = []
    with TemporaryDirectory(prefix="pretty-lattice-open-") as temp_dir:
        ready_files = [
            Path(temp_dir) / f"structure-{index}.port"
            for index in range(len(structure_paths))
        ]
        try:
            for path, ready_file in zip(structure_paths, ready_files, strict=True):
                processes.append(subprocess.Popen(_multi_file_child_command(path, ready_file)))
            for path, ready_file, process in zip(
                structure_paths,
                ready_files,
                processes,
                strict=True,
            ):
                port = _wait_for_ready_port(ready_file, process)
                if port is None:
                    typer.echo(f"Pretty Lattice GUI did not start for {path}.", err=True)
                    continue
                url = _gui_url("127.0.0.1", port, has_startup_structure=True)
                if _wait_for_server("127.0.0.1", port):
                    if not _open_url(url, wait_for_opener=True):
                        typer.echo(f"Open this URL in your browser: {url}", err=True)
                    time.sleep(0.35)
                else:
                    typer.echo(
                        f"Pretty Lattice GUI did not become reachable for {path}: {url}",
                        err=True,
                    )
            return _wait_for_child_processes(processes)
        except KeyboardInterrupt:
            _terminate_child_processes(processes)
            return 130


def _multi_file_child_command(path: Path, ready_file: Path) -> list[str]:
    return [
        sys.argv[0],
        "gui",
        "--file",
        str(path),
        "--port",
        "0",
        "--no-open",
        "--external-open",
        "--ready-file",
        str(ready_file),
    ]


def _wait_for_ready_port(
    ready_file: Path,
    process: subprocess.Popen[bytes],
    timeout_seconds: float = 30.0,
) -> int | None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if ready_file.is_file():
            try:
                return int(ready_file.read_text(encoding="utf-8").strip())
            except ValueError:
                return None
        if process.poll() is not None:
            return None
        time.sleep(0.05)
    return None


def _write_ready_port(ready_file: Path | None, port: int) -> None:
    if ready_file is None:
        return
    ready_file.parent.mkdir(parents=True, exist_ok=True)
    ready_file.write_text(f"{port}\n", encoding="utf-8")


def _wait_for_child_processes(processes: list[subprocess.Popen[bytes]]) -> int:
    exit_codes = [process.wait() for process in processes]
    failed_exit_codes = [code for code in exit_codes if code != 0]
    if not failed_exit_codes:
        return 0
    return failed_exit_codes[0]


def _terminate_child_processes(processes: list[subprocess.Popen[bytes]]) -> None:
    for process in processes:
        if process.poll() is None:
            process.terminate()
    for process in processes:
        if process.poll() is None:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


def _rewrite_file_open_args(args: list[str]) -> list[str]:
    if not args:
        return args

    first_arg = args[0]
    if first_arg.startswith("-") or first_arg in COMMAND_NAMES:
        return args

    if not _looks_like_structure_path(first_arg):
        return args

    return ["gui", "--file", first_arg, *args[1:]]


def _looks_like_structure_path(value: str) -> bool:
    path = Path(value)
    if path.is_file():
        return True
    if path.name.upper() in STRUCTURE_PATH_NAMES:
        return True
    if path.suffix.lower() in STRUCTURE_PATH_SUFFIXES:
        return True
    return any(separator in value for separator in ("/", "\\"))


def _choose_port(host: str, requested_port: int) -> int:
    with _bind_server_socket(host, requested_port) as sock:
        return int(sock.getsockname()[1])


def _bind_server_socket(host: str, requested_port: int) -> socket.socket:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind((host, requested_port))
        sock.listen()
        return sock
    except OSError:
        if requested_port == 0:
            sock.close()
            raise

    sock.close()
    fallback_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    fallback_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    fallback_sock.bind((host, 0))
    fallback_sock.listen()
    return fallback_sock


def _is_port_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


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
        if not _open_url(url):
            typer.echo(f"Open this URL in your browser: {url}", err=True)


def _open_url(url: str, wait_for_opener: bool = False) -> bool:
    command = _open_url_command()
    if command is not None:
        try:
            opener_command = [*command, url]
            if wait_for_opener:
                subprocess.run(
                    opener_command,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=5,
                    check=False,
                )
            else:
                subprocess.Popen(
                    opener_command,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            return True
        except (OSError, subprocess.TimeoutExpired):
            pass

    return webbrowser.open(url)


def _open_url_command() -> list[str] | None:
    if shutil.which("wslview"):
        return ["wslview"]
    if _is_wsl() and shutil.which("powershell.exe"):
        return ["powershell.exe", "-NoProfile", "-Command", "Start-Process"]
    if _is_wsl() and shutil.which("cmd.exe"):
        return ["cmd.exe", "/c", "start", ""]
    if shutil.which("xdg-open"):
        return ["xdg-open"]
    return None


def _is_wsl() -> bool:
    try:
        os_release = Path("/proc/sys/kernel/osrelease").read_text(encoding="utf-8")
    except OSError:
        return False
    return "microsoft" in os_release.lower() or "wsl" in os_release.lower()


def _start_browser_opener(url: str, host: str, port: int) -> None:
    threading.Thread(
        target=_open_browser_when_ready,
        args=(url, host, port),
        daemon=True,
    ).start()


def _start_auto_shutdown_monitor(
    app: object,
    server: uvicorn.Server,
    timeout_seconds: float = AUTO_SHUTDOWN_HEARTBEAT_TIMEOUT_SECONDS,
) -> None:
    threading.Thread(
        target=_auto_shutdown_when_browser_closes,
        args=(app, server, timeout_seconds),
        daemon=True,
    ).start()


def _auto_shutdown_when_browser_closes(
    app: object,
    server: uvicorn.Server,
    timeout_seconds: float,
) -> None:
    while not server.should_exit:
        time.sleep(1.0)
        state = app.state
        if not getattr(state, "auto_shutdown_enabled", False):
            return
        if not getattr(state, "session_heartbeat_seen", False):
            continue
        last_heartbeat = getattr(state, "session_last_heartbeat", None)
        if last_heartbeat is None:
            continue
        if time.monotonic() - float(last_heartbeat) >= timeout_seconds:
            typer.echo("Browser session ended; shutting down Pretty Lattice GUI.")
            server.should_exit = True
            return


@app.command(context_settings={"help_option_names": HELP_OPTION_NAMES})
def gui(
    structure_file: Path | None = typer.Option(
        None,
        "--file",
        "-f",
        exists=True,
        file_okay=True,
        dir_okay=False,
        readable=True,
        resolve_path=True,
        help="Structure file to open when the GUI starts.",
    ),
    host: str = typer.Option("127.0.0.1", help="Host address for the local GUI server."),
    port: int = typer.Option(
        DEFAULT_PORT,
        "--port",
        "-p",
        help="Port for the local GUI server. Use 0 for any free port.",
    ),
    no_open: bool = typer.Option(False, "--no-open", help="Do not open the browser automatically."),
    external_open: bool = typer.Option(
        False,
        "--external-open",
        help="Internal: do not open the browser here, but keep browser-session shutdown enabled.",
        hidden=True,
    ),
    ready_file: Path | None = typer.Option(
        None,
        "--ready-file",
        help="Internal: write the selected port to this file after the server socket is ready.",
        hidden=True,
    ),
    reload: bool = typer.Option(False, help="Reload the server when Python files change."),
) -> None:
    """Start the local Pretty Lattice GUI server."""
    startup_structure_path = structure_file.resolve() if structure_file else None

    if reload and startup_structure_path is not None:
        raise typer.BadParameter("--reload cannot be used together with --file.")

    if reload:
        selected_port = _choose_port(host, port)
        url = _gui_url(host, selected_port)
        typer.echo(f"Starting Pretty Lattice GUI at {url}")
        if selected_port != port:
            typer.echo(f"Port {port} is already in use; using {selected_port} instead.")
        if not no_open:
            _start_browser_opener(url, host, selected_port)

        uvicorn.run(
            "pretty_lattice.server.app:create_app",
            host=host,
            port=selected_port,
            factory=True,
            reload=True,
        )
        return

    server_socket = _bind_server_socket(host, port)
    selected_port = int(server_socket.getsockname()[1])
    url = _gui_url(host, selected_port, has_startup_structure=startup_structure_path is not None)

    typer.echo(f"Starting Pretty Lattice GUI at {url}")
    if selected_port != port:
        typer.echo(f"Port {port} is already in use; using {selected_port} instead.")
    if startup_structure_path is not None:
        typer.echo(f"Opening structure: {startup_structure_path}")
    _write_ready_port(ready_file, selected_port)
    if not no_open:
        _start_browser_opener(url, host, selected_port)

    app_instance = create_app(
        startup_structure_path=startup_structure_path,
        auto_shutdown=not no_open or external_open,
    )
    config = uvicorn.Config(app_instance, host=host, port=selected_port)
    server = uvicorn.Server(config)
    if not no_open or external_open:
        _start_auto_shutdown_monitor(app_instance, server)
    server.run(sockets=[server_socket])


def _gui_url(host: str, port: int, has_startup_structure: bool = False) -> str:
    url = f"http://{host}:{port}"
    if has_startup_structure:
        return f"{url}?startup=1"
    return url
