from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor

import anyio
import pytest
from httpx import ASGITransport, AsyncClient
from pymatgen.core import Lattice, Structure

import pretty_lattice.server.preview_service as preview_service
import pretty_lattice.structures.connectivity as connectivity_module
from pretty_lattice.server.app import create_app
from pretty_lattice.server.preview_service import RecentStructureCache
from pretty_lattice.structures.preview_limits import (
    MAX_ESTIMATED_SCENE_BYTES,
    MAX_SCENE_ATOMS,
    MAX_SCENE_BONDS,
    MAX_SCENE_POLYHEDRA,
    MAX_STRUCTURE_ATOMS,
    MAX_STRUCTURE_UPLOAD_BYTES,
    PreviewLimitExceeded,
    enforce_scene_limits,
)
from pretty_lattice.structures.scene_builder import build_scene_spec


def _one_atom_structure() -> Structure:
    return Structure(Lattice.cubic(3), ["H"], [[0.25, 0.25, 0.25]])


def test_recent_structure_cache_hits_only_same_content_and_format() -> None:
    cache = RecentStructureCache()
    structures = [_one_atom_structure() for _ in range(4)]
    parse_index = 0

    def parse_next() -> Structure:
        nonlocal parse_index
        structure = structures[parse_index]
        parse_index += 1
        return structure

    first = cache.get_or_parse(payload=b"first", filename="sample.cif", parser=parse_next)
    repeated = cache.get_or_parse(payload=b"first", filename="renamed.CIF", parser=parse_next)
    different_format = cache.get_or_parse(
        payload=b"first", filename="sample.vasp", parser=parse_next
    )
    different_content = cache.get_or_parse(
        payload=b"second", filename="sample.vasp", parser=parse_next
    )
    evicted = cache.get_or_parse(payload=b"first", filename="sample.cif", parser=parse_next)

    assert repeated is first
    assert different_format is structures[1]
    assert different_content is structures[2]
    assert evicted is structures[3]
    assert parse_index == 4
    assert cache.stats().hits == 1
    assert cache.stats().parses == 4


def test_recent_structure_cache_coalesces_concurrent_parse() -> None:
    cache = RecentStructureCache()
    structure = _one_atom_structure()
    parser_started = threading.Event()
    release_parser = threading.Event()
    parse_count = 0

    def parser() -> Structure:
        nonlocal parse_count
        parse_count += 1
        parser_started.set()
        assert release_parser.wait(timeout=5)
        return structure

    def load() -> Structure:
        return cache.get_or_parse(payload=b"same", filename="same.cif", parser=parser)

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(load)
        assert parser_started.wait(timeout=5)
        second = executor.submit(load)
        release_parser.set()

    assert first.result() is structure
    assert second.result() is structure
    assert parse_count == 1
    assert cache.stats() == preview_service.StructureCacheStats(hits=1, misses=1, parses=1)


def test_recent_structure_cache_recovers_after_parse_error() -> None:
    cache = RecentStructureCache()

    def fail() -> Structure:
        raise ValueError("invalid structure")

    with pytest.raises(ValueError, match="invalid structure"):
        cache.get_or_parse(payload=b"bad", filename="bad.cif", parser=fail)

    structure = _one_atom_structure()
    recovered = cache.get_or_parse(
        payload=b"good", filename="good.cif", parser=lambda: structure
    )

    assert recovered is structure
    assert cache.stats() == preview_service.StructureCacheStats(hits=0, misses=2, parses=1)


def test_cached_structure_is_not_mutated_by_scene_build() -> None:
    cache = RecentStructureCache()
    structure = _one_atom_structure()
    cached = cache.get_or_parse(
        payload=b"structure", filename="sample.cif", parser=lambda: structure
    )
    before = cached.as_dict()

    build_scene_spec(cached, bond_algorithm="cut-off-dict")

    assert cached.as_dict() == before


@pytest.mark.anyio
async def test_preview_worker_limit_keeps_health_responsive(monkeypatch) -> None:
    first_started = threading.Event()
    release_workers = threading.Event()
    state_lock = threading.Lock()
    active_workers = 0
    maximum_active_workers = 0
    entered_workers = 0
    responses = []

    def blocking_preview(*_args: object, **_kwargs: object) -> dict[str, object]:
        nonlocal active_workers, maximum_active_workers, entered_workers
        with state_lock:
            active_workers += 1
            entered_workers += 1
            maximum_active_workers = max(maximum_active_workers, active_workers)
            first_started.set()
        assert release_workers.wait(timeout=5)
        with state_lock:
            active_workers -= 1
        return {"worker": "done"}

    monkeypatch.setattr(preview_service, "_build_structure_preview", blocking_preview)

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:

        async def request_preview() -> None:
            responses.append(
                await client.post(
                    "/api/structure-preview",
                    content=b"structure",
                    headers={"x-pretty-lattice-filename": "sample.cif"},
                )
            )

        async with anyio.create_task_group() as task_group:
            task_group.start_soon(request_preview)
            while not first_started.is_set():
                await anyio.sleep(0)
            task_group.start_soon(request_preview)
            await anyio.sleep(0.05)

            with state_lock:
                assert entered_workers == 1
            health_response = await client.get("/api/health")
            assert health_response.status_code == 200
            release_workers.set()

    assert [response.status_code for response in responses] == [200, 200]
    assert maximum_active_workers == 1


@pytest.mark.anyio
async def test_cancelled_preview_does_not_release_worker_slot_early(monkeypatch) -> None:
    first_started = threading.Event()
    release_first = threading.Event()
    state_lock = threading.Lock()
    entered_workers = 0
    active_workers = 0
    maximum_active_workers = 0

    def blocking_preview(*_args: object, **_kwargs: object) -> dict[str, object]:
        nonlocal entered_workers, active_workers, maximum_active_workers
        with state_lock:
            entered_workers += 1
            active_workers += 1
            maximum_active_workers = max(maximum_active_workers, active_workers)
            if entered_workers == 1:
                first_started.set()
        if entered_workers == 1:
            assert release_first.wait(timeout=5)
        with state_lock:
            active_workers -= 1
        return {"worker": "done"}

    monkeypatch.setattr(preview_service, "_build_structure_preview", blocking_preview)
    first_scope = anyio.CancelScope()

    async def first_preview() -> None:
        with first_scope:
            await preview_service.create_structure_preview(
                b"first", filename="first.cif", bond_algorithm=None
            )

    async def second_preview() -> None:
        await preview_service.create_structure_preview(
            b"second", filename="second.cif", bond_algorithm=None
        )

    async with anyio.create_task_group() as task_group:
        task_group.start_soon(first_preview)
        while not first_started.is_set():
            await anyio.sleep(0)
        first_scope.cancel()
        task_group.start_soon(second_preview)
        await anyio.sleep(0.05)
        with state_lock:
            assert entered_workers == 1
        release_first.set()

    assert maximum_active_workers == 1
    assert entered_workers == 2


@pytest.mark.anyio
async def test_streaming_upload_stops_at_limit_without_content_length() -> None:
    consumed_tail = False

    async def upload_chunks():
        nonlocal consumed_tail
        yield b"x" * MAX_STRUCTURE_UPLOAD_BYTES
        yield b"y"
        consumed_tail = True
        yield b"unbounded tail"

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/structure-preview",
            content=upload_chunks(),
            headers={"x-pretty-lattice-filename": "sample.cif"},
        )

    assert response.status_code == 413
    assert response.json()["detail"] == {
        "code": "upload-too-large",
        "message": "File is too large to preview.",
    }
    assert consumed_tail is False


@pytest.mark.anyio
async def test_structure_atom_limit_has_stable_api_error(monkeypatch) -> None:
    class OversizedStructure:
        def __len__(self) -> int:
            return MAX_STRUCTURE_ATOMS + 1

    preview_service.PREVIEW_STRUCTURE_CACHE.clear()
    monkeypatch.setattr(
        preview_service,
        "read_structure_bytes",
        lambda *_args, **_kwargs: OversizedStructure(),
    )

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/structure-preview",
            content=b"oversized structure",
            headers={"x-pretty-lattice-filename": "large.cif"},
        )

    assert response.status_code == 413
    assert response.json()["detail"] == {
        "code": "structure-too-many-atoms",
        "message": (
            f"Structure contains {MAX_STRUCTURE_ATOMS + 1:,} atoms; preview limit is "
            f"{MAX_STRUCTURE_ATOMS:,}."
        ),
    }


@pytest.mark.parametrize(
    ("counts", "expected_code"),
    [
        (
            {"atom_count": MAX_SCENE_ATOMS + 1, "bond_count": 0, "polyhedron_count": 0},
            "scene-too-many-atoms",
        ),
        (
            {"atom_count": 0, "bond_count": MAX_SCENE_BONDS + 1, "polyhedron_count": 0},
            "scene-too-many-bonds",
        ),
        (
            {"atom_count": 0, "bond_count": 0, "polyhedron_count": MAX_SCENE_POLYHEDRA + 1},
            "scene-too-many-polyhedra",
        ),
        (
            {
                "atom_count": MAX_SCENE_ATOMS,
                "bond_count": MAX_SCENE_BONDS,
                "polyhedron_count": MAX_SCENE_POLYHEDRA,
            },
            "scene-response-too-large",
        ),
    ],
)
def test_scene_limits_are_centralized_and_testable(
    counts: dict[str, int], expected_code: str
) -> None:
    with pytest.raises(PreviewLimitExceeded, match="preview") as exc_info:
        enforce_scene_limits(**counts)

    assert exc_info.value.code == expected_code
    assert MAX_ESTIMATED_SCENE_BYTES == 80 * 1024 * 1024


def test_scene_limit_error_is_not_swallowed_as_analysis_warning(monkeypatch) -> None:
    expected = PreviewLimitExceeded("scene-too-many-bonds", "preview limit exceeded")

    def fail_with_limit(**_kwargs: object) -> None:
        raise expected

    monkeypatch.setattr(connectivity_module, "build_connectivity", fail_with_limit)

    with pytest.raises(PreviewLimitExceeded) as exc_info:
        build_scene_spec(_one_atom_structure())

    assert exc_info.value is expected
