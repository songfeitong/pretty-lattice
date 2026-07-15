from __future__ import annotations

import importlib
import logging
import threading
from collections.abc import Iterable

STRUCTURE_PREWARM_MODULES = (
    "pretty_lattice.structures.readers",
    "pretty_lattice.structures.scene_builder",
)
logger = logging.getLogger(__name__)


def prewarm_structure_preview_dependencies(
    modules: Iterable[str] = STRUCTURE_PREWARM_MODULES,
) -> None:
    for module_name in modules:
        importlib.import_module(module_name)


def start_structure_preview_prewarm() -> threading.Thread:
    thread = threading.Thread(
        target=_prewarm_structure_preview_dependencies,
        name="pretty-lattice-structure-prewarm",
        daemon=True,
    )
    thread.start()
    return thread


def _prewarm_structure_preview_dependencies() -> None:
    try:
        prewarm_structure_preview_dependencies()
    except Exception:
        logger.exception(
            "Could not prepare the structure-processing backend. "
            "Structure loading may fail; restart with `prl --verbose` for request logs."
        )
