from __future__ import annotations

import time
from pathlib import Path
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Query, Request

from pretty_lattice.structures.readers import (
    StructureReadError,
    read_structure,
    read_structure_bytes,
)
from pretty_lattice.structures.scene_builder import build_scene_response
from pretty_lattice.structures.schema import (
    UnsupportedBondAlgorithmError,
    normalize_bond_algorithm,
)

router = APIRouter()
MAX_STRUCTURE_UPLOAD_BYTES = 1 * 1024 * 1024
STRUCTURE_FILE_TOO_LARGE_MESSAGE = "File is too large to preview."


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/session-heartbeat")
def session_heartbeat(request: Request) -> dict[str, str]:
    request.app.state.session_heartbeat_seen = True
    request.app.state.session_last_heartbeat = time.monotonic()
    return {"status": "ok"}


@router.post("/structure-preview")
async def create_structure_preview(
    request: Request,
    bond_algorithm: str | None = Query(default=None, alias="bondAlgorithm"),
) -> dict[str, object]:
    filename = _uploaded_filename(request)
    try:
        normalized_bond_algorithm = normalize_bond_algorithm(bond_algorithm)
    except UnsupportedBondAlgorithmError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc

    try:
        payload = await _uploaded_payload(request)
        structure = read_structure_bytes(payload, filename=filename)
        return build_scene_response(structure, bond_algorithm=normalized_bond_algorithm)
    except StructureReadError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc


@router.get("/startup-structure-preview")
def get_startup_structure_preview(
    request: Request,
    bond_algorithm: str | None = Query(default=None, alias="bondAlgorithm"),
) -> dict[str, object]:
    structure_path = _startup_structure_path(request)
    if structure_path is None:
        raise HTTPException(status_code=404, detail={"message": "No startup structure file."})
    if not structure_path.is_file():
        raise HTTPException(
            status_code=404,
            detail={"message": f"Startup structure file not found: {structure_path}"},
        )

    try:
        normalized_bond_algorithm = normalize_bond_algorithm(bond_algorithm)
    except UnsupportedBondAlgorithmError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc

    try:
        structure = read_structure(structure_path)
        return {
            "fileName": structure_path.name,
            "scene": build_scene_response(structure, bond_algorithm=normalized_bond_algorithm),
        }
    except StructureReadError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc


async def _uploaded_payload(request: Request) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            upload_size = int(content_length)
        except ValueError:
            upload_size = None
        if upload_size is not None and upload_size > MAX_STRUCTURE_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail={"message": STRUCTURE_FILE_TOO_LARGE_MESSAGE},
            )

    payload = await request.body()
    if len(payload) > MAX_STRUCTURE_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail={"message": STRUCTURE_FILE_TOO_LARGE_MESSAGE})
    return payload


def _uploaded_filename(request: Request) -> str:
    encoded_name = request.headers.get("x-pretty-lattice-filename")
    if encoded_name:
        return unquote(encoded_name)
    return "uploaded structure"


def _startup_structure_path(request: Request) -> Path | None:
    structure_path = getattr(request.app.state, "startup_structure_path", None)
    if structure_path is None:
        return None
    return Path(structure_path)
