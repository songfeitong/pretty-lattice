from __future__ import annotations

from pymatgen.core import Structure

import pretty_lattice.structures.connectivity as connectivity_module
import pretty_lattice.structures.polyhedra as polyhedra_module
from pretty_lattice.structures.normalization import normalize_structure_for_preview
from pretty_lattice.structures.periodic_images import (
    atom_record_to_spec,
    build_atom_records,
    vector3,
)
from pretty_lattice.structures.preview_limits import (
    PreviewLimitExceeded,
    enforce_scene_limits,
    enforce_structure_atom_limit,
)
from pretty_lattice.structures.schema import (
    BondAlgorithm,
    CustomBondRecalculationError,
    InvalidBondCutoffOverridesError,
    SceneSpec,
    bond_algorithm_label,
    default_bond_algorithm_for_atom_count,
    normalize_bond_algorithm,
)
from pretty_lattice.structures.summary import (
    build_structure_summary,
    has_valid_3d_periodic_cell,
)
from pretty_lattice.structures.warning_policy import suppress_third_party_structure_warnings


def build_scene_response(
    structure: Structure,
    *,
    bond_algorithm: str | None = None,
    bond_cutoff_overrides: dict[str, float] | None = None,
) -> SceneSpec:
    return build_scene_spec(
        structure,
        bond_algorithm=bond_algorithm,
        bond_cutoff_overrides=bond_cutoff_overrides,
    )


def build_scene_spec(
    structure: Structure,
    *,
    bond_algorithm: str | None = None,
    bond_cutoff_overrides: dict[str, float] | None = None,
) -> SceneSpec:
    with suppress_third_party_structure_warnings():
        return _build_scene_spec(
            structure,
            bond_algorithm=bond_algorithm,
            bond_cutoff_overrides=bond_cutoff_overrides,
        )


def _build_scene_spec(
    structure: Structure,
    *,
    bond_algorithm: str | None = None,
    bond_cutoff_overrides: dict[str, float] | None = None,
) -> SceneSpec:
    enforce_structure_atom_limit(len(structure))
    structure = normalize_structure_for_preview(structure)
    normalized_bond_algorithm = normalize_bond_algorithm(bond_algorithm)
    selected_bond_algorithm = normalized_bond_algorithm or default_bond_algorithm_for_atom_count(
        len(structure)
    )
    cell_vectors = [vector3(vector) for vector in structure.lattice.matrix]
    can_generate_periodic_images = has_valid_3d_periodic_cell(structure)
    atom_data = build_atom_records(
        structure,
        can_generate_periodic_images=can_generate_periodic_images,
    )

    bonds = []
    bond_families = []
    polyhedra = []
    warnings = []
    strict_recalculation = bool(bond_cutoff_overrides)
    if can_generate_periodic_images:
        boundary_source_keys = [
            key for key, atom in atom_data.atom_records.items() if "boundary" in atom.image_reasons
        ]
        try:
            connectivity = connectivity_module.build_connectivity(
                atom_records=atom_data.atom_records,
                bond_algorithm=selected_bond_algorithm,
                canonical_source_keys=atom_data.canonical_source_keys,
                boundary_source_keys=boundary_source_keys,
                sites=atom_data.sites,
                structure=structure,
                cutoff_overrides=bond_cutoff_overrides,
            )
        except PreviewLimitExceeded:
            raise
        except InvalidBondCutoffOverridesError:
            raise
        except Exception as exc:
            warnings.append(
                _analysis_failure(
                    code="bond-analysis-failed",
                    analysis="Bond analysis",
                    bond_algorithm=selected_bond_algorithm,
                    exc=exc,
                    strict_recalculation=strict_recalculation,
                )
            )
        else:
            atom_index_by_key = {
                key: index for index, key in enumerate(atom_data.atom_records.keys())
            }
            try:
                bonds = connectivity_module.build_bonds(
                    atom_index_by_key=atom_index_by_key,
                    atom_records=atom_data.atom_records,
                    cell_vectors=cell_vectors,
                    connectivity=connectivity,
                )
                bond_families = connectivity_module.build_bond_families(
                    connectivity,
                    bonds,
                )
            except PreviewLimitExceeded:
                raise
            except Exception as exc:
                warnings.append(
                    _analysis_failure(
                        code="bond-analysis-failed",
                        analysis="Bond analysis",
                        bond_algorithm=selected_bond_algorithm,
                        exc=exc,
                        strict_recalculation=strict_recalculation,
                    )
                )

            try:
                polyhedra = polyhedra_module.build_polyhedra(
                    atom_index_by_key=atom_index_by_key,
                    atom_records=atom_data.atom_records,
                    cell_vectors=cell_vectors,
                    connectivity=connectivity,
                    structure=structure,
                )
            except PreviewLimitExceeded:
                raise
            except Exception as exc:
                warnings.append(
                    _analysis_failure(
                        code="polyhedra-analysis-failed",
                        analysis="Polyhedra analysis",
                        bond_algorithm=selected_bond_algorithm,
                        exc=exc,
                        strict_recalculation=strict_recalculation,
                    )
                )

    enforce_scene_limits(
        atom_count=len(atom_data.atom_records),
        bond_count=len(bonds),
        polyhedron_count=len(polyhedra),
    )
    scene: SceneSpec = {
        "cell": {"vectors": cell_vectors},
        "atoms": [
            atom_record_to_spec(atom, cell_vectors) for atom in atom_data.atom_records.values()
        ],
        "bonds": bonds,
        "bondFamilies": bond_families,
        "polyhedra": polyhedra,
        "summary": build_structure_summary(structure),
    }
    if warnings:
        scene["warnings"] = warnings

    return scene


def _analysis_failure(
    *,
    code: str,
    analysis: str,
    bond_algorithm: BondAlgorithm,
    exc: Exception,
    strict_recalculation: bool,
) -> dict[str, str]:
    message = f"{analysis} with {bond_algorithm_label(bond_algorithm)} failed: {exc}"
    if strict_recalculation:
        raise CustomBondRecalculationError(
            f"Custom bonding recalculation failed: {message}"
        ) from exc
    return {
        "code": code,
        "message": message,
    }
