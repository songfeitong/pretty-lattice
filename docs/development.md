# Development Setup

## Requirements

- Python 3.12
- `uv`
- Bun
- a modern browser with WebGL

## Python

Install dependencies:

```bash
uv sync
```

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

By default, Vite proxies `/api` to:

```text
http://127.0.0.1:8765
```

If the Python server is running elsewhere:

```bash
PRETTY_LATTICE_API_URL=http://127.0.0.1:9000 bun run dev
```

Run frontend checks:

```bash
bun run test
bun run typecheck
bun run build
```

Add shadcn/ui components as needed:

```bash
bunx shadcn@latest add button
```

Keep shadcn/ui focused on application controls. Figure rendering style, materials, and camera
behavior should stay in the Three.js scene layer.

## Current Development Flow

For now, run the Python server and Vite server separately:

```bash
uv run prl gui --no-open
cd web && bun run dev
```

Open the Vite URL in the browser. The production packaging path will later build `web/dist`
and copy it into `src/pretty_lattice/web_static/` so normal users only need the Python package.
