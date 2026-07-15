"""Dependency-free console entry point for early runtime checks."""

import sys

MINIMUM_PYTHON = (3, 12)


def _unsupported_python_message(version_info):
    if version_info[:2] >= MINIMUM_PYTHON:
        return None

    running_version = ".".join(str(part) for part in version_info[:3])
    return (
        "Pretty Lattice requires Python 3.12 or newer, but prl is running with "
        f"Python {running_version}. Reinstall it with a supported Python interpreter."
    )


def main():
    message = _unsupported_python_message(sys.version_info)
    if message is not None:
        print(message, file=sys.stderr)
        return 1

    from pretty_lattice.cli import app

    app()
    return 0
