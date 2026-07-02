# Development Setup

## Install From Source

Build the frontend bundle before installing the Python package:

```bash
cd web
bun install
bun run build

cd ..
python scripts/sync_web_static.py
python -m pip install .
```

After installation, try:

```bash
prl gui
prl path/to/structure.vasp
prl first.vasp second.cif
```

## Python

Run the local GUI server:

```bash
uv run prl gui
```

Useful development options:

```bash
uv run prl gui --no-open
uv run prl gui --reload
uv run prl gui -p 0
```

Run checks:

```bash
uv run ruff check .
uv run pytest
```

## Web

Install frontend dependencies:

```bash
cd web
bun install
```

Run the Vite development server:

```bash
bun run dev
```

Run frontend checks:

```bash
bun run test
bun run typecheck
bun run build
```

## Current Development Flow

For now, run the Python server and Vite server separately:

```bash
uv run prl gui --no-open
cd web && bun run dev
```

Open the Vite URL in the browser. The production packaging path will later build `web/dist`
and copy it into `src/pretty_lattice/web_static/` so normal users only need the Python package.
