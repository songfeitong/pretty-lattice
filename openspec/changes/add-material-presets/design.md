## Context

The current preview already has a `Style` tab for visual settings and a `Display` tab for component visibility and opacity. Atoms, bonds, and polyhedra are rendered in the Three.js layer, while the Python backend keeps ownership of structure parsing and analysis. This change adds material presets as frontend-owned visual data, similar in spirit to colormaps and atom radii.

The user also wants the preset values to be easy to tune without touching TypeScript. That makes a JSON data file a better fit than hard-coded preset objects in application code.

## Goals / Non-Goals

**Goals:**

- Add a small material preset selector to the `Style` tab.
- Ship an initial set of four presets: `classic-matte`, `modern-matte`, `glossy`, and `flat-2d`.
- Keep preset values in a user-editable frontend JSON file.
- Apply one selected shading family consistently to atoms, bonds, and polyhedra.
- Keep component opacity sliders independent from preset selection in this slice.
- Keep the unit-cell frame out of material preset styling.
- Use the same resolved material preset for preview and export rendering.

**Non-Goals:**

- Build the full advanced Three.js settings surface.
- Add user-imported preset files or saved custom presets.
- Add glass, transparent, metallic, matcap, or toon presets in this first set.
- Move visual preset data into the backend scene contract.

## Decisions

### Store preset values in frontend JSON

Use one JSON file under `web/src/data/material-presets/` for bundled material preset values. A small TypeScript adapter should import the JSON, validate IDs, labels, material kind, and numeric ranges, then export typed preset data for the app.

This keeps tuning approachable: changing a roughness or light intensity value is a data edit, not a code edit. The adapter still protects the app from broken shapes such as misspelled material kinds or out-of-range numbers.

Alternative considered: define presets directly in TypeScript. That gives stronger compile-time checks, but makes simple tuning feel like source-code editing and is less friendly for advanced users who want to experiment.

### Treat a preset as one shading family

A material preset should resolve to one shared material family, then scene rendering should adapt that family to each object type:

- atoms use the family on sphere geometry;
- bonds use the same family on cylinder geometry, including existing bond color behavior;
- polyhedra use the same family on surface geometry while keeping their required surface/edge structure.

This keeps the visual language unified without pretending all three object types have identical rendering needs.

### Keep opacity independent for this slice

Preset JSON should not contain atom, bond, or polyhedron opacity values. Selecting a material preset should preserve the current component opacity values. The existing opacity sliders remain the place where users decide how much of each component is visible.

This is a current product decision, not a claim that opacity can never interact with material effects in a later advanced system. If a future preset family needs opacity-like behavior, it should be designed explicitly rather than smuggled into these first presets.

### Exclude the unit-cell frame

The unit-cell frame remains a line overlay controlled by component visibility and opacity, not by material preset selection. This avoids coupling a geometric reference line to shaded object materials.

### Keep advanced settings open

The material preset model should be data-shaped rather than branch-shaped. Code should avoid preset-ID-specific rendering branches such as special logic only for `glossy`; instead it should resolve generic fields like material kind, roughness, camera-light intensity, and camera-light offset. This keeps room for future advanced settings and more bundled presets.

## Risks / Trade-offs

- JSON can drift from TypeScript expectations -> Add lightweight validation and tests that produce clear failures when the JSON shape is invalid.
- Flat 2D rendering may look visually inconsistent with polyhedron edge overlays -> Keep polyhedron structure-specific edge handling in code while sharing the flat material family for surfaces.
- Glossy materials may need better lighting than matte materials -> Allow preset data to carry generic camera-relative lighting values, including more than one camera light, but keep them shared between preview and export.
- Users may expect presets to change opacity because some styles imply transparency -> Keep first-version UI language focused on material feel, and leave opacity sliders visibly separate.
