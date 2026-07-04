# Use BatchedMesh for Atom Rendering

## Status

Accepted 2026-07-04.

## Context

Pretty Lattice renders atoms, bonds, unit-cell lines, polyhedra, and selection
feedback as separate Three.js policy layers. Atoms used to be rendered with
`InstancedMesh`, while bonds and polyhedron surfaces used `BatchedMesh`.

That split made the atom path fast for repeated sphere geometry, but it created
three design costs:

- transparent atoms were not sorted per atom by Three.js;
- atom selection and highlight logic used `event.instanceId`, while future bond
  selection would need a different identity path;
- future atom customization would be limited by an instancing model that assumes
  one shared geometry and material shape.

The project is a personal visualization tool, not a browser-compatibility
matrix. Code clarity, modern Three.js usage, and one coherent render-object
model matter more than keeping an `InstancedMesh` fallback for browsers without
`WEBGL_multi_draw`.

## Decision

Use `BatchedMesh` as the only atom rendering backend.

Do not keep an atom rendering mode switch, browser feature fallback, or parallel
`InstancedMesh` implementation. Atoms, bonds, and polyhedron surfaces should all
follow the same broad pattern:

```text
scene data
-> render items
-> batch build
-> BatchedMesh population
```

Atom picking should use `event.batchId`, not `event.instanceId`. The code should
register batch ids in a small registry rather than relying on
`batchId === atom index`, because batch ids are renderer-owned identities.

Atom highlight should stay attached to the atom geometry by updating the
batched item color with `setColorAt(batchId, color)`. Selection rings remain a
separate overlay because they are interaction feedback, not atom material.

Keep atom `depthWrite=true`, including when atom opacity is below 100%. The
reason is now project semantics rather than an `InstancedMesh` workaround:
`BatchedMesh.sortObjects=true` improves atom-vs-atom transparent ordering, but
atoms, bonds, unit-cell lines, and polyhedra are still separate render objects.
Depth writes keep atoms as stable structure objects against bonds and later
semantic overlays.

Polyhedron surfaces should keep their existing `depthWrite=true` semantic shell
behavior. That suppresses rear faces and rear edges, even though it means some
transparent overlay combinations remain a deliberate visual compromise rather
than physically correct glass rendering.

## Consequences

- The atom render path is simpler: there is one backend, `BatchedAtoms`.
- Atom, bond, and polyhedron code use the same BatchedMesh-family vocabulary:
  batch items, batch ids, per-object sorting, and per-object culling.
- Transparent atoms gain BatchedMesh's per-object sorting inside the atom batch.
- Browsers without `WEBGL_multi_draw` may pay a draw-call cost. That tradeoff is
  accepted for this project.
- Future bond selection can reuse the batch picking registry, but bonds still
  need stable scene-contract ids before they should become inspectable targets.
- Future atom customization can add more atom geometries to the atom batch
  without restoring a second atom backend.

## Non-Goals

- Do not implement order-independent transparency or a multi-pass compositor as
  part of this decision.
- Do not make unit-cell lines a screen-space HUD. They remain depth-tested scene
  references.
- Do not add bond selection until the scene contract gives bonds stable ids.
