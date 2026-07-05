import { readFileSync } from "node:fs";

const VERSION_PATTERN = /^version\s*=\s*"([^"]+)"\s*$/m;

export function readPrettyLatticeVersion(): string {
  const pyprojectText = readFileSync(new URL("../pyproject.toml", import.meta.url), "utf8");
  const projectSection = readTomlSection(pyprojectText, "project");

  if (!projectSection) {
    throw new Error("Could not find [project] section in pyproject.toml.");
  }

  const version = VERSION_PATTERN.exec(projectSection)?.[1];

  if (!version) {
    throw new Error("Could not find project.version in pyproject.toml.");
  }

  return version;
}

function readTomlSection(tomlText: string, sectionName: string): string | null {
  const lines = tomlText.split(/\r?\n/);
  const sectionHeader = `[${sectionName}]`;
  const sectionLines: string[] = [];
  let isReadingSection = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("[") && trimmedLine.endsWith("]")) {
      if (isReadingSection) {
        break;
      }

      isReadingSection = trimmedLine === sectionHeader;
      continue;
    }

    if (isReadingSection) {
      sectionLines.push(line);
    }
  }

  return sectionLines.length > 0 ? sectionLines.join("\n") : null;
}
