## 1. Preset Data And State

- [x] 1.1 Add bundled material preset JSON data under `web/src/data/material-presets/` with `classic-matte`, `modern-matte`, `glossy`, and `flat-2d`.
- [x] 1.2 Add a typed frontend adapter that validates preset IDs, labels, material kinds, and numeric ranges.
- [x] 1.3 Extend style state defaults and reset behavior to include the selected material preset without changing opacity, color scheme, radius, bond thickness, or bond color mode.

## 2. Scene Rendering

- [x] 2.1 Resolve the selected material preset into reusable Three.js material props for atoms, bonds, and polyhedra.
- [x] 2.2 Apply the resolved shading family to atom sphere materials and bond cylinder materials while preserving existing color behavior.
- [x] 2.3 Apply the resolved shading family to polyhedron surfaces while preserving polyhedron edge overlays, visibility filtering, and opacity handling.
- [x] 2.4 Keep the unit-cell frame on its existing line rendering path outside material preset resolution.
- [x] 2.5 Use the same selected material preset in preview and raster export rendering.
- [x] 2.6 Support preset-defined camera-relative light arrays for preview and raster export.

## 3. Controls

- [x] 3.1 Add a compact material preset control to the `Style` tab with the four bundled options.
- [x] 3.2 Ensure selecting a material preset updates shading without re-uploading the structure file or mutating component opacity values.
- [x] 3.3 Keep existing style controls for color scheme, atom radius, bond thickness, and bond color mode independent from material preset selection.

## 4. Verification

- [x] 4.1 Add tests for material preset JSON validation, including invalid kind, duplicate ID, missing label, and out-of-range numeric values.
- [x] 4.2 Add UI/state tests for selecting presets and preserving independent style and opacity state.
- [x] 4.3 Add scene-level tests that confirm atoms, bonds, and polyhedra resolve the selected material family while the unit-cell frame does not.
- [x] 4.4 Run targeted Bun tests and TypeScript checks for the changed frontend code.
- [x] 4.5 Validate the OpenSpec change before implementation is considered complete.
- [x] 4.6 Verify preset camera-light validation and scene material resolution after glossy lighting tuning.
