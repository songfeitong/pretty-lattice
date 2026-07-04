# Object Styles Panel

Status: draft product spec
Scope: first implementation slice for the right-sidebar Objects tab

## Purpose

The Objects panel gives users VESTA-like fine control over renderable scene
objects while keeping the Pretty Lattice interface compact and modern. The
first slice focuses on atoms: per-element and per-atom radius, color, and
visibility. Bonds get a placeholder tab only.

The panel belongs in the right inspector sidebar next to Settings. It is a
low-frequency object-style surface, not a primary scene interaction control.

## Navigation

The right inspector sidebar has top-level tabs:

- Settings
- Objects

The Objects tab has nested tabs:

- Atoms
- Bonds

The Bonds tab is intentionally empty in the first slice. It exists only to
reserve the shape of the panel.

Use the default shadcn Tabs visual treatment for the nested Atoms/Bonds tabs,
with compact sizing aligned to the Common panel tabs: 32px tab-list height,
24px trigger height, small text, and medium weight. Do not use icons here. Do
not use the top-level inspector line-tab treatment for this nested control,
and do not hide inactive tab text.

## Atoms Table

Atoms are displayed as a data table built from shadcn Table and TanStack Table
patterns. The table is domain-specific; do not introduce a generic app-wide
DataTable abstraction unless this table shape is reused elsewhere.

Columns:

- Site
- R (Å)
- Color
- Visible

Do not add search, jump, pagination, inherit/custom labels, mixed indicators,
or atom row menus in the first slice.

### Grouping

Rows are grouped by element. Element groups are ordered by the first occurrence
of canonical unit-cell atoms in `scene.atoms`. Atom rows inside each element
group keep the same canonical-atom order as `scene.atoms`.

The Atoms table lists unit-cell atoms only. Periodic image atoms are not shown
as separate editable rows. Periodic images inherit the style of their
corresponding unit-cell atom through the shared `siteId`.

Atom labels use a colon between element and site index without an intervening
space, for example `Li:15`. This label is rendered in monospace in Objects and
in the selected-atom information card.
Do not display the backend `siteId` delimiter form such as `Li-15` in the
Objects table, because hyphenated labels are reserved for bond-like notation.

Element groups are collapsed by default. Users can expand individual element
groups.

Element rows are editable group rows, not passive section headers. Editing an
element row applies the change to every atom in that element group.

Element rows use a subtly stronger muted background than atom rows, so the
grouping is visible while remaining quiet. The element atom count aligns in a
fixed-width numeric column, independent of whether the element symbol has one
or two letters. The count is left-aligned and close to two-letter symbols, not
spread far to the right.

Expanded atom rows align their label text to the element label text, not to the
left edge of the expander icon. For example, `Sr:0` starts at the same x
position as the parent `Sr` text.

## Editing Semantics

Objects uses a two-level override model:

1. Element-level style.
2. Atom-level style.

Atom rows display effective values. They do not expose whether a value is
inherited or overridden.

Editing an element row for one property applies that property to every atom in
the element group and clears the corresponding atom-level overrides for that
element. Editing color clears color overrides only. Editing radius clears radius
overrides only. Editing visibility clears visibility overrides only.

Single atom rows can still be edited after an element-level change. For example,
an element can be hidden, and then one atom under that element can be made
visible again.

Element rows never show mixed state. They always show the element-level value.

## Radius

Radius values are absolute display radii in Angstrom.

The radius cell uses an inline numeric input. The input contains only the
number. The unit appears only in the column header as `R (Å)`.

The radius input follows the compact manual-input sizing used in the Pose
panel: 22px control height, small monospace numerals, and no unit inside the
input.

Editing any element or atom radius switches the global atom radius model to
Custom. Custom radius mode records the effective display radii at the moment it
is created.

Preset radius modes:

- Uniform
- Atomic
- Van der Waals
- Ionic

Custom radius mode:

- Stores absolute display radii.
- Disables the global atom Size slider.
- Treats the entered radius as the final rendered radius.

When switching from a preset radius mode to Custom, bake the current effective
display radii into the custom radius table. For example, if Atomic radius is
shown at 40 percent size, Custom starts from those currently displayed radii,
not from the unscaled Atomic data.

When switching from Custom back to any preset radius mode, clear all radius
overrides and restore the atom Size value that was active when Custom was
entered.

Changing the global radius preset clears existing radius overrides.

## Color

The Color cell is a swatch button. Clicking the swatch opens the existing color
picker popover. The table does not show hex values or color names.

Objects swatches are flat color chips. Do not use the legend's Lambert-style
highlighted swatch background in the table.

Only one Objects color picker may be open at a time. Opening another element or
atom color picker closes the previously open one, matching the legend behavior.

Element color edits in Objects and element color edits from the legend are the
same operation. They must write through the same element-color override path and
produce identical preview, legend, inspector, bond, polyhedra, and export
colors.

Editing an element color:

- Switches the color scheme to Custom if needed.
- Applies the color to every atom of that element.
- Clears atom-level color overrides for that element.
- Updates the legend color for that element.

Editing an atom color:

- Affects only that atom.
- Does not affect the legend.

Changing the global color scheme clears existing color overrides. Custom color
mode disables auto-distinguish similar colors, because user-specified colors
should not be modified automatically.

## Visibility

Visibility uses an eye icon button, not a checkbox.

Visible state:

- Eye icon.
- Normal foreground color.

Invisible state:

- Eye-off icon.
- Muted gray icon color.

Invisible does not mean disabled. Hidden element and atom rows keep radius and
color editable. Row text should not be dimmed just because the object is hidden.

Element visibility follows the same override rules as radius and color.
Toggling an element's visibility applies to all atoms of that element and clears
their visibility overrides. A hidden element can still have one atom manually
made visible afterward.

The global Display > Atoms control participates in effective visibility:

- Turning Display > Atoms off makes every element and atom row read as
  invisible in Objects.
- Turning Display > Atoms back on clears all object-level visibility overrides
  so every unit-cell atom becomes visible again.
- This reset affects visibility only. Radius and color overrides remain intact.
- Object-level visibility edits do not write back to Display > Atoms. Turning
  every unit-cell atom invisible in Objects leaves Display > Atoms on, so users
  can re-enable individual atoms from Objects without first visiting Display.

## Apply To All Atoms

Atom rows do not have an overflow menu or reset controls.

Element rows provide one secondary action: Apply to all atoms. It appears as a
persistent icon button. The button has no visible text; it shows its
border/background on hover or focus and uses a tooltip labeled "Apply to all
atoms". The action applies the element row's current radius, color, and
visibility to every atom in that element group and clears all corresponding
atom-level overrides for that element.

This action is a cleanup affordance for returning an element group to a uniform
state.

## Scene Selection Linkage

The scene's selected atom id is the single source of truth for atom selection.
Objects must not introduce a separate table selection state.

Current scene behavior remains:

- Single click atom: pulse feedback.
- Double click atom: inspect/select atom.
- Clicking non-selectable scene space clears atom selection.

Objects linkage:

- If the user is already in Objects > Atoms, double-clicking a scene atom
  expands the corresponding element group, scrolls to the atom row, and
  highlights that row.
- If the sidebar is closed, or open on Settings, double-clicking a scene atom
  must not open the sidebar or switch to Objects.
- AtomInspectorCard may provide an explicit action to open Objects > Atoms and
  locate the selected atom.
- Locating an atom from AtomInspectorCard uses the normal sidebar opening state.
  The follow-up row reveal must scroll only the inspector body vertically, not
  call page-level `scrollIntoView`, so opening the sidebar does not jolt the
  preview or floating cards.
- Double-clicking an atom row's non-control selection area sets the scene
  selected atom id. Single-clicking an atom row does not select it.
- Radius, color, and visibility controls inside a row must not also trigger row
  selection.
- Element rows do not select scene atoms.
- If the currently selected atom becomes effectively hidden, clear the scene
  selected atom id. The table may keep focus on the row.

## Reset And Global Style Interaction

Changing global style presets clears corresponding object overrides:

- Changing color scheme clears color overrides.
- Changing radius model clears radius overrides.
- Reset all clears all object overrides.

Custom radius disables the global atom Size slider. Custom color disables
auto-distinguish similar colors.

## First Slice Exclusions

Do not implement these in the first slice:

- Search or jump.
- Pagination.
- Mixed-state indicators.
- Inherit/custom badges.
- Atom row overflow menus.
- Per-atom reset actions.
- Full bond editing.
- Polyhedra or cell object tabs.
- Automatic sidebar opening when a scene atom is double-clicked.

## Implementation Notes

Use shadcn Table primitives for semantic table structure and TanStack Table for
row and column modeling. The table is specific to Objects > Atoms and can live
near the inspector sidebar implementation.

Keep object-style state in the frontend presentation layer. The backend scene
contract should continue to provide atom identity, element identity, geometry,
and analysis data, not user-edited visual overrides.

Legend element color editing and Objects element color editing must share a
single updater. Avoid duplicate color state.

All rich color pickers share a single app-level active picker id. Opening any
picker closes the previously active picker, including pickers in Legend,
Objects, and common Style controls. Close the active picker when the scene is
cleared or reloaded, when an owning panel/tab is dismissed or switched away,
when Locate in objects changes the right-sidebar context, and when the global
color scheme changes to a preset.

The scene render path should resolve final atom appearance from:

1. The active global preset or custom table.
2. Element-level overrides.
3. Atom-level overrides.

This resolution should be shared by preview, export, legend, bonds, polyhedra,
and AtomInspectorCard wherever applicable.

The preview Canvas runs on demand. Any React commit that can change the rendered
scene subtree or effective object visibility must request a demand frame, so
objects appear and disappear immediately without waiting for the next camera
interaction.
