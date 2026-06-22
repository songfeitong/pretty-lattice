export interface SceneSpec {
  cell: {
    vectors: [number, number, number][];
  };
  atoms: AtomSpec[];
  summary: StructureSummary;
}

export interface StructureSummary {
  formula: string;
  atomCount: number;
  cell: CellSummary;
  symmetry: SymmetrySummary;
}

export interface CellSummary {
  a: string;
  b: string;
  c: string;
  alpha: string;
  beta: string;
  gamma: string;
}

export interface SymmetrySummary {
  available: boolean;
  spaceGroup: string | null;
  spaceGroupNumber: number | null;
  pointGroup: string | null;
  pointGroupSchoenflies: string | null;
  crystalSystem: string | null;
  latticeSystem: string | null;
}

export interface AtomSpec {
  id: string;
  element: string;
  position: [number, number, number];
  radius: number;
  color: string;
}

export class StructurePreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructurePreviewError";
  }
}

export async function uploadStructurePreview(file: File): Promise<SceneSpec> {
  const response = await fetch("/api/structure-preview", {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-pretty-lattice-filename": encodeURIComponent(file.name),
    },
    body: file,
  });

  if (!response.ok) {
    throw new StructurePreviewError(await readPreviewError(response));
  }

  return (await response.json()) as SceneSpec;
}

async function readPreviewError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      detail?: string | { message?: string };
    };
    if (typeof payload.detail === "string") {
      return payload.detail;
    }
    if (payload.detail?.message) {
      return payload.detail.message;
    }
  } catch {
    // Fall through to the status-based message.
  }

  return `Structure preview failed with status ${response.status}.`;
}
