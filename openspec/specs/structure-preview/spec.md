## Purpose

Define the local GUI flow for loading a structure file, parsing it through the
Python API, and returning the minimal scene data needed for the first browser
preview.
## Requirements
### Requirement: User can open a local structure file

The system SHALL provide a desktop GUI file-open flow inside the left floating
interaction card. The selected file SHALL be uploaded to the local Python API
for parsing, and the app SHALL NOT require a command-line file path for this
MVP flow.

#### Scenario: Open a local structure file from the GUI

- **WHEN** the user selects a local structure file from the GUI
- **THEN** the frontend uploads that file to the local API
- **AND** the interaction card shows the selected file name and a loading state

#### Scenario: File data is not persisted

- **WHEN** the local API receives an uploaded structure file
- **THEN** it parses the file for the current request
- **AND** it does not create a recent-file list or save the uploaded structure as
  project state

### Requirement: Python API parses backend-supported CIF structures

The system SHALL parse uploaded periodic structure files through the Python
backend structure parser and convert successful parses into a structure preview
response. CIF files SHALL be the committed parser and scene fixture baseline.
Parse failures SHALL return a clear API error that the frontend can display.

#### Scenario: Parse a CIF fixture

- **WHEN** the API receives a valid CIF fixture
- **THEN** it returns a successful structure preview response
- **AND** the response includes unit-cell vectors and atom records

#### Scenario: Reject an invalid structure file

- **WHEN** the API cannot parse the uploaded file through the backend structure
  parser
- **THEN** it returns an error response with a clear parse message
- **AND** the frontend displays that message in the interaction card

### Requirement: Scene response contains only MVP preview data

The system SHALL return a scene contract containing unit-cell vectors, renderable atom instances, optional bond records, optional polyhedron records, non-fatal analysis warnings, and a structure summary. Each atom instance SHALL include a stable ID, canonical site ID, element symbol, Cartesian position, fractional position, integer periodic image offset, periodic-image marker, image-reason metadata, radius, and color. Each bond record SHALL identify renderable endpoints by atom-array index in the returned scene and SHALL NOT require the browser to run crystallographic analysis. Each polyhedron record SHALL identify a center atom index, ordered hull atom indices, triangular face indices, color, and visibility-dependency metadata, and SHALL NOT require the browser to run crystallographic analysis, hull generation, or material-style resolution. The scene response SHALL keep the structure summary atom count tied to canonical sites. The scene contract SHALL NOT include labels, measurement data, or user-facing visual-control configuration.

#### Scenario: Build scene response from a parsed structure

- **WHEN** a backend-parsed structure is converted successfully
- **THEN** the scene response includes the supplied unit-cell vectors
- **AND** each atom instance includes ID, site ID, element, Cartesian position, fractional position, image offset, periodic-image marker, image-reason metadata, radius, and color fields
- **AND** bond records are included when bond analysis succeeds and finds renderable bonds
- **AND** polyhedron records are included when polyhedra analysis succeeds and finds renderable polyhedra

#### Scenario: Generate visual images for cell-boundary atoms

- **WHEN** a periodic 3D structure contains atoms on unit-cell faces, edges, or corners
- **THEN** the scene response includes visual periodic image instances needed to close the displayed unit cell
- **AND** those periodic image instances reference the same canonical site ID as their source atom
- **AND** those periodic image instances include `boundary` in their image-reason metadata

#### Scenario: Preserve canonical atom count

- **WHEN** the scene response includes periodic image atom instances
- **THEN** the structure summary atom count equals the number of canonical structure sites
- **AND** it does not count visual periodic image instances as additional structure atoms

#### Scenario: Exclude deferred scene features

- **WHEN** the frontend receives a scene response for this change
- **THEN** it can render atoms, bonds, polyhedra, and the unit cell without label or measurement records
- **AND** it does not receive user-facing visual-control configuration fields

### Requirement: Element radius and color use internal bundled defaults

The system SHALL resolve atom radius from an internal element registry and atom
color from a separate internal colormap registry. The first preview SHALL use
`uniform_radius` for atom size and the bundled VESTA-compatible colormap as an
internal default.

#### Scenario: Resolve atom radius and color

- **WHEN** the scene builder creates an atom record for a known element
- **THEN** it resolves the atom radius from bundled element data
- **AND** it resolves the atom color from the active internal colormap

#### Scenario: Keep data registries separate

- **WHEN** element data and colormap data are loaded
- **THEN** element radius records and element color records come from separate
  bundled data files
- **AND** the frontend does not expose a colormap selector

### Requirement: Browser preview renders atoms, bonds, and unit cell

The frontend SHALL render the returned scene as a full-workspace Three.js preview with atoms, bonds, polyhedra, and the unit cell. The preview SHALL initialize loaded scenes with a reproducible VESTA-like orthographic camera pose using `Outward = c`, `Upward = b*`, and `Roll = 0°`; SHALL allow bounded interactive rotation and zoom through the existing view-control rail; and SHALL use local component state to control whether atoms, bonds, polyhedra, unit-cell frame, cell-boundary atom images, and one-hop bonded atom images are visible.

#### Scenario: Render a successful scene

- **WHEN** the frontend receives a successful structure scene response
- **THEN** the full workspace canvas renders visible atom geometry when the Atoms component is enabled
- **AND** it renders the unit-cell frame for the supplied cell when the Unit cell component is enabled
- **AND** it renders bond geometry when the Bonds component is enabled and the scene contains visible bond records
- **AND** it renders polyhedron geometry when the Polyhedra component is enabled and the scene contains visible polyhedron records
- **AND** it frames the scene with `Outward = c`, `Upward = b*`, and `Roll = 0°`

#### Scenario: Keep high-frequency display controls in the left panel

- **WHEN** the structure preview is displayed
- **THEN** common component visibility controls are available from the left tab panel
- **AND** the left structure card remains focused on file status and compact structure facts

### Requirement: Browser preview shows an element legend

The frontend SHALL show a read-only element legend when a valid structure scene
is loaded. The legend SHALL derive one entry per unique element from the loaded
scene atoms, using the first occurrence order from the scene. Each legend entry
SHALL show the element symbol in the app's sans font at regular weight and a
fixed-size sphere marker using that element's scene color. The legend container
SHALL use a capsule shape.

#### Scenario: Show legend for a loaded scene

- **WHEN** the frontend receives a successful structure scene containing atoms
  for multiple elements
- **THEN** the preview shows one legend entry per unique element
- **AND** each entry shows the element symbol and the corresponding atom color

#### Scenario: Preserve element ordering

- **WHEN** the scene atoms contain repeated elements
- **THEN** the legend lists each element only once
- **AND** the legend order follows the first time each element appears in the
  scene atom list

#### Scenario: Hide legend without a valid scene

- **WHEN** no structure is loaded or the current upload failed to parse
- **THEN** the preview does not show an element legend

### Requirement: Preview layout preserves full-bleed canvas with overlay safe areas

The frontend SHALL keep the structure preview canvas full-window and SHALL NOT draw a visible canvas frame. When a scene is loaded, the preview layout SHALL reserve screen-space safe areas for the left structure UI, the bottom element legend, and a stable right-side margin sized for the Advanced Settings drawer region. Opening or closing the Advanced Settings drawer SHALL NOT change the preview safe area; the drawer may cover part of the preview. The bottom legend SHALL be horizontally centered within the available preview area after those stable safe areas are applied.

#### Scenario: Canvas remains full-window

- **WHEN** the structure preview is displayed
- **THEN** the canvas fills the preview workspace
- **AND** the UI does not add a visible border or framed image container around the canvas

#### Scenario: Structure avoids overlay regions

- **WHEN** a loaded scene is framed for preview
- **THEN** the primary structure view is positioned within the available preview area outside the active overlay safe areas

#### Scenario: Advanced Settings drawer does not resize preview safe area

- **WHEN** the Advanced Settings drawer is open
- **THEN** the preview safe-area calculation remains the same as when the drawer is closed
- **AND** the drawer may overlay part of the right side of the preview

#### Scenario: Legend aligns to available preview area

- **WHEN** a loaded scene shows the element legend
- **THEN** the legend's horizontal position is centered within the available preview area outside the active left and right safe areas

### Requirement: Legend is part of future figure export semantics

The system SHALL treat a visible element legend as figure content for future
GUI exports. Export implementation is outside this change, but later export
work SHALL compose the legend relative to an explicit export frame rather than
using the browser window size as the final figure boundary.

#### Scenario: Export design preserves visible legend intent

- **WHEN** a future GUI export is implemented
- **THEN** the export behavior includes the visible element legend by default
- **AND** the legend position is resolved relative to the export figure frame

### Requirement: Interaction card follows the MVP frontend boundary

The frontend SHALL use a left floating structure card over the scene plus a separate left floating tab panel below it after a valid scene is loaded. The structure card SHALL show only implemented structure status: open file, file name, loading state, success summary, parse errors, and non-fatal analysis warnings. The tab panel SHALL contain common preview controls and SHALL NOT be merged into the structure summary card.

#### Scenario: Show successful preview status

- **WHEN** a structure preview has loaded successfully
- **THEN** the left floating structure card shows the file name and a compact structure summary
- **AND** the separate left tab panel appears below it
- **AND** the structure card does not show disabled placeholder actions

#### Scenario: Show parse error status

- **WHEN** a structure upload fails to parse
- **THEN** the left floating structure card shows the file name and parse error
- **AND** the scene area does not pretend that a valid structure is loaded
- **AND** the left tab panel does not appear

### Requirement: Tests use local CIF fixtures and avoid generated preview artifacts

The system SHALL use local CIF fixtures as tests for file parsing and scene
conversion. Generated preview images SHALL NOT be committed as examples or
golden images for this migration.

#### Scenario: Fixture-backed parser and scene tests

- **WHEN** the automated tests run
- **THEN** they cover the committed CIF fixture matrix
- **AND** they validate the returned scene structure rather than comparing
  golden image files

### Requirement: Preview provides a right-side Advanced Settings drawer

The frontend SHALL provide a right-side Advanced Settings drawer for low-frequency preview settings after a structure scene is loaded. The drawer SHALL expand from and retract into a compact right-side settings trigger, SHALL attach to the right edge and span the full viewport height with an internally scrollable content area, SHALL remain visually consistent with the existing light UI, and SHALL expose rotation mode plus bond algorithm controls.

#### Scenario: Open settings drawer

- **GIVEN** a structure scene has loaded successfully
- **WHEN** the user opens the right-side settings trigger
- **THEN** the Advanced Settings drawer appears on the right side of the workspace
- **AND** the drawer includes an accessible title
- **AND** the drawer includes an interaction-mode control with Trackball and Orbit options
- **AND** the drawer includes a bond algorithm control
- **AND** the drawer uses a simple restrained opening motion

#### Scenario: Retract settings drawer

- **WHEN** the user activates the drawer's retract control
- **THEN** the Advanced Settings drawer retracts toward the right-side trigger
- **AND** the retracting motion is visually consistent with the opening motion
- **AND** the retract control is aligned with the compact settings trigger

#### Scenario: Keep common component controls out of advanced settings

- **WHEN** the Advanced Settings drawer is shown
- **THEN** it does not show component visibility controls for atoms, unit cell, bonds, polyhedra, cell-boundary atoms, or one-hop bonded atoms

### Requirement: Cell-boundary atom visibility can be toggled locally

The frontend SHALL default to showing periodic cell-boundary atom images when the loaded scene provides them. The `Cell-boundary atoms` switch in the left `Display` tab SHALL control whether atom instances marked with the `boundary` image reason participate in the visible scene, without changing the loaded scene response, canonical atom count, file state, preview fitting bounds, or backend state.

#### Scenario: Show cell-boundary atom images by default

- **WHEN** a periodic structure scene includes atom instances marked with the `boundary` image reason
- **THEN** the preview includes those atom instances in the visible scene by default

#### Scenario: Hide cell-boundary atom images

- **WHEN** the user turns off the `Cell-boundary atoms` switch
- **THEN** the preview excludes atom instances whose visibility depends on the cell-boundary atom image setting
- **AND** the structure summary atom count remains the canonical atom count
- **AND** the unit-cell visual scale remains based on the loaded scene rather than the filtered visible subset

#### Scenario: Re-show cell-boundary atom images

- **WHEN** the user turns the `Cell-boundary atoms` switch back on
- **THEN** the preview includes the cell-boundary atom image instances from the already-loaded scene
- **AND** the frontend does not re-upload the file to the API for this display-only change

### Requirement: Preview supports interactive rotation modes

The frontend SHALL allow the user to rotate a loaded structure preview with mouse drag gestures. Trackball rotation SHALL be the default interaction mode. Orbit rotation SHALL be available as a low-frequency setting in the right Advanced Settings drawer. Both interaction modes SHALL keep panning disabled.

#### Scenario: Trackball is the default rotation mode

- **WHEN** a structure scene loads successfully
- **THEN** the preview uses Trackball rotation as the active interaction mode

#### Scenario: Switch to Orbit rotation

- **WHEN** the user selects Orbit in the Advanced Settings drawer interaction-mode control
- **THEN** subsequent canvas drag gestures use Orbit rotation behavior
- **AND** the current zoom percentage remains unchanged

#### Scenario: Switch back to Trackball rotation

- **WHEN** the user selects Trackball in the Advanced Settings drawer interaction-mode control
- **THEN** subsequent canvas drag gestures use Trackball rotation behavior
- **AND** the current zoom percentage remains unchanged

#### Scenario: Pan remains disabled

- **WHEN** the user performs a pan-style mouse gesture in either interaction mode
- **THEN** the preview target remains centered for the loaded scene
- **AND** the structure is not translated through pan interaction

### Requirement: Preview zoom is bounded and synchronized

The frontend SHALL express preview zoom as a percentage of the fitted loaded-scene view. The zoom percentage SHALL be clamped from 25% to 400%. Wheel zoom, the vertical zoom slider, and the editable percentage input SHALL stay synchronized to the same zoom value. The zoom slider SHALL use logarithmic mapping so 100% lies at the midpoint between 25% and 400%.

#### Scenario: Show fitted zoom as 100 percent

- **WHEN** a structure scene loads successfully
- **THEN** the zoom control shows 100%
- **AND** the camera uses the fitted scene view

#### Scenario: Wheel zoom clamps to bounds

- **WHEN** the user zooms with the mouse wheel beyond the supported range
- **THEN** the zoom value remains no lower than 25%
- **AND** the zoom value remains no higher than 400%

#### Scenario: Slider and input stay synchronized

- **WHEN** the user changes the vertical zoom slider
- **THEN** the percentage input updates to the same zoom value
- **AND** the rendered preview uses that zoom value

#### Scenario: Input and slider stay synchronized

- **WHEN** the user enters a valid zoom percentage
- **THEN** the vertical zoom slider updates to the same zoom value
- **AND** the rendered preview uses that zoom value

#### Scenario: Percentage input clamps on commit

- **WHEN** the user commits a zoom percentage below 25% or above 400%
- **THEN** the zoom control clamps the value into the supported 25% to 400% range
- **AND** the rendered preview uses the clamped zoom value

### Requirement: Preview exposes a compact view-control rail

The frontend SHALL show a compact vertical view-control rail after a valid structure scene is loaded. The rail SHALL sit near the left structure card, SHALL provide reset, interaction lock, and zoom controls, and SHALL remain visually separate from the right Advanced Settings drawer. The rail SHALL NOT appear when no valid scene is loaded.

#### Scenario: Show rail after scene load

- **WHEN** a structure scene loads successfully
- **THEN** the preview shows a compact vertical rail near the left structure card
- **AND** the rail includes reset, lock, vertical zoom slider, and zoom percentage input controls

#### Scenario: Hide rail without a valid scene

- **WHEN** no structure is loaded or the current upload failed to parse
- **THEN** the preview does not show the view-control rail

#### Scenario: Rail participates in preview layout

- **WHEN** a loaded scene is framed for preview
- **THEN** the primary structure view avoids the left structure card and the view-control rail

### Requirement: Preview can lock and reset view interaction

The frontend SHALL provide a canvas interaction lock and a reset control for loaded structure previews. Locking SHALL disable mouse gesture changes to the canvas, including drag rotation and wheel zoom, while leaving explicit rail and settings controls available. Reset SHALL restore the VESTA-like crystal camera default, 100% zoom, and centered framing.

#### Scenario: Lock disables canvas gestures

- **WHEN** the user enables the interaction lock
- **THEN** mouse drag gestures do not rotate the preview
- **AND** mouse wheel gestures do not change the zoom percentage

#### Scenario: Explicit controls remain available while locked

- **WHEN** the interaction lock is enabled
- **THEN** the user can still use the reset control
- **AND** the user can still change zoom through the rail controls
- **AND** the user can still change interaction mode in the Advanced Settings drawer

#### Scenario: Reset restores VESTA-like crystal camera default

- **WHEN** the user activates the reset control after rotating or zooming the preview
- **THEN** the preview returns to `Primary Axis = Outward`
- **AND** the preview returns to `Outward = c`, `Upward = b*`, and `Roll = 0°`
- **AND** the zoom value returns to 100%
- **AND** the preview target returns to centered framing

### Requirement: Preview provides a left tab panel for common controls

The frontend SHALL show a second left floating card below the structure summary card after a valid scene is loaded. The card SHALL use tabs for `Camera`, `Display`, `Style`, and `Export`; SHALL default to `Display`; SHALL show the active tab with icon plus full label; and SHALL show inactive tabs as icon-only controls with accessible labels and tooltips. The panel height SHALL follow the active tab content with a short transition and SHALL NOT use internal scrolling for common controls.

#### Scenario: Show tab panel after scene load

- **WHEN** a structure scene loads successfully
- **THEN** the left tab panel appears below the structure summary card
- **AND** the `Display` tab is selected by default
- **AND** all four tabs are present

#### Scenario: Switch tabs

- **WHEN** the user selects a different tab
- **THEN** the active tab shows its icon and full label
- **AND** inactive tabs remain icon-only with accessible labels and tooltips
- **AND** the card height transitions to the selected tab content height

#### Scenario: Show implemented pages

- **WHEN** the user opens `Camera`, `Display`, `Style`, or `Export`
- **THEN** the tab shows implemented controls for that tab
- **AND** it does not show a reserved-state message for implemented controls

### Requirement: Export tab controls figure export settings

The `Export` tab SHALL expose compact controls for output width, output height, aspect-ratio lock, supersampling factor, 3D mesh-detail preset, output format, and a single export action. Output format SHALL be selected as a setting, not by separate competing action buttons. The export action label SHALL reflect the selected output format.

#### Scenario: Show export controls

- **WHEN** a structure scene has loaded successfully and the user opens `Export`
- **THEN** the tab shows width and height controls
- **AND** it shows an aspect-ratio lock control between the size fields
- **AND** it shows a supersampling control
- **AND** it shows a 3D mesh-detail control with `Low`, `Medium`, `High`, and `XHigh`
- **AND** it shows a format control with `PNG` and `PDF`
- **AND** it shows one primary export action

#### Scenario: Format selection updates the action

- **WHEN** the user selects `PNG` as the output format
- **THEN** the primary action is labeled for PNG export
- **WHEN** the user selects `PDF` as the output format
- **THEN** the primary action is labeled for PDF export

### Requirement: Export size supports locked and unlocked projected scale

The frontend SHALL maintain export width and height as explicit pixel values. When the size link is enabled, the frontend SHALL establish a pixel-per-projected-unit scale from the current projected tight box and current export pixel dimensions. While linked, rotating the preview or changing currently visible exported elements SHALL recompute width and height from the current projected tight-box dimensions using that locked scale. Editing either linked size field SHALL update the locked scale and update the other field from the current projected tight box. The tight box SHALL reflect component visibility, including periodic-image visibility choices such as one-hop bonded atoms. When the size link is disabled, width and height SHALL be independently editable.

#### Scenario: Enabling link captures projected scale

- **GIVEN** the size link is disabled
- **WHEN** the user enables the size link
- **THEN** the frontend stores a pixel-per-projected-unit scale from the current tight-box projection and export dimensions
- **AND** neither linked export dimension grows beyond the dimensions that existed before enabling the link

#### Scenario: Linked width edit updates height and scale

- **GIVEN** the size link is enabled
- **WHEN** the user edits the export width to a valid positive value
- **THEN** the export height updates from the current projected tight-box dimensions
- **AND** the locked pixel-per-projected-unit scale updates from the edited width

#### Scenario: Linked height edit updates width and scale

- **GIVEN** the size link is enabled
- **WHEN** the user edits the export height to a valid positive value
- **THEN** the export width updates from the current projected tight-box dimensions
- **AND** the locked pixel-per-projected-unit scale updates from the edited height

#### Scenario: Linked orientation changes preserve projected scale

- **GIVEN** the size link is enabled
- **WHEN** the user rotates the preview and the projected tight-box dimensions change
- **THEN** the export width and height update from the new projected dimensions using the locked scale
- **AND** repeated orientation changes do not progressively shrink the export dimensions beyond that scale

#### Scenario: Visible periodic images affect linked projected size

- **GIVEN** the size link is enabled
- **WHEN** the user shows or hides one-hop bonded atoms
- **THEN** the projected tight box is recomputed from the visible exportable scene elements
- **AND** the export width and height update from the recomputed projected dimensions using the locked scale

#### Scenario: Unlocked size edits are independent

- **GIVEN** the size link is disabled
- **WHEN** the user edits the export width or export height to a valid positive value
- **THEN** the other size field keeps its current value

### Requirement: Export separates 2D output quality from 3D mesh detail

The frontend SHALL treat output size and supersampling as 2D export settings, and SHALL treat `Low`, `Medium`, `High`, and `XHigh` as 3D mesh-detail presets. Mesh-detail presets SHALL control atom and bond geometry detail together. Users SHALL NOT be required to configure separate atom and bond mesh-detail values for the first export slice.

#### Scenario: Supersampling is a 2D output setting

- **WHEN** the user chooses a supersampling factor
- **THEN** export uses that factor when rendering the raster image
- **AND** the selected supersampling factor does not change the preview scene

#### Scenario: Mesh detail is a 3D preset

- **WHEN** the user chooses a 3D mesh-detail preset
- **THEN** export uses the selected preset for atom and bond geometry detail
- **AND** the selected preset does not expose separate atom and bond mesh controls
- **AND** the selected preset does not change the preview scene

### Requirement: Export uses current orientation with an independent export frame

The frontend SHALL export the currently loaded visible structure scene using a camera-pose snapshot derived from the current preview orientation. Export SHALL use the explicit export frame size and projected tight-box fitting logic rather than the browser viewport size. Preview zoom SHALL NOT define the exported image pixel size.

#### Scenario: Export follows current orientation

- **WHEN** the user rotates the loaded preview and then exports a figure
- **THEN** the exported figure uses the current preview orientation
- **AND** the exported figure keeps the structure centered in the export frame
- **AND** fitting is based on a tight box around the currently visible exported scene elements

#### Scenario: Export size is independent from preview size

- **WHEN** the browser window size changes without changing export width or height
- **THEN** the next export keeps the configured export width and height

#### Scenario: Preview zoom does not set output dimensions

- **WHEN** the user changes preview zoom and then exports a figure
- **THEN** the exported file keeps the configured export width and height
- **AND** export fitting is resolved inside the export frame rather than by the preview canvas size

### Requirement: Export generates PNG and raster-backed PDF files with vector unit-cell boundary

The frontend SHALL generate PNG output directly from the export raster image. The frontend SHALL generate PDF output by placing the same raster image into a PDF page that matches the export frame. When the unit cell is visible, PDF output SHALL also draw the unit-cell boundary as vector PDF lines projected into the same export frame. PDF output SHALL NOT attempt to convert the full Three.js scene into vector geometry.

#### Scenario: Export PNG

- **WHEN** `PNG` is selected and the user activates the export action
- **THEN** the frontend downloads a PNG file generated from the current export settings
- **AND** the PNG pixel dimensions match the configured export width and height

#### Scenario: Export PDF with vector unit-cell boundary

- **WHEN** `PDF` is selected and the user activates the export action
- **THEN** the frontend downloads a PDF file
- **AND** the PDF contains the exported raster image placed on a page matching the export frame
- **AND** the visible unit-cell boundary is represented as vector PDF line geometry

#### Scenario: Format shares the same render settings

- **WHEN** the user switches between `PNG` and `PDF`
- **THEN** width, height, aspect-ratio lock, supersampling, and 3D mesh-detail settings keep their current values

### Requirement: First figure export omits overlay assets

The first figure export SHALL export the main structure figure only. It SHALL NOT include the element legend or the orientation gizmo in the generated PNG or PDF. The export design SHALL keep these overlays out of the first output while preserving a future path for separate or composited overlay export.

#### Scenario: Export main structure without legend or gizmo

- **WHEN** a loaded preview shows the element legend or orientation gizmo
- **AND** the user exports PNG or PDF
- **THEN** the exported file contains the main structure figure
- **AND** it does not contain the element legend
- **AND** it does not contain the orientation gizmo

### Requirement: Display tab controls visible scene components

The `Display` tab SHALL expose visible-component checkboxes for `Atoms`, `Unit cell`, `Bonds`, and `Polyhedra`, plus image switches for `Cell-boundary atoms` and `One-hop bonded atoms`. `Atoms`, `Unit cell`, `Bonds`, and `Cell-boundary atoms` SHALL default to enabled. `One-hop bonded atoms` and `Polyhedra` SHALL default to disabled. `Polyhedra` SHALL appear disabled and unchecked when the loaded scene has no polyhedron records. The preview SHALL allow all enabled components to be turned off without forcing a non-empty scene.

#### Scenario: Toggle atom spheres

- **WHEN** the user turns off `Atoms`
- **THEN** the preview hides all atom sphere geometry, including canonical atoms, cell-boundary atoms, and one-hop bonded atoms
- **AND** bond and polyhedron geometry can remain visible when their components are enabled

#### Scenario: Toggle unit-cell frame

- **WHEN** the user turns off `Unit cell`
- **THEN** the preview hides the unit-cell frame
- **AND** cell-boundary atom images remain controlled only by the `Cell-boundary atoms` switch

#### Scenario: Toggle bonds

- **WHEN** the user turns off `Bonds`
- **THEN** the preview hides bond geometry
- **AND** atom, polyhedron, and unit-cell visibility state remains unchanged

#### Scenario: Toggle polyhedra

- **WHEN** the loaded scene includes polyhedron records and the user turns off `Polyhedra`
- **THEN** the preview hides polyhedron geometry
- **AND** atom, bond, and unit-cell visibility state remains unchanged

#### Scenario: Show disabled polyhedra row without polyhedron data

- **WHEN** the loaded scene has no polyhedron records
- **THEN** the `Display` tab shows a disabled unchecked `Polyhedra` checkbox
- **AND** the preview does not render polyhedra

### Requirement: One-hop bonded atom visibility can be toggled locally

The frontend SHALL default to hiding one-hop bonded atom images when the loaded scene provides them. The `One-hop bonded atoms` switch SHALL control whether atom instances and bonds that depend on one-hop bonded image display participate in the visible scene. The switch SHALL be independent from `Cell-boundary atoms`, SHALL NOT trigger a file re-upload, and SHALL NOT change the loaded scene used for camera fit and layout.

#### Scenario: Hide one-hop bonded atoms by default

- **WHEN** the scene includes one-hop bonded atom image instances
- **THEN** the preview excludes those atom instances and their bonds from the visible scene by default

#### Scenario: Show one-hop bonded atoms

- **WHEN** the user turns on `One-hop bonded atoms`
- **THEN** the preview includes one-hop bonded atom image instances
- **AND** it includes bonds whose endpoints depend on those visible instances
- **AND** the unit-cell visual scale remains based on the loaded scene rather than the filtered visible subset
- **AND** the frontend does not re-upload the file to the API

#### Scenario: Cell-boundary atoms and one-hop bonded atoms are independent

- **WHEN** the user changes either `Cell-boundary atoms` or `One-hop bonded atoms`
- **THEN** the other switch keeps its current state
- **AND** the visible scene is recomputed from the already-loaded scene response

### Requirement: Preview renders polyhedra as a translucent structure component

The frontend SHALL render returned polyhedron records as translucent surface geometry with edge outlines when the Polyhedra component is enabled and every atom instance referenced by the polyhedron hull is part of the visible scene. Polyhedra SHALL use the returned face indices and SHALL NOT calculate coordination environments or hull topology in the browser.

#### Scenario: Render visible polyhedra

- **WHEN** the scene contains polyhedron records and the Polyhedra component is enabled
- **THEN** the preview renders translucent polyhedron surfaces from the returned hull atoms and face indices
- **AND** it renders edge outlines for the visible polyhedra
- **AND** atom spheres and bond cylinders can remain visible over the translucent surfaces

#### Scenario: Hide polyhedra with hidden hull atoms

- **WHEN** a polyhedron references an atom instance excluded by local image filtering
- **THEN** the preview does not render that polyhedron
- **AND** it does not render a partial replacement shell

#### Scenario: Keep polyhedra independent from atom sphere visibility

- **WHEN** the user turns off `Atoms` while `Polyhedra` remains enabled
- **THEN** the preview hides atom sphere geometry
- **AND** visible polyhedron surfaces can remain rendered

### Requirement: Preview renders bonds as a light-gray structure component

The frontend SHALL render returned bond records as light-gray single-color cylinder geometry when the Bonds component is enabled and both endpoints are part of the visible scene. Bond cylinders SHALL use the same material family as atom spheres, SHALL use a thicker fixed first-version radius, and can extend from endpoint center to endpoint center.

#### Scenario: Render visible bonds

- **WHEN** the scene contains bond records and the Bonds component is enabled
- **THEN** the preview renders light-gray bond cylinders between visible endpoints
- **AND** atom spheres cover bond ends when atom spheres are visible

#### Scenario: Hide bonds with hidden endpoints

- **WHEN** a bond endpoint is excluded by local image filtering
- **THEN** the preview does not render that bond
- **AND** it does not render a long replacement bond across the unit cell

#### Scenario: Keep cell-boundary bonds without one-hop images

- **GIVEN** `Cell-boundary atoms` is enabled
- **AND** `One-hop bonded atoms` is disabled
- **WHEN** a returned bond has both endpoint atom instances visible through canonical or cell-boundary atom visibility
- **THEN** the preview renders that bond
- **AND** bond visibility is determined by visible endpoints rather than a hidden one-hop image category

### Requirement: Advanced settings can regenerate bonds with a selected algorithm

The frontend SHALL keep the current file object available while a scene is loaded. When the user changes the bond algorithm in Advanced Settings, the frontend SHALL re-upload the current file with the selected analysis setting, replace the scene with the regenerated response, and preserve local component visibility state. The regenerated scene SHALL use the selected algorithm for both bond and polyhedra analysis.

#### Scenario: Change bond algorithm

- **WHEN** a scene is loaded and the user selects a different bond algorithm
- **THEN** the frontend re-requests the structure preview with the current file and selected algorithm
- **AND** the returned scene replaces the previous scene
- **AND** the returned bonds and polyhedra are generated from the selected algorithm
- **AND** component visibility state remains unchanged

#### Scenario: Load a new file resets defaults

- **WHEN** the user loads a different structure file
- **THEN** the bond algorithm resets to the automatic default for that structure size
- **AND** component visibility resets to the default enabled states for atoms, unit cell, bonds, and cell-boundary atoms
- **AND** one-hop bonded atoms and polyhedra reset to disabled

### Requirement: Preview presents parse errors and analysis warnings consistently

The frontend SHALL use a shared alert component for fatal parse errors and non-fatal analysis warnings. Parse errors SHALL remain destructive alerts in the left structure card and SHALL prevent a scene from loading. Non-fatal analysis warnings from bond or polyhedra analysis SHALL appear in the left structure card while preserving the successfully loaded scene.

#### Scenario: Show parse error alert

- **WHEN** structure parsing fails
- **THEN** the left structure card shows a destructive alert with the parse message
- **AND** no scene is rendered

#### Scenario: Show non-fatal analysis warning

- **WHEN** structure parsing succeeds but bond or polyhedra analysis returns a warning
- **THEN** the left structure card shows a non-destructive alert with the warning
- **AND** the preview still renders the available scene data

### Requirement: Camera tab provides crystal-aware direction controls

The frontend SHALL replace the reserved `Camera` tab content with crystal-aware camera controls after a valid structure scene is loaded. The tab SHALL expose a `Fixed-axis rotation` section with a `Primary axis` tab control for `Outward` and `Upward`, SHALL default to `Outward`, SHALL expose a live Roll control with a `Reset roll` action, and SHALL expose precise vector input inside a fixed `Numerical input` section. The controls SHALL use the existing common-controls panel styling, including tab-like segmented controls and existing numeric input styling.

#### Scenario: Show implemented Camera tab controls

- **WHEN** a structure scene has loaded successfully and the user opens `Camera`
- **THEN** the tab shows a `Fixed-axis rotation` section
- **AND** the tab shows a `Primary Axis` control with `Outward` and `Upward`
- **AND** `Outward` is selected by default
- **AND** the tab shows a Roll control and `Reset roll` action
- **AND** the tab shows a fixed `Numerical input` section
- **AND** the tab does not show a reserved-state message

#### Scenario: Switch Primary Axis without rotating the preview

- **WHEN** the user switches `Primary Axis` between `Upward` and `Outward`
- **THEN** the current preview orientation remains visually unchanged
- **AND** subsequent gizmo clicks and Roll edits use the newly selected Primary Axis

### Requirement: Crystal camera defaults use VESTA-like direct and reciprocal directions

The frontend SHALL initialize and reset loaded previews to a reproducible crystal camera pose with `Primary Axis = Outward`, `Outward = c`, `Upward = b*`, and `Roll = 0°`. The frontend SHALL derive the rendered Three.js camera orientation from these crystal-direction controls and SHALL continue to expose the live rendered pose for export through the existing camera-pose snapshot boundary.

#### Scenario: Load scene with VESTA-like camera default

- **WHEN** a structure scene loads successfully
- **THEN** the preview uses `Outward = c`
- **AND** the preview uses `Upward = b*`
- **AND** the Roll control shows `0°`
- **AND** the zoom control shows 100%

#### Scenario: Export follows crystal camera orientation

- **WHEN** the user adjusts the crystal camera controls and then exports a figure
- **THEN** the exported figure uses the current preview orientation
- **AND** the export path does not need to read the Camera tab input draft state

### Requirement: Roll uses a VESTA-like reproducible anchor

The frontend SHALL define Roll around the current primary direct-lattice direction. For `Roll = 0°`, the frontend SHALL choose the first usable reciprocal secondary direction from `c*`, then `b*`, then `a*`, after projecting the candidate onto the plane perpendicular to the primary direction. Changing Roll SHALL rotate the secondary reciprocal direction around the primary direct direction. Applying a manual secondary vector SHALL update Roll to the nearest equivalent canonical 0-360 degree angle.

#### Scenario: Roll anchor follows VESTA-like fallback order

- **WHEN** the primary direct direction is `a` or `b`
- **THEN** `Roll = 0°` uses `c*` as the secondary reciprocal direction
- **WHEN** the primary direct direction is `c`
- **THEN** `Roll = 0°` uses `b*` as the secondary reciprocal direction

#### Scenario: Roll edits are live

- **WHEN** the user changes the Roll control
- **THEN** the preview orientation updates immediately
- **AND** the primary direct direction remains fixed
- **AND** the secondary reciprocal direction changes according to the Roll angle

### Requirement: Numerical input editor batch-applies direct and reciprocal coefficients

The `Numerical input` section SHALL remain visible in the Camera tab. It SHALL show `Outward` and `Upward` semantic rows in that order. The row matching the selected `Primary axis` SHALL use direct basis labels `a`, `b`, and `c`; the other row SHALL use reciprocal basis labels `a*`, `b*`, and `c*`. Switching `Primary axis` SHALL keep the row order fixed, swap the direct and reciprocal basis labels, and visually highlight the selected primary row. Editing vector fields SHALL create a draft that does not rotate the preview until the user applies all vector fields together.

#### Scenario: Show Numerical input in Upward primary mode

- **GIVEN** `Primary Axis` is `Upward`
- **WHEN** the user opens `Camera`
- **THEN** the `Upward` row shows coefficients for `a`, `b`, and `c`
- **AND** the `Outward` row shows coefficients for `a*`, `b*`, and `c*`
- **AND** the `Outward` row remains first
- **AND** the `Upward` row is visually highlighted

#### Scenario: Show Numerical input in Outward primary mode

- **GIVEN** `Primary Axis` is `Outward`
- **WHEN** the user opens `Camera`
- **THEN** the `Outward` row shows coefficients for `a`, `b`, and `c`
- **AND** the `Upward` row shows coefficients for `a*`, `b*`, and `c*`
- **AND** the `Outward` row is first
- **AND** the `Outward` row is visually highlighted

#### Scenario: Draft edits do not rotate until apply

- **WHEN** the user edits one or more vector fields
- **THEN** the preview orientation does not change immediately
- **WHEN** the user applies the vector draft
- **THEN** the preview orientation updates from the six submitted coefficients as one operation
- **AND** Roll updates to match the applied secondary direction

#### Scenario: Vector display normalizes coefficients

- **WHEN** the frontend displays vector coefficients derived from the current camera orientation
- **THEN** the displayed vector is normalized so the maximum absolute coefficient is 1
- **AND** coefficients close to simple integers are snapped for display

### Requirement: Orientation gizmo axes can apply the Primary Axis

The orientation gizmo SHALL allow single-click axis alignment for loaded previews. Hovering `a`, `b`, or `c` SHALL visually brighten that axis and use a pointer cursor. Clicking an axis SHALL apply that direct axis to the selected `Primary Axis`. The gizmo SHALL NOT require double-click, SHALL NOT show tooltips for these axis actions, and SHALL NOT keep a persistent active axis highlight.

#### Scenario: Hover highlights clickable axis

- **WHEN** the pointer hovers over a gizmo axis label or shaft
- **THEN** that axis brightens
- **AND** the cursor indicates that the axis is clickable

#### Scenario: Click axis in Upward primary mode

- **GIVEN** `Primary Axis` is `Upward`
- **WHEN** the user clicks the gizmo `c` axis
- **THEN** the preview updates so direct `c` is the screen-up direction
- **AND** the secondary outward direction is resolved from the current camera state or the VESTA-like fallback

#### Scenario: Click axis in Outward primary mode

- **GIVEN** `Primary Axis` is `Outward`
- **WHEN** the user clicks the gizmo `a` axis
- **THEN** the preview updates so direct `a` is the screen-outward direction
- **AND** the secondary upward direction is resolved from the current camera state or the VESTA-like fallback

### Requirement: Style tab exposes material presets

The frontend SHALL expose a material preset control in the `Style` tab after a structure scene has loaded. The bundled preset list SHALL include `classic-matte`, `modern-matte`, `glossy`, and `flat-2d`. The preset data model SHALL allow additional bundled presets to be added without adding rendering branches tied to specific preset IDs.

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

The frontend SHALL load bundled material preset values from frontend JSON data under `web/src/data/material-presets/`. TypeScript code SHALL validate and adapt that data before rendering, but preset numeric values such as roughness, metalness, per-target material overrides, camera-light intensity, and camera-light offset SHALL be editable without changing TypeScript source code.

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

The selected material preset SHALL define one base shading family that is applied consistently to atom spheres, bond cylinders, and polyhedron surfaces. Preset JSON MAY define per-target material overrides for `atom`, `bond`, or `polyhedron`; these overrides SHALL adjust the target material while preserving preset-level lighting. Object-specific rendering needs, such as bond color mode and polyhedron edge overlays, MAY remain object-specific as long as they do not break the selected shading family.

#### Scenario: Apply preset across structure objects

- **WHEN** atoms, bonds, and polyhedra are visible and the user selects a material preset
- **THEN** atom spheres use that preset's shading family
- **AND** bond cylinders use that preset's shading family
- **AND** polyhedron surfaces use that preset's shading family
- **AND** polyhedron edge outlines remain available when polyhedra are rendered

#### Scenario: Apply a polyhedron material override

- **WHEN** the selected material preset defines an override for `polyhedron`
- **THEN** polyhedron surfaces use the override material merged with the preset's base material props
- **AND** atom spheres and bond cylinders continue to use the preset base material unless they define their own overrides
- **AND** preset lighting remains shared across atoms, bonds, and polyhedra

#### Scenario: Apply flat 2D without preset outlines

- **WHEN** the user selects the `Flat 2D` material preset
- **THEN** atom spheres, bond cylinders, and polyhedron surfaces use the selected unlit flat material family
- **AND** atom and bond rendering does not add preset-specific outline geometry
- **AND** polyhedra continue to use their existing edge overlay when polyhedra are rendered

#### Scenario: Preserve independent color controls

- **WHEN** the user changes the material preset
- **THEN** the current color scheme remains unchanged
- **AND** the current bond color mode remains unchanged

#### Scenario: Retire bond-only 2D style

- **WHEN** the user opens the bond style control
- **THEN** the available choices are limited to by-atom and uniform bond color behavior
- **AND** the control does not offer a separate bond-only 2D style

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
