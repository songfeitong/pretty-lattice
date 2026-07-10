from __future__ import annotations

import json
from pathlib import Path

from pretty_lattice.structures.readers import read_structure
from pretty_lattice.structures.scene import build_scene_response

PROJECT_ROOT = Path(__file__).resolve().parents[1]
STRUCTURE_NAMES = ("Al2O3", "LiFePO4")


def main() -> None:
    for structure_name in STRUCTURE_NAMES:
        input_path = PROJECT_ROOT / "tests" / "fixtures" / "structures" / f"{structure_name}.cif"
        output_path = PROJECT_ROOT / "web" / "public" / "examples" / f"{structure_name}.scene.json"
        scene = build_scene_response(read_structure(input_path))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        indent = 2 if structure_name == "LiFePO4" else None
        output_path.write_text(
            json.dumps(
                scene,
                ensure_ascii=True,
                indent=indent,
                separators=(",", ":") if indent is None else None,
            )
            + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
