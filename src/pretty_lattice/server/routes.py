from __future__ import annotations

from urllib.parse import unquote

from fastapi import APIRouter, Header, HTTPException, Query, Request

from pretty_lattice.structures.preview_limits import (
    MAX_STRUCTURE_UPLOAD_BYTES,
    STRUCTURE_FILE_TOO_LARGE_MESSAGE,
)
from pretty_lattice.structures.schema import (
    CustomBondRecalculationError,
    InvalidBondCutoffOverridesError,
    UnsupportedBondAlgorithmError,
    normalize_bond_algorithm,
    parse_bond_cutoff_overrides,
)

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/structure-preview")
async def create_structure_preview(
    request: Request,
    bond_algorithm: str | None = Query(default=None, alias="bondAlgorithm"),
    include_connectivity: bool | None = Query(default=None, alias="includeConnectivity"),
    bond_cutoff_overrides: str | None = Header(
        default=None,
        alias="x-pretty-lattice-bond-cutoff-overrides",
    ),
) -> dict[str, object]:
    filename = _uploaded_filename(request)
    try:
        normalized_bond_algorithm = normalize_bond_algorithm(bond_algorithm)
    except UnsupportedBondAlgorithmError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc
    try:
        normalized_cutoff_overrides = parse_bond_cutoff_overrides(bond_cutoff_overrides)
    except InvalidBondCutoffOverridesError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc

    payload = await _uploaded_payload(request)
    StructureReadError, PreviewLimitExceeded, create_preview = _structure_preview_dependencies()
    try:
        return await create_preview(
            payload,
            filename=filename,
            bond_algorithm=normalized_bond_algorithm,
            bond_cutoff_overrides=normalized_cutoff_overrides,
            include_connectivity=include_connectivity,
        )
    except StructureReadError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc
    except InvalidBondCutoffOverridesError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc
    except CustomBondRecalculationError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "bond-recalculation-failed", "message": str(exc)},
        ) from exc
    except PreviewLimitExceeded as exc:
        raise HTTPException(
            status_code=413,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc


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
                detail={
                    "code": "upload-too-large",
                    "message": STRUCTURE_FILE_TOO_LARGE_MESSAGE,
                },
            )

    payload = bytearray()
    async for chunk in request.stream():
        if len(payload) + len(chunk) > MAX_STRUCTURE_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail={
                    "code": "upload-too-large",
                    "message": STRUCTURE_FILE_TOO_LARGE_MESSAGE,
                },
            )
        payload.extend(chunk)
    return bytes(payload)


def _uploaded_filename(request: Request) -> str:
    encoded_name = request.headers.get("x-pretty-lattice-filename")
    if encoded_name:
        return unquote(encoded_name)
    return "uploaded structure"


def _structure_preview_dependencies():
    from pretty_lattice.server.preview_service import create_structure_preview
    from pretty_lattice.structures.preview_limits import PreviewLimitExceeded
    from pretty_lattice.structures.readers import StructureReadError

    return StructureReadError, PreviewLimitExceeded, create_structure_preview
