from __future__ import annotations

import argparse
import cProfile
import gc
import hashlib
import importlib.metadata
import io
import json
import platform
import pstats
import re
import statistics
import sys
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter
from typing import Any

from pymatgen.core import Structure
from pymatgen.core.local_env import CrystalNN, MinimumDistanceNN

import pretty_lattice.structures.connectivity as connectivity_module
from pretty_lattice.structures.scene_builder import build_scene_spec
from pretty_lattice.structures.warning_policy import suppress_third_party_structure_warnings

PROJECT_ROOT = Path(__file__).resolve().parents[1]
FIXTURE_DIR = PROJECT_ROOT / "tests" / "fixtures" / "structures"
OUTPUT_DIR = PROJECT_ROOT / "tmp" / "backend-benchmarks"
FIXTURE_NAMES = (
    "Al2O3.cif",
    "Ba2Ca2Cu3HgO8.cif",
    "Hg3Cl4O.cif",
    "LiFePO4.cif",
    "MoS2.cif",
    "NaCl.cif",
    "Si.cif",
    "Sm(Mo3S4)2.cif",
    "SrTiO3.cif",
    "TiO2.cif",
)
type Scene = dict[str, Any]


def _load_structure(filename: str, supercell: tuple[int, int, int] = (1, 1, 1)) -> Structure:
    with suppress_third_party_structure_warnings():
        structure = Structure.from_file(FIXTURE_DIR / filename)
    if supercell != (1, 1, 1):
        structure.make_supercell(supercell)
    return structure


def _measure[T](function: Callable[[], T], *, samples: int) -> tuple[T, list[float]]:
    durations: list[float] = []
    result: T | None = None
    for _ in range(samples):
        gc.collect()
        started = perf_counter()
        result = function()
        durations.append(perf_counter() - started)
    assert result is not None
    return result, durations


def _scene_digest(scene: Scene) -> str:
    payload = json.dumps(
        scene,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    return hashlib.sha256(payload).hexdigest()


def _validate_scene(scene: Scene, *, require_polyhedra: bool = False) -> None:
    if scene.get("warnings"):
        raise RuntimeError(f"Benchmark scene used an analysis fallback: {scene['warnings']}")
    if not scene["bonds"]:
        raise RuntimeError("Benchmark scene unexpectedly contains no bonds.")
    if require_polyhedra and not scene["polyhedra"]:
        raise RuntimeError("Benchmark scene unexpectedly contains no polyhedra.")


def _scene_contract(scene: Scene) -> dict[str, Any]:
    return {
        "sha256": _scene_digest(scene),
        "atoms": len(scene["atoms"]),
        "bonds": len(scene["bonds"]),
        "polyhedra": len(scene["polyhedra"]),
        "warnings": scene.get("warnings", []),
    }


def _fixture_contracts() -> dict[str, dict[str, Any]]:
    contracts: dict[str, dict[str, Any]] = {}
    for filename in FIXTURE_NAMES:
        scene = build_scene_spec(_load_structure(filename))
        _validate_scene(scene)
        contracts[f"fixture:{filename}"] = _scene_contract(scene)
    return contracts


def _benchmark_cutoff_tables(*, full: bool) -> dict[str, dict[str, Any]]:
    cases = [
        ("SrTiO3-135", (3, 3, 3), 5),
        ("SrTiO3-1080", (6, 6, 6), 3),
    ]
    if full:
        cases.append(("SrTiO3-5000", (10, 10, 10), 3))

    results: dict[str, dict[str, Any]] = {}
    for name, supercell, full_samples in cases:
        structure = _load_structure("SrTiO3.cif", supercell)
        samples = full_samples if full else min(full_samples, 2)
        table, durations = _measure(
            lambda structure=structure: connectivity_module._vesta_neighbor_records_by_site(
                structure
            ),
            samples=samples,
        )
        results[name] = {
            "input_atoms": len(structure),
            "samples": samples,
            "seconds_all": durations,
            "seconds_median": statistics.median(durations),
            "accepted_neighbors": sum(len(neighbors) for neighbors in table),
        }
    return results


def _benchmark_scene_case(
    *,
    filename: str,
    name: str,
    samples: int,
    supercell: tuple[int, int, int],
) -> tuple[dict[str, Any], dict[str, Any]]:
    structure = _load_structure(filename, supercell)
    scene, durations = _measure(
        lambda: build_scene_spec(structure, bond_algorithm="cut-off-dict"),
        samples=samples,
    )
    _validate_scene(scene, require_polyhedra=True)
    result = {
        "input_atoms": len(structure),
        "algorithm": "cut-off-dict",
        "samples": samples,
        "seconds_all": durations,
        "seconds_median": statistics.median(durations),
        **_scene_contract(scene),
    }
    return result, {f"large:{name}": _scene_contract(scene)}


def _benchmark_large_scenes(
    *, full: bool
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    cases = [
        ("SrTiO3-1080", "SrTiO3.cif", (6, 6, 6), 3 if full else 1),
    ]
    if full:
        cases.extend(
            [
                ("SrTiO3-5000", "SrTiO3.cif", (10, 10, 10), 3),
                ("LiFePO4-1792", "LiFePO4.cif", (4, 4, 4), 3),
            ]
        )

    results: dict[str, dict[str, Any]] = {}
    contracts: dict[str, dict[str, Any]] = {}
    for name, filename, supercell, samples in cases:
        result, case_contract = _benchmark_scene_case(
            filename=filename,
            name=name,
            samples=samples,
            supercell=supercell,
        )
        results[name] = result
        contracts.update(case_contract)
    return results, contracts


def _benchmark_neighbor_reuse_case(
    *,
    algorithm: str,
    analyzer_type: type[CrystalNN] | type[MinimumDistanceNN],
    samples: int,
    supercell: tuple[int, int, int],
) -> dict[str, Any]:
    structure = _load_structure("SrTiO3.cif", supercell)
    original_get_nn_info = analyzer_type.get_nn_info
    call_count = 0

    def counted_get_nn_info(self: object, *args: object, **kwargs: object) -> object:
        nonlocal call_count
        call_count += 1
        return original_get_nn_info(self, *args, **kwargs)

    analyzer_type.get_nn_info = counted_get_nn_info  # type: ignore[method-assign]
    try:
        scene, durations = _measure(
            lambda: build_scene_spec(structure, bond_algorithm=algorithm),
            samples=samples,
        )
    finally:
        analyzer_type.get_nn_info = original_get_nn_info  # type: ignore[method-assign]

    _validate_scene(scene, require_polyhedra=True)
    return {
        "input_atoms": len(structure),
        "algorithm": algorithm,
        "samples": samples,
        "seconds_all": durations,
        "seconds_median": statistics.median(durations),
        "get_nn_info_calls_total": call_count,
        "get_nn_info_calls_per_build": call_count / samples,
        **_scene_contract(scene),
    }


def _benchmark_neighbor_reuse(*, full: bool) -> dict[str, dict[str, Any]]:
    cases = [
        ("CrystalNN-5", "crystal-nn", CrystalNN, (1, 1, 1), 5 if full else 2),
        (
            "MinimumDistanceNN-5",
            "minimum-distance",
            MinimumDistanceNN,
            (1, 1, 1),
            5 if full else 2,
        ),
    ]
    if full:
        cases.extend(
            [
                ("CrystalNN-625", "crystal-nn", CrystalNN, (5, 5, 5), 3),
                (
                    "MinimumDistanceNN-625",
                    "minimum-distance",
                    MinimumDistanceNN,
                    (5, 5, 5),
                    3,
                ),
            ]
        )

    return {
        name: _benchmark_neighbor_reuse_case(
            algorithm=algorithm,
            analyzer_type=analyzer_type,
            samples=samples,
            supercell=supercell,
        )
        for name, algorithm, analyzer_type, supercell, samples in cases
    }


def _compare_contracts(
    current: dict[str, dict[str, Any]],
    current_neighbor_reuse: dict[str, dict[str, Any]],
    baseline_path: Path,
) -> dict[str, Any]:
    baseline = json.loads(baseline_path.read_text())
    contract_fields = ("sha256", "atoms", "bonds", "polyhedra", "warnings")
    baseline_contracts = {
        **baseline["scene_contracts"],
        **{
            f"reuse:{name}": {field: result[field] for field in contract_fields}
            for name, result in baseline["neighbor_reuse"].items()
        },
    }
    current_contracts = {
        **current,
        **{
            f"reuse:{name}": {field: result[field] for field in contract_fields}
            for name, result in current_neighbor_reuse.items()
        },
    }
    mismatches = {
        name: {
            "baseline": baseline_contracts.get(name),
            "current": current_contracts.get(name),
        }
        for name in sorted(set(baseline_contracts) | set(current_contracts))
        if baseline_contracts.get(name) != current_contracts.get(name)
    }
    if mismatches:
        raise AssertionError(
            "SceneSpec contract mismatch:\n"
            + json.dumps(mismatches, ensure_ascii=False, indent=2, sort_keys=True)
        )
    return {"baseline": str(baseline_path), "matched": len(current_contracts)}


def _write_profile(*, full: bool, label: str) -> dict[str, str]:
    supercell = (10, 10, 10) if full else (6, 6, 6)
    structure = _load_structure("SrTiO3.cif", supercell)
    profile = cProfile.Profile()
    scene = profile.runcall(
        build_scene_spec,
        structure,
        bond_algorithm="cut-off-dict",
    )
    _validate_scene(scene, require_polyhedra=True)

    profile_path = OUTPUT_DIR / f"{label}.prof"
    report_path = OUTPUT_DIR / f"{label}-profile.txt"
    profile.dump_stats(profile_path)
    stream = io.StringIO()
    pstats.Stats(profile, stream=stream).strip_dirs().sort_stats("cumulative").print_stats(60)
    report_path.write_text(stream.getvalue())
    return {"binary": str(profile_path), "text": str(report_path)}


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Benchmark the backend neighbor and SceneSpec paths."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--quick", action="store_true", help="Run the short benchmark set.")
    mode.add_argument("--full", action="store_true", help="Run all large benchmark cases.")
    parser.add_argument(
        "--label",
        help="Output filename stem; defaults to the mode and current UTC time.",
    )
    parser.add_argument(
        "--compare",
        type=Path,
        help="Require all SceneSpec contracts to match a prior JSON result.",
    )
    parser.add_argument(
        "--profile",
        action="store_true",
        help="Also write a cProfile result for the largest selected SrTiO3 case.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    full = bool(args.full)
    default_label = f"{'full' if full else 'quick'}-{datetime.now(UTC):%Y%m%dT%H%M%SZ}"
    label = args.label or default_label
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", label):
        raise ValueError(
            "--label may contain only letters, numbers, dots, underscores, and hyphens."
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    fixture_contracts = _fixture_contracts()
    large_scenes, large_contracts = _benchmark_large_scenes(full=full)
    neighbor_reuse = _benchmark_neighbor_reuse(full=full)
    scene_contracts = {**fixture_contracts, **large_contracts}
    comparison = (
        _compare_contracts(scene_contracts, neighbor_reuse, args.compare)
        if args.compare
        else None
    )

    result: dict[str, Any] = {
        "created_at": datetime.now(UTC).isoformat(),
        "mode": "full" if full else "quick",
        "environment": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "numpy": importlib.metadata.version("numpy"),
            "pymatgen-core": importlib.metadata.version("pymatgen-core"),
            "scipy": importlib.metadata.version("scipy"),
        },
        "cutoff_neighbor_tables": _benchmark_cutoff_tables(full=full),
        "large_scenes": large_scenes,
        "neighbor_reuse": neighbor_reuse,
        "scene_contracts": scene_contracts,
        "comparison": comparison,
    }
    if args.profile:
        result["profile"] = _write_profile(full=full, label=label)

    output_path = OUTPUT_DIR / f"{label}.json"
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    print(output_path)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"benchmark failed: {exc}", file=sys.stderr)
        raise
