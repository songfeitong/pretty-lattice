from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from importlib import resources
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from pretty_lattice.server.prewarm import start_structure_preview_prewarm
from pretty_lattice.server.routes import router


def create_app(
    static_root: Path | None = None,
    dev_static_fallback: bool = True,
    prewarm_structure_stack: bool = True,
) -> FastAPI:
    lifespan = _lifespan if prewarm_structure_stack else None
    app = FastAPI(title="Pretty Lattice", version="0.1.5", lifespan=lifespan)
    app.include_router(router, prefix="/api")
    _mount_static_web(app, static_root=static_root, dev_static_fallback=dev_static_fallback)
    return app


@asynccontextmanager
async def _lifespan(_app: FastAPI) -> AsyncIterator[None]:
    start_structure_preview_prewarm()
    yield


def _mount_static_web(
    app: FastAPI,
    static_root: Path | None = None,
    dev_static_fallback: bool = True,
) -> None:
    resolved_static_root = _resolve_static_root(
        static_root,
        dev_static_fallback=dev_static_fallback,
    )

    if resolved_static_root is None:
        _mount_missing_web_page(app)
        return

    assets_root = resolved_static_root / "assets"
    index_file = resolved_static_root / "index.html"

    if assets_root.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_root), name="assets")

    @app.get("/", include_in_schema=False)
    def index() -> FileResponse:
        return FileResponse(index_file)

    @app.get("/{path:path}", include_in_schema=False)
    def spa_fallback(path: str) -> FileResponse:
        static_file = _resolve_static_file(resolved_static_root, path)
        if static_file is not None:
            return FileResponse(static_file)
        if path == "favicon.ico":
            raise HTTPException(status_code=404)
        return FileResponse(index_file)


def _resolve_static_root(
    static_root: Path | None = None,
    dev_static_fallback: bool = True,
) -> Path | None:
    candidates: list[Path] = []
    if static_root is not None:
        candidates.append(static_root)

    candidates.append(Path(str(resources.files("pretty_lattice") / "web_static")))
    if dev_static_fallback:
        candidates.extend(_dev_static_candidates())

    for candidate in candidates:
        if (candidate / "index.html").is_file():
            return candidate

    return None


def _resolve_static_file(static_root: Path, path: str) -> Path | None:
    root = static_root.resolve()
    candidate = (root / path).resolve()
    if not candidate.is_relative_to(root):
        return None
    if candidate.is_file():
        return candidate
    return None


def _dev_static_candidates() -> list[Path]:
    current_file = Path(__file__).resolve()
    roots = [Path.cwd(), *Path.cwd().parents, current_file, *current_file.parents]
    candidates: list[Path] = []
    seen: set[Path] = set()

    for root in roots:
        candidate = root / "web" / "dist"
        if candidate not in seen:
            seen.add(candidate)
            candidates.append(candidate)

    return candidates


def _mount_missing_web_page(app: FastAPI) -> None:
    @app.get("/", include_in_schema=False)
    def missing_web() -> HTMLResponse:
        return HTMLResponse(
            """
            <!doctype html>
            <html lang="en">
              <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>Pretty Lattice</title>
                <style>
                  body {
                    margin: 0;
                    font-family:
                      ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
                      "Segoe UI", sans-serif;
                    color: #22272e;
                    background: #f7f8f4;
                  }
                  main {
                    display: grid;
                    min-height: 100vh;
                    place-items: center;
                    padding: 24px;
                  }
                  section {
                    width: min(620px, 100%);
                    border: 1px solid rgb(34 39 46 / 0.12);
                    border-radius: 8px;
                    background: white;
                    padding: 24px;
                    box-shadow: 0 18px 44px rgb(34 39 46 / 0.12);
                  }
                  h1 {
                    margin: 0 0 12px;
                    font-size: 1.4rem;
                  }
                  p {
                    margin: 0 0 14px;
                    color: #4f5b66;
                    line-height: 1.55;
                  }
                  code {
                    display: block;
                    margin-top: 10px;
                    padding: 10px 12px;
                    border-radius: 6px;
                    background: #f0f3f4;
                    color: #22272e;
                    white-space: pre-wrap;
                  }
                </style>
              </head>
              <body>
                <main>
                  <section>
                    <h1>Pretty Lattice frontend is not built</h1>
                    <p>The Python API is running, but no bundled web app was found.</p>
                    <p>For the built GUI, run:</p>
                    <code>cd web
bun run build
cd ..
uv run prl</code>
                    <p>For live frontend development, run the Python API and Vite separately:</p>
                    <code>uv run prl --no-open
cd web && bun run dev</code>
                  </section>
                </main>
              </body>
            </html>
            """,
            status_code=503,
        )

    @app.get("/{path:path}", include_in_schema=False)
    def missing_web_fallback(path: str) -> HTMLResponse:
        return missing_web()
