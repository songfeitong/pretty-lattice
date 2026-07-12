from __future__ import annotations

import hashlib
from collections.abc import Callable
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from threading import Condition

from anyio import CapacityLimiter, to_thread
from pymatgen.core import Structure

from pretty_lattice.structures.preview_limits import enforce_structure_atom_limit
from pretty_lattice.structures.readers import read_structure_bytes
from pretty_lattice.structures.scene_builder import build_scene_response
from pretty_lattice.structures.schema import BondCutoffRange

PREVIEW_TASK_CONCURRENCY = 1
_PREVIEW_TASK_LIMITER = CapacityLimiter(PREVIEW_TASK_CONCURRENCY)


@dataclass(frozen=True)
class StructureCacheKey:
    content_sha256: str
    format_hint: str


@dataclass(frozen=True)
class StructureCacheStats:
    hits: int
    misses: int
    parses: int


class RecentStructureCache:
    """Thread-safe cache for exactly one parsed, read-only Structure."""

    def __init__(self) -> None:
        self._condition = Condition()
        self._key: StructureCacheKey | None = None
        self._structure: Structure | None = None
        self._loading_key: StructureCacheKey | None = None
        self._hits = 0
        self._misses = 0
        self._parses = 0

    def get_or_parse(
        self,
        *,
        payload: bytes,
        filename: str,
        parser: Callable[[], Structure],
    ) -> Structure:
        key = _structure_cache_key(payload, filename)
        with self._condition:
            while True:
                if key == self._key and self._structure is not None:
                    self._hits += 1
                    return self._structure
                if self._loading_key is None:
                    self._key = None
                    self._structure = None
                    self._loading_key = key
                    self._misses += 1
                    break
                self._condition.wait()

        try:
            structure = parser()
        except BaseException:
            with self._condition:
                self._loading_key = None
                self._condition.notify_all()
            raise

        with self._condition:
            self._key = key
            self._structure = structure
            self._loading_key = None
            self._parses += 1
            self._condition.notify_all()
            return structure

    def clear(self) -> None:
        with self._condition:
            while self._loading_key is not None:
                self._condition.wait()
            self._key = None
            self._structure = None
            self._hits = 0
            self._misses = 0
            self._parses = 0

    def stats(self) -> StructureCacheStats:
        with self._condition:
            return StructureCacheStats(
                hits=self._hits,
                misses=self._misses,
                parses=self._parses,
            )


PREVIEW_STRUCTURE_CACHE = RecentStructureCache()


async def create_structure_preview(
    payload: bytes,
    *,
    filename: str,
    bond_algorithm: str | None,
    bond_cutoff_overrides: dict[str, BondCutoffRange] | None = None,
    include_connectivity: bool | None = None,
) -> dict[str, object]:
    task = partial(
        _build_structure_preview,
        payload,
        filename=filename,
        bond_algorithm=bond_algorithm,
        bond_cutoff_overrides=bond_cutoff_overrides,
        include_connectivity=include_connectivity,
    )
    return await to_thread.run_sync(
        task,
        abandon_on_cancel=False,
        limiter=_PREVIEW_TASK_LIMITER,
    )


def _build_structure_preview(
    payload: bytes,
    *,
    filename: str,
    bond_algorithm: str | None,
    bond_cutoff_overrides: dict[str, BondCutoffRange] | None = None,
    include_connectivity: bool | None = None,
) -> dict[str, object]:
    structure = PREVIEW_STRUCTURE_CACHE.get_or_parse(
        payload=payload,
        filename=filename,
        parser=lambda: _read_limited_structure(payload, filename),
    )
    # Scene construction normalizes into a copy before any analysis touches the cached object.
    return build_scene_response(
        structure,
        bond_algorithm=bond_algorithm,
        bond_cutoff_overrides=bond_cutoff_overrides,
        include_connectivity=include_connectivity,
    )


def _read_limited_structure(payload: bytes, filename: str) -> Structure:
    structure = read_structure_bytes(payload, filename=filename)
    enforce_structure_atom_limit(len(structure))
    return structure


def _structure_cache_key(payload: bytes, filename: str) -> StructureCacheKey:
    name = Path(filename).name
    suffixes = "".join(Path(name).suffixes).casefold()
    format_hint = suffixes or name.casefold()
    return StructureCacheKey(
        content_sha256=hashlib.sha256(payload).hexdigest(),
        format_hint=format_hint,
    )
