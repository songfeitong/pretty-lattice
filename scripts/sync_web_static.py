from __future__ import annotations

import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEB_DIST = PROJECT_ROOT / "web" / "dist"
STATIC_ROOT = PROJECT_ROOT / "src" / "pretty_lattice" / "web_static"


def main() -> None:
    index_file = WEB_DIST / "index.html"
    assets_dir = WEB_DIST / "assets"
    if not index_file.is_file() or not assets_dir.is_dir():
        raise SystemExit(
            "Frontend build did not produce web/dist/index.html and web/dist/assets/. "
            "Run `cd web && bun run build` first."
        )

    if STATIC_ROOT.exists():
        shutil.rmtree(STATIC_ROOT)
    STATIC_ROOT.mkdir(parents=True)

    for item in WEB_DIST.iterdir():
        target = STATIC_ROOT / item.name
        if item.is_dir():
            shutil.copytree(item, target)
        else:
            shutil.copy2(item, target)

    print(f"Copied {WEB_DIST.relative_to(PROJECT_ROOT)} to {STATIC_ROOT.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
