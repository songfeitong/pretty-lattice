## ADDED Requirements

### Requirement: Style tab exposes material presets

The frontend SHALL expose a material preset control in the `Style` tab after a structure scene has loaded. The bundled preset list for this change SHALL include `classic-matte`, `modern-matte`, `glossy`, and `flat-2d`. The preset data model SHALL allow additional bundled presets to be added without adding rendering branches tied to specific preset IDs.

#### Scenario: Show bundled material presets

- **WHEN** a structure scene has loaded successfully and the user opens `Style`
- **THEN** the tab shows a material preset control
- **AND** the available bundled choices include `Classic Matte`, `Modern Matte`, `Glossy`, and `Flat 2D`

#### Scenario: Select material preset

- **WHEN** the user selects a material preset
- **THEN** the preview updates atom, bond, and polyhedron shading from the selected preset
- **AND** the loaded scene data remains unchanged
- **AND** the frontend does not re-upload the structure file

### Requirement: Material presets use frontend-owned JSON data

The frontend SHALL load bundled material preset values from frontend JSON data under `web/src/data/material-presets/`. TypeScript code SHALL validate and adapt that data before rendering, but preset numeric values such as roughness, metalness, camera-light intensity, and camera-light offset SHALL be editable without changing TypeScript source code.

#### Scenario: Load valid preset data

- **WHEN** the frontend starts with valid bundled material preset JSON
- **THEN** the app exposes the validated presets to the Style tab and scene renderer

#### Scenario: Resolve preset-defined camera lights

- **WHEN** bundled material preset JSON defines multiple camera-relative lights for a preset
- **THEN** preview rendering uses those camera lights for the selected preset
- **AND** raster export rendering uses the same camera lights for the selected preset

#### Scenario: Reject invalid preset data

- **WHEN** bundled material preset JSON contains an unsupported material kind, duplicate preset ID, missing required label, invalid camera-light offset, or out-of-range numeric value
- **THEN** frontend validation fails with a clear error instead of silently falling back to an unintended material

### Requirement: Material presets apply one shading family to structure objects

The selected material preset SHALL define one shading family that is applied consistently to atom spheres, bond cylinders, and polyhedron surfaces. Object-specific rendering needs, such as bond color mode and polyhedron edge overlays, MAY remain object-specific as long as they do not break the selected shading family.

#### Scenario: Apply preset across structure objects

- **WHEN** atoms, bonds, and polyhedra are visible and the user selects a material preset
- **THEN** atom spheres use that preset's shading family
- **AND** bond cylinders use that preset's shading family
- **AND** polyhedron surfaces use that preset's shading family
- **AND** polyhedron edge outlines remain available when polyhedra are rendered

#### Scenario: Preserve independent color controls

- **WHEN** the user changes the material preset
- **THEN** the current color scheme remains unchanged
- **AND** the current bond color mode remains unchanged

### Requirement: Material presets keep opacity and unit-cell styling independent

Selecting a material preset SHALL NOT change atom, bond, polyhedron, or unit-cell opacity values. The unit-cell frame SHALL NOT participate in material preset shading.

#### Scenario: Preserve component opacity while changing presets

- **GIVEN** the user has adjusted atom, bond, polyhedron, or unit-cell opacity
- **WHEN** the user selects a different material preset
- **THEN** each component opacity value remains unchanged

#### Scenario: Keep unit-cell frame outside material presets

- **WHEN** the user selects a material preset
- **THEN** atom, bond, and polyhedron materials may update
- **AND** the unit-cell frame keeps its existing line rendering behavior

### Requirement: Preview and export resolve material presets consistently

The frontend SHALL use the selected material preset for both the interactive preview and raster export rendering. Export mesh quality SHALL remain independent from material preset selection.

#### Scenario: Export uses selected material preset

- **GIVEN** a structure scene has loaded and the user selected a material preset
- **WHEN** the user exports a PNG
- **THEN** the exported render uses the selected material preset for atoms, bonds, and polyhedra
- **AND** the selected export mesh quality remains unchanged
