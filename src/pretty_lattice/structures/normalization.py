from __future__ import annotations

from pymatgen.core import Structure


def normalize_structure_for_preview(structure: Structure) -> Structure:
    """Fold periodic site coordinates into the unit cell before scene analysis.

    Pymatgen's neighbor analyzers are robust to out-of-cell fractional
    coordinates, but the scene contract uses explicit atom positions and image
    offsets. Keep that boundary simple by giving the scene builder a folded
    preview Structure.
    """

    return type(structure)(
        structure.lattice,
        [site.species for site in structure],
        structure.frac_coords,
        charge=_explicit_structure_charge(structure),
        validate_proximity=False,
        to_unit_cell=True,
        coords_are_cartesian=False,
        site_properties={key: list(values) for key, values in structure.site_properties.items()},
        labels=list(structure.labels),
        properties=dict(structure.properties),
    )


def _explicit_structure_charge(structure: Structure) -> float | None:
    # Match pymatgen's own copy semantics: preserve an explicit charge, but do
    # not turn an implicit oxidation-state sum into an explicit Structure charge.
    return getattr(structure, "_charge", None)
