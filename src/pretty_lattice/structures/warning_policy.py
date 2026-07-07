from __future__ import annotations

import warnings
from collections.abc import Iterator
from contextlib import contextmanager

THIRD_PARTY_STRUCTURE_WARNING_PACKAGE_NAMES = (
    "pymatgen",
    "spglib",
)
THIRD_PARTY_STRUCTURE_WARNING_MODULES = (
    *(rf"{package_name}(\.|$).*" for package_name in THIRD_PARTY_STRUCTURE_WARNING_PACKAGE_NAMES),
)


@contextmanager
def suppress_third_party_structure_warnings() -> Iterator[None]:
    with warnings.catch_warnings():
        for module in THIRD_PARTY_STRUCTURE_WARNING_MODULES:
            warnings.filterwarnings("ignore", category=Warning, module=module)
        yield
