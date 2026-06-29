## Purpose

Define the Python backend boundary for structure parsing, canonical in-memory
structure objects, dependency ownership, scene conversion inputs, symmetry
summary generation, and local fixture policy.
## Requirements
### Requirement: Backend uses pymatgen structures

The Python backend SHALL use pymatgen `Structure` as the canonical in-memory
model for periodic structure files accepted by the structure preview path.
Backend parsing and scene conversion SHALL NOT expose pymatgen objects to the
frontend API.

#### Scenario: Parse a CIF into the backend model

- **WHEN** the backend receives a valid CIF fixture
- **THEN** it parses the file into a pymatgen `Structure`
- **AND** the parsed structure contains canonical sites, lattice vectors,
  element symbols, Cartesian coordinates, and fractional coordinates

#### Scenario: Keep the frontend contract library-independent

- **WHEN** the backend converts a parsed structure for the browser
- **THEN** it returns the project scene JSON contract
- **AND** the response does not contain pymatgen-specific Python objects or
  library type names

### Requirement: Backend dependency boundary is pymatgen-level

The Python runtime dependency set SHALL use pymatgen for structure IO and
materials-analysis helpers. ASE SHALL NOT remain a runtime dependency for the
structure preview backend. `spglib` SHALL NOT remain a direct project runtime
dependency when pymatgen provides the needed symmetry wrapper.

#### Scenario: Runtime dependencies are clean

- **WHEN** project dependencies are inspected after the migration
- **THEN** pymatgen is present as a runtime dependency
- **AND** ASE is absent from the runtime dependency list
- **AND** `spglib` is absent from the direct runtime dependency list

#### Scenario: Backend code avoids direct low-level symmetry imports

- **WHEN** backend structure modules are inspected after the migration
- **THEN** they do not import `spglib` directly
- **AND** symmetry behavior is accessed through pymatgen-level APIs

### Requirement: Backend produces symmetry summaries through pymatgen

The backend SHALL produce the existing structure symmetry summary from
pymatgen-level symmetry analysis when the parsed structure is periodic and
symmetry analysis succeeds. The summary SHALL keep nullable fields for values
that are unavailable through pymatgen metadata and project-owned mappings.

#### Scenario: Summarize symmetry for a periodic CIF fixture

- **WHEN** the backend builds a scene response for a periodic CIF fixture with
  detectable symmetry
- **THEN** the response summary marks symmetry as available
- **AND** the summary includes the space-group symbol, space-group number,
  point-group symbol, crystal system, and lattice system
- **AND** the summary includes a Schoenflies point-group symbol when the
  pymatgen point-group symbol is covered by the project-owned crystallographic
  mapping

#### Scenario: Keep optional symmetry fields nullable

- **WHEN** a supplementary symmetry notation cannot be produced through the
  pymatgen-level backend API
- **THEN** the corresponding summary field is returned as `null`
- **AND** the backend does not add a direct `spglib` dependency only to fill
  that field

### Requirement: Backend tests use local CIF fixtures

The backend test suite SHALL use local CIF fixtures as the committed parser,
scene, and symmetry regression baseline. Automated tests SHALL NOT require
network access to Materials Project or any other remote structure source.

#### Scenario: Parse the CIF fixture matrix

- **WHEN** backend tests run
- **THEN** they parse every committed CIF fixture under the structure fixture
  directory
- **AND** they validate canonical site count, element set, scene summary, and
  symmetry summary for representative fixtures

#### Scenario: Avoid online fixture fetches

- **WHEN** backend tests run in an offline environment
- **THEN** fixture-backed parser and scene tests can complete using only files
  committed to the repository

### Requirement: Backend generates preview bonds with pymatgen

The Python backend SHALL generate preview bond records from the parsed pymatgen `Structure` using a project-defined allowlist of pymatgen neighbor algorithms. The default algorithm SHALL be CrystalNN. The initial allowlist SHALL include CrystalNN and other pymatgen algorithms that can run without user-provided custom cutoff tables. The returned scene contract SHALL remain project-owned JSON and SHALL NOT expose pymatgen objects or library type names as frontend data structures.

#### Scenario: Generate default CrystalNN bonds

- **WHEN** the API builds a scene response for a periodic structure and no bond algorithm is specified
- **THEN** the backend uses CrystalNN for preview bond analysis
- **AND** the response includes bond records when CrystalNN finds renderable bonds

#### Scenario: Generate bonds with a selected allowlisted algorithm

- **WHEN** the API receives a supported bond algorithm setting
- **THEN** the backend uses that algorithm for preview bond analysis
- **AND** the response includes bond records from that algorithm when it finds renderable bonds

#### Scenario: Reject unsupported bond algorithm identifiers

- **WHEN** the API receives an unsupported bond algorithm identifier
- **THEN** it returns a clear client error
- **AND** it does not fall back silently to a different algorithm

### Requirement: Backend returns one-hop bonded image data as a scene superset

The backend SHALL build a display-ready scene superset containing canonical atom instances, cell-boundary atom image instances, one-hop bonded atom image instances from canonical atom instances, and one-hop bonded atom image instances from cell-boundary atom image instances. One-hop bonded image generation SHALL NOT recursively expand from newly added one-hop bonded atom images. Atom image instances SHALL include metadata that distinguishes cell-boundary images from bonded images and SHALL include enough visibility-dependency metadata for the frontend to filter the superset locally. Bond visibility-dependency metadata SHALL be derived from the visibility groups of its endpoint atom instances so bonds between visible canonical and cell-boundary atom instances do not incorrectly depend on one-hop bonded atom visibility.

#### Scenario: Generate one-hop bonded images from canonical atoms

- **WHEN** a canonical atom has a bonded neighbor in an adjacent periodic image under the selected bond algorithm
- **THEN** the scene response includes a one-hop bonded atom image for that neighbor
- **AND** the response includes the short bond connecting the canonical atom to that image atom

#### Scenario: Generate one-hop bonded images from cell-boundary atoms

- **WHEN** cell-boundary atom images are generated and those image atoms have bonded neighbors in adjacent periodic images under the selected bond algorithm
- **THEN** the scene response includes the corresponding one-hop bonded atom images
- **AND** the response marks those one-hop bonded data as depending on cell-boundary atom visibility

#### Scenario: Stop after one hop

- **WHEN** the backend adds a one-hop bonded atom image to the scene superset
- **THEN** it does not use that newly added one-hop bonded atom image as a source for further bonded image generation

#### Scenario: Mark image reasons

- **WHEN** an atom instance is included only as a boundary image
- **THEN** its image-reason metadata includes `boundary`
- **AND** when an atom instance is included for one-hop bonded display, its image-reason metadata includes `bonded`

#### Scenario: Mark cell-boundary-only bonds independently from one-hop images

- **WHEN** a generated bond connects atom instances that are visible with canonical or cell-boundary atom visibility alone
- **THEN** the bond visibility-dependency metadata can be satisfied without enabling one-hop bonded atom visibility
- **AND** enabling or disabling one-hop bonded atom images is not required only because the bond crosses a cell boundary

### Requirement: Backend treats bond analysis warnings as non-fatal

The backend SHALL treat structure parsing as required for a successful preview and bond analysis as optional scene enrichment. If parsing succeeds but bond analysis fails, the API SHALL return the atom and cell scene data with an analysis warning instead of failing the entire preview request.

#### Scenario: Bond analysis fails after successful parsing

- **WHEN** the backend successfully parses the uploaded structure
- **AND** the selected bond algorithm raises an error during analysis
- **THEN** the API returns a successful structure preview response with atom and cell data
- **AND** the response includes a non-fatal analysis warning
- **AND** the response does not include invalid bond records

#### Scenario: Empty bond result is not a warning

- **WHEN** the selected bond algorithm completes successfully but finds no renderable bonds
- **THEN** the API returns a successful structure preview response
- **AND** it does not add an analysis warning only because the bond list is empty

### Requirement: Backend generates Crystal Toolkit-compatible preview polyhedra

The Python backend SHALL generate preview polyhedron records from the same selected pymatgen neighbor connectivity used for preview bonds. Polyhedra generation SHALL follow Crystal Toolkit-compatible center-selection semantics: a candidate center SHALL produce a polyhedron only when it has more than three drawn connected atom instances, has no missing connected atom instances required by the selected connectivity, and is lower than every drawn connected neighbor in pymatgen's species ordering. Equal-species connected environments SHALL NOT produce polyhedra. The returned polyhedron records SHALL remain project-owned JSON and SHALL NOT expose Crystal Toolkit scene primitives or pymatgen objects.

#### Scenario: Generate default CrystalNN polyhedra

- **WHEN** the API builds a scene response for a periodic structure and no bond algorithm is specified
- **THEN** the backend uses CrystalNN connectivity for preview bond and polyhedra analysis
- **AND** the response includes polyhedron records for complete Crystal Toolkit-compatible coordination environments

#### Scenario: Generate polyhedra with selected connectivity

- **WHEN** the API receives a supported bond algorithm setting
- **THEN** the backend uses that selected algorithm's connectivity for both bonds and polyhedra
- **AND** the response does not mix polyhedra generated from a different neighbor algorithm

#### Scenario: Suppress reverse and same-species centers

- **WHEN** a candidate center has a connected neighbor that is lower than or equal to the center in pymatgen's species ordering
- **THEN** the backend does not create a polyhedron for that candidate center
- **AND** other eligible centers in the same scene can still produce polyhedra

#### Scenario: Skip incomplete coordination environments

- **WHEN** a candidate center has connected sites required by the selected connectivity that are not present as drawn atom instances in the scene superset
- **THEN** the backend does not create a partial polyhedron for that candidate center
- **AND** it does not return a broken polyhedron with missing vertices

### Requirement: Backend returns renderable polyhedron geometry

The backend SHALL return each polyhedron as renderable geometry data containing a center atom index, ordered hull atom indices, triangular face indices, color, and visibility-dependency metadata. The ordered hull atom indices SHALL include the center atom instance followed by the drawn connected atom instances used as the hull input, matching Crystal Toolkit's center-plus-neighbor position set. Face indices SHALL refer to positions in the ordered hull atom index list.

#### Scenario: Return hull atom indices and faces

- **WHEN** a candidate coordination environment produces a valid convex hull
- **THEN** the scene response includes a polyhedron record with the center atom index
- **AND** the record includes ordered hull atom indices with the center atom first
- **AND** the record includes triangular face indices into that ordered hull atom index list

#### Scenario: Use center color

- **WHEN** the backend creates a polyhedron record
- **THEN** the record color is derived from the center atom color
- **AND** the record does not include frontend material opacity

#### Scenario: Mark polyhedron visibility dependencies

- **WHEN** a generated polyhedron uses boundary or one-hop bonded atom image instances
- **THEN** the polyhedron visibility-dependency metadata can be satisfied only when those required image categories are enabled
- **AND** polyhedra that use only canonical atom instances do not depend on image visibility settings

### Requirement: Backend treats polyhedra analysis warnings as non-fatal

The backend SHALL treat polyhedra generation as optional scene enrichment. If structure parsing succeeds but polyhedra generation fails for the scene, the API SHALL return the available atom, cell, and bond scene data with a non-fatal analysis warning instead of failing the entire preview request. Degenerate or ineligible individual centers SHALL be skipped without warning when the rest of polyhedra analysis completes normally.

#### Scenario: Polyhedra analysis fails after successful parsing

- **WHEN** the backend successfully parses the uploaded structure
- **AND** polyhedra generation raises an unexpected scene-level error
- **THEN** the API returns a successful structure preview response with available atom, cell, and bond data
- **AND** the response includes a non-fatal analysis warning
- **AND** the response does not include invalid polyhedron records

#### Scenario: Empty polyhedra result is not a warning

- **WHEN** polyhedra generation completes successfully but finds no eligible complete coordination environments
- **THEN** the API returns a successful structure preview response
- **AND** it does not add an analysis warning only because the polyhedra list is empty
