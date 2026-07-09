import subprocess
import sys
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

import pretty_lattice.server.app as app_module
import pretty_lattice.server.prewarm as prewarm_module
import pretty_lattice.structures.connectivity as connectivity_module
from pretty_lattice.server.app import create_app

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "structures"


@pytest.mark.anyio
async def test_health_endpoint() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.get("/api/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


def test_routes_import_defers_structure_preview_stack() -> None:
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import sys; "
                "import pretty_lattice.server.routes; "
                "print('pretty_lattice.structures.readers' in sys.modules); "
                "print('pretty_lattice.structures.scene_builder' in sys.modules)"
            ),
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    assert result.stdout.splitlines() == ["False", "False"]


def test_structure_prewarm_imports_preview_modules(monkeypatch) -> None:
    imported_modules: list[str] = []

    def import_module(module_name: str) -> object:
        imported_modules.append(module_name)
        return object()

    monkeypatch.setattr(prewarm_module.importlib, "import_module", import_module)

    prewarm_module.prewarm_structure_preview_dependencies()

    assert imported_modules == list(prewarm_module.STRUCTURE_PREWARM_MODULES)


@pytest.mark.anyio
async def test_app_lifespan_starts_structure_prewarm(monkeypatch, tmp_path) -> None:
    calls: list[str] = []

    def start_structure_preview_prewarm() -> None:
        calls.append("prewarm")

    monkeypatch.setattr(
        app_module,
        "start_structure_preview_prewarm",
        start_structure_preview_prewarm,
    )
    app = create_app(static_root=tmp_path, dev_static_fallback=False)

    async with app.router.lifespan_context(app):
        pass

    assert calls == ["prewarm"]


@pytest.mark.anyio
async def test_structure_preview_upload_endpoint_returns_scene() -> None:
    payload = (FIXTURE_DIR / "SrTiO3.cif").read_bytes()

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/structure-preview",
            content=payload,
            headers={"x-pretty-lattice-filename": "SrTiO3.cif"},
        )
        payload = response.json()

        assert response.status_code == 200
        assert payload["cell"]["vectors"] == [
            [3.91270131, 0.0, 0.0],
            [0.0, 3.91270131, 0.0],
            [0.0, 0.0, 3.91270131],
        ]
        canonical_atoms = [atom for atom in payload["atoms"] if not atom["isPeriodicImage"]]
        periodic_image_atoms = [atom for atom in payload["atoms"] if atom["isPeriodicImage"]]
        assert [atom["element"] for atom in canonical_atoms] == ["Sr", "Ti", "O", "O", "O"]
        assert canonical_atoms[0]["siteId"] == "Sr-0"
        assert canonical_atoms[0]["siteIndex"] == 0
        assert canonical_atoms[0]["fractionalPosition"] == [0.0, 0.0, 0.0]
        assert canonical_atoms[0]["imageOffset"] == [0, 0, 0]
        assert canonical_atoms[0]["imageReasons"] == []
        assert canonical_atoms[0]["visibilityDependencies"] == []
        assert len(periodic_image_atoms) > 10
        assert len([atom for atom in payload["atoms"] if "boundary" in atom["imageReasons"]]) == 10
        assert len([atom for atom in payload["atoms"] if "bonded" in atom["imageReasons"]]) > 0
        assert "Sr-0" in {atom["siteId"] for atom in periodic_image_atoms}
        assert payload["bonds"]
        assert payload["polyhedra"]
        assert "warnings" not in payload
        assert payload["summary"] == {
            "formula": "SrTiO3",
            "atomCount": 5,
            "cell": {
                "a": "3.91",
                "b": "3.91",
                "c": "3.91",
                "alpha": "90.0",
                "beta": "90.0",
                "gamma": "90.0",
            },
            "symmetry": {
                "available": True,
                "spaceGroup": "Pm-3m",
                "spaceGroupNumber": 221,
                "pointGroup": "m-3m",
                "pointGroupSchoenflies": "Oh",
                "crystalSystem": "cubic",
                "latticeSystem": "cubic",
            },
        }
        assert "view" not in payload


@pytest.mark.anyio
async def test_structure_preview_upload_endpoint_gzips_large_json_response() -> None:
    payload = (FIXTURE_DIR / "SrTiO3.cif").read_bytes()

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/structure-preview",
            content=payload,
            headers={
                "accept-encoding": "gzip",
                "x-pretty-lattice-filename": "SrTiO3.cif",
            },
        )

    assert response.status_code == 200
    assert response.headers["content-encoding"] == "gzip"
    assert "Accept-Encoding" in response.headers["vary"]
    assert response.json()["summary"]["formula"] == "SrTiO3"


@pytest.mark.anyio
async def test_structure_preview_upload_endpoint_accepts_supported_bond_algorithm() -> None:
    payload = (FIXTURE_DIR / "SrTiO3.cif").read_bytes()

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/structure-preview?bondAlgorithm=minimum-distance",
            content=payload,
            headers={"x-pretty-lattice-filename": "SrTiO3.cif"},
        )

    assert response.status_code == 200
    assert response.json()["bonds"]
    assert "polyhedra" in response.json()


@pytest.mark.anyio
async def test_structure_preview_upload_endpoint_accepts_cutoff_dict_bond_algorithm() -> None:
    payload = (FIXTURE_DIR / "SrTiO3.cif").read_bytes()

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/structure-preview?bondAlgorithm=cut-off-dict",
            content=payload,
            headers={"x-pretty-lattice-filename": "SrTiO3.cif"},
        )

    assert response.status_code == 200
    assert response.json()["bonds"]
    assert "polyhedra" in response.json()


@pytest.mark.anyio
async def test_structure_preview_upload_endpoint_rejects_unsupported_bond_algorithm() -> None:
    payload = (FIXTURE_DIR / "SrTiO3.cif").read_bytes()

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/structure-preview?bondAlgorithm=custom-cutoff",
            content=payload,
            headers={"x-pretty-lattice-filename": "SrTiO3.cif"},
        )

    assert response.status_code == 400
    assert "Unsupported bond algorithm" in response.json()["detail"]["message"]


@pytest.mark.anyio
async def test_structure_preview_upload_endpoint_returns_bond_warning(monkeypatch) -> None:
    payload = (FIXTURE_DIR / "SrTiO3.cif").read_bytes()

    def fail_bonds(**_kwargs: object) -> list[dict[str, object]]:
        raise RuntimeError("neighbor graph unavailable")

    monkeypatch.setattr(connectivity_module, "build_bonds", fail_bonds)

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/structure-preview",
            content=payload,
            headers={"x-pretty-lattice-filename": "SrTiO3.cif"},
        )

    payload = response.json()
    assert response.status_code == 200
    assert payload["atoms"]
    assert payload["bonds"] == []
    assert "polyhedra" in payload
    assert payload["warnings"] == [
        {
            "code": "bond-analysis-failed",
            "message": "Bond analysis with CrystalNN failed: neighbor graph unavailable",
        }
    ]


@pytest.mark.anyio
async def test_structure_preview_upload_endpoint_requires_pymatgen_recognizable_filename() -> None:
    payload = (FIXTURE_DIR / "SrTiO3.cif").read_bytes()

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post("/api/structure-preview", content=payload)
        payload = response.json()

        assert response.status_code == 400
        assert "Could not parse uploaded structure" in payload["detail"]["message"]


@pytest.mark.anyio
async def test_structure_preview_upload_endpoint_returns_parse_error() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/structure-preview",
            content=b"not a structure",
            headers={"x-pretty-lattice-filename": "bad.cif"},
        )

        assert response.status_code == 400
        assert "Could not parse bad.cif" in response.json()["detail"]["message"]


@pytest.mark.anyio
async def test_structure_preview_upload_endpoint_rejects_oversized_payload() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/structure-preview",
            content=b"x" * (1 * 1024 * 1024 + 1),
            headers={"x-pretty-lattice-filename": "movie.mp4"},
        )

        assert response.status_code == 413
        assert response.json()["detail"]["message"] == "File is too large to preview."


@pytest.mark.anyio
async def test_static_index_is_served_from_explicit_static_root(tmp_path) -> None:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><title>Pretty Lattice</title>")
    (tmp_path / "favicon.svg").write_text("<svg><title>Pretty Lattice logo</title></svg>")

    async with AsyncClient(
        transport=ASGITransport(app=create_app(static_root=tmp_path, dev_static_fallback=False)),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/")
        fallback_response = await client.get("/workspace")
        favicon_response = await client.get("/favicon.svg")
        missing_ico_response = await client.get("/favicon.ico")

        assert response.status_code == 200
        assert "Pretty Lattice" in response.text
        assert fallback_response.status_code == 200
        assert "Pretty Lattice" in fallback_response.text
        assert favicon_response.status_code == 200
        assert "Pretty Lattice logo" in favicon_response.text
        assert "image/svg+xml" in favicon_response.headers["content-type"]
        assert missing_ico_response.status_code == 404


@pytest.mark.anyio
async def test_missing_static_root_returns_actionable_page(tmp_path) -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app(static_root=tmp_path, dev_static_fallback=False)),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/")

        assert response.status_code == 503
        assert "frontend is not built" in response.text
        assert "bun run build" in response.text
