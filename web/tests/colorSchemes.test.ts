import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  COLOR_SCHEME_OPTIONS,
  elementColorForScheme,
  hasElementColor,
} from "../src/app/colorSchemes";

const ELEMENT_DECLARATION_RE = /^\[elements\.([^\]]+)\]$/gm;

describe("color schemes", () => {
  test("orders softened schemes before their source schemes", () => {
    expect(COLOR_SCHEME_OPTIONS.map((option) => option.value)).toEqual([
      "vesta-soft",
      "vesta",
      "jmol-soft",
      "jmol",
    ]);
  });

  test("cover every backend element symbol", () => {
    const backendElements = backendElementSymbols();

    for (const { value } of COLOR_SCHEME_OPTIONS) {
      const missingElements = backendElements.filter(
        (element) => !hasElementColor(element, value),
      );

      expect(missingElements).toEqual([]);
    }
  });

  test("define Jmol colors for registry-only placeholders", () => {
    expect(elementColorForScheme("D", "jmol")).toBe("#ffffff");
    expect(elementColorForScheme("XX", "jmol")).toBe("#4c4c4c");
  });

  test("defines softened Jmol Soft colors", () => {
    expect(elementColorForScheme("H", "jmol-soft")).toBe("#dedede");
    expect(elementColorForScheme("N", "jmol-soft")).toBe("#506dc2");
    expect(elementColorForScheme("O", "jmol-soft")).toBe("#d2685a");
  });

  test("defines softened VESTA Soft colors", () => {
    expect(elementColorForScheme("O", "vesta-soft")).toBe("#d16759");
    expect(elementColorForScheme("Cl", "vesta-soft")).toBe("#9fda96");
    expect(elementColorForScheme("Si", "vesta-soft")).toBe("#4565ba");
  });
});

function backendElementSymbols(): string[] {
  const elementsToml = readFileSync(
    new URL("../../src/pretty_lattice/data/elements.toml", import.meta.url),
    "utf8",
  );

  return [...elementsToml.matchAll(ELEMENT_DECLARATION_RE)].map((match) => match[1]!);
}
