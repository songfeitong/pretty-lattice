## Why

Pretty Lattice needs a small set of named material styles so users can switch the visual feel of atoms, bonds, and polyhedra without hand-tuning several Three.js parameters. The first slice should provide useful presets while keeping the underlying preset data easy to edit and leaving room for future advanced render settings.

## What Changes

- Add a `Material` preset control to the existing `Style` tab.
- Provide four bundled material presets for the current preview/export workflow: `classic-matte`, `modern-matte`, `glossy`, and `flat-2d`.
- Store bundled preset values in frontend JSON data, with TypeScript used only to validate and map the data into Three.js rendering props.
- Apply the selected material preset as one unified shading family across atoms, bonds, and polyhedra.
- Keep component opacity controls independent from material presets for this slice, so changing a preset does not change atom, bond, or polyhedron opacity values.
- Keep the unit-cell frame outside the material preset system.
- Preserve independent visual controls such as color scheme, atom radius, bond thickness, bond color mode, component visibility, and export mesh quality.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `structure-preview`: add user-selectable material presets for the Three.js preview and export render path.

## Impact

- Frontend style state, Style tab controls, and reset behavior.
- Three.js scene material construction for atoms, bonds, and polyhedra.
- Preview and export rendering paths, which should resolve material presets consistently.
- Frontend JSON data under `web/src/data/material-presets/` plus a small typed adapter/validator.
- Tests covering preset data validity, Style tab behavior, and preview/export material resolution.
