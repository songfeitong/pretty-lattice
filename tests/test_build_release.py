from __future__ import annotations

import importlib.util
from pathlib import Path


def _load_build_release_module():
    script_path = Path(__file__).parents[1] / "scripts" / "build_release.py"
    spec = importlib.util.spec_from_file_location("build_release", script_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_publish_release_artifacts_preserves_unrelated_destination_files(tmp_path: Path) -> None:
    build_release = _load_build_release_module()
    staging_dir = tmp_path / "staging"
    dist_dir = tmp_path / "shared-output"
    staging_dir.mkdir()
    dist_dir.mkdir()
    wheel = staging_dir / "pretty_lattice-0.2.0-py3-none-any.whl"
    source_distribution = staging_dir / "pretty_lattice-0.2.0.tar.gz"
    sentinel = dist_dir / "do-not-delete.txt"
    wheel.write_bytes(b"wheel")
    source_distribution.write_bytes(b"sdist")
    sentinel.write_text("keep me")

    build_release.publish_release_artifacts(staging_dir, dist_dir)

    assert (dist_dir / wheel.name).read_bytes() == b"wheel"
    assert (dist_dir / source_distribution.name).read_bytes() == b"sdist"
    assert sentinel.read_text() == "keep me"
