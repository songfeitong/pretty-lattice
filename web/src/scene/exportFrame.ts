import { OrthographicCamera, Quaternion, Vector3 } from "three";

import type { SceneSpec } from "../api/scene";
import type { StyleState } from "../model/appearance";
import type { ComponentOpacityState } from "../model/displayState";
import { resolveAtomRadiusForStyle } from "../model/objectStyles";
import type { CameraPoseSnapshot } from "./cameraPose";
import {
  BOND_RADIUS,
  cellCorners,
  centeredCellGroupPosition,
} from "./sceneGeometry";
import type { VectorTuple } from "./viewMath";

export interface ProjectedBounds {
  centerX: number;
  centerY: number;
  height: number;
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  width: number;
}

export interface StructureExportFramePlan {
  aspectRatio: number;
  bounds: ProjectedBounds | null;
  centerX: number;
  centerY: number;
  height: number;
  width: number;
  zoom: number;
}

export interface StructureExportProjectedSize {
  height: number;
  width: number;
}

interface ExportFramePoint {
  x: number;
  y: number;
}

interface StructureExportGeometryOptions {
  cameraPose: CameraPoseSnapshot;
  componentOpacity: ComponentOpacityState;
  groupPosition?: VectorTuple;
  scene: SceneSpec;
  showAtoms: boolean;
  showUnitCell: boolean;
  style: StyleState;
}

interface StructureExportFrameOptions extends StructureExportGeometryOptions {
  height: number;
  width: number;
}

interface Projector {
  projectPoint: (point: Vector3 | VectorTuple) => ExportFramePoint;
}

interface BoundsAccumulator {
  includePoint: (point: ExportFramePoint, radius?: number) => void;
  toBounds: () => ProjectedBounds | null;
}

const EXPORT_FRAME_PADDING_RATIO = 1.04;
const FALLBACK_EXPORT_ASPECT_RATIO = 4 / 3;
const MIN_PROJECTED_SPAN = 1e-6;

export function computeStructureExportAspectRatio(
  options: StructureExportGeometryOptions,
): number {
  const bounds = computeStructureProjectedBounds(options);
  return bounds ? normalizeAspectRatio(bounds.width / bounds.height) : FALLBACK_EXPORT_ASPECT_RATIO;
}

export function computeStructureExportProjectedSize(
  options: StructureExportGeometryOptions,
): StructureExportProjectedSize | null {
  const bounds = computeStructureProjectedBounds(options);
  if (!bounds) {
    return null;
  }

  return {
    height: bounds.height,
    width: bounds.width,
  };
}

export function computeStructureExportFramePlan({
  height,
  width,
  ...geometryOptions
}: StructureExportFrameOptions): StructureExportFramePlan {
  const bounds = computeStructureProjectedBounds(geometryOptions);
  if (!bounds) {
    return {
      aspectRatio: FALLBACK_EXPORT_ASPECT_RATIO,
      bounds: null,
      centerX: 0,
      centerY: 0,
      height,
      width,
      zoom: 1,
    };
  }

  const paddedWidth = Math.max(MIN_PROJECTED_SPAN, bounds.width * EXPORT_FRAME_PADDING_RATIO);
  const paddedHeight = Math.max(MIN_PROJECTED_SPAN, bounds.height * EXPORT_FRAME_PADDING_RATIO);

  return {
    aspectRatio: normalizeAspectRatio(bounds.width / bounds.height),
    bounds,
    centerX: bounds.centerX,
    centerY: bounds.centerY,
    height,
    width,
    zoom: Math.max(0.01, Math.min(width / paddedWidth, height / paddedHeight)),
  };
}

export function applyOrthographicExportFrame(
  camera: OrthographicCamera,
  framePlan: StructureExportFramePlan,
) {
  camera.left = -framePlan.width / 2 + framePlan.centerX;
  camera.right = framePlan.width / 2 + framePlan.centerX;
  camera.top = framePlan.height / 2 + framePlan.centerY;
  camera.bottom = -framePlan.height / 2 + framePlan.centerY;
  camera.zoom = framePlan.zoom;
  camera.updateProjectionMatrix();
}

export function computeStructureProjectedBounds({
  cameraPose,
  componentOpacity,
  groupPosition,
  scene,
  showAtoms,
  showUnitCell,
  style,
}: StructureExportGeometryOptions): ProjectedBounds | null {
  const projector = createCameraPlaneProjector(
    cameraPose,
    groupPosition ?? centeredCellGroupPosition(scene.cell.vectors),
  );
  const bounds = createBoundsAccumulator();

  if (showUnitCell && componentOpacity.unitCell > 0) {
    for (const corner of cellCorners(scene.cell.vectors)) {
      bounds.includePoint(projector.projectPoint(corner));
    }
  }

  if (showAtoms && componentOpacity.atoms > 0 && style.atomRadius > 0) {
    for (const atom of scene.atoms) {
      bounds.includePoint(
        projector.projectPoint(atom.position),
        resolveAtomRadiusForStyle(atom, style),
      );
    }
  }

  if (componentOpacity.bonds > 0 && style.bondThickness > 0) {
    const radius = BOND_RADIUS * (style.bondThickness / 100);
    for (const bond of scene.bonds) {
      const startAtom = scene.atoms[bond.startAtomIndex];
      const endAtom = scene.atoms[bond.endAtomIndex];
      if (!startAtom || !endAtom) {
        continue;
      }

      bounds.includePoint(projector.projectPoint(startAtom.position), radius);
      bounds.includePoint(projector.projectPoint(endAtom.position), radius);
    }
  }

  if (componentOpacity.polyhedra > 0) {
    for (const polyhedron of scene.polyhedra) {
      if (polyhedron.faces.length === 0) {
        continue;
      }

      for (const atomIndex of polyhedron.hullAtomIndices) {
        const atom = scene.atoms[atomIndex];
        if (atom) {
          bounds.includePoint(projector.projectPoint(atom.position));
        }
      }
    }
  }

  return bounds.toBounds();
}

function createCameraPlaneProjector(
  cameraPose: CameraPoseSnapshot,
  groupPosition: VectorTuple,
): Projector {
  const cameraQuaternion = new Quaternion(...cameraPose.quaternion).normalize();
  const target = new Vector3(...cameraPose.target);
  const offset = new Vector3(...groupPosition);
  const right = new Vector3(1, 0, 0).applyQuaternion(cameraQuaternion).normalize();
  const up = new Vector3(0, 1, 0).applyQuaternion(cameraQuaternion).normalize();

  return {
    projectPoint(point: Vector3 | VectorTuple): ExportFramePoint {
      const localPoint = Array.isArray(point)
        ? new Vector3(...point)
        : point.clone();
      localPoint.add(offset).sub(target);

      return {
        x: localPoint.dot(right),
        y: localPoint.dot(up),
      };
    },
  };
}

function createBoundsAccumulator(): BoundsAccumulator {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  return {
    includePoint(point: ExportFramePoint, radius = 0) {
      const safeRadius = Math.max(0, radius);
      minX = Math.min(minX, point.x - safeRadius);
      maxX = Math.max(maxX, point.x + safeRadius);
      minY = Math.min(minY, point.y - safeRadius);
      maxY = Math.max(maxY, point.y + safeRadius);
    },
    toBounds() {
      if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
        return null;
      }

      const width = Math.max(MIN_PROJECTED_SPAN, maxX - minX);
      const height = Math.max(MIN_PROJECTED_SPAN, maxY - minY);

      return {
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
        height,
        maxX,
        maxY,
        minX,
        minY,
        width,
      };
    },
  };
}

function normalizeAspectRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return FALLBACK_EXPORT_ASPECT_RATIO;
  }

  return value;
}
