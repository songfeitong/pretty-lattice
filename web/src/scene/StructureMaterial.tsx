import { type Ref } from "react";
import {
  BackSide,
  DoubleSide,
  FrontSide,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Material,
  type Side,
} from "three";

import type { ResolvedStructureMaterialFamily } from "./materialPresetResolver";

export type StructureMeshMaterial =
  | MeshBasicMaterial
  | MeshLambertMaterial
  | MeshPhysicalMaterial
  | MeshStandardMaterial;

export function StructureMaterial({
  color,
  depthWrite,
  materialFamily,
  materialRef,
  onBeforeCompile,
  opacity,
  polygonOffset,
  polygonOffsetFactor,
  polygonOffsetUnits,
  side,
  transparent,
  vertexColors,
  customProgramCacheKey,
}: {
  color?: string;
  depthWrite: boolean;
  materialFamily: ResolvedStructureMaterialFamily;
  materialRef?: Ref<StructureMeshMaterial>;
  onBeforeCompile?: Material["onBeforeCompile"];
  opacity: number;
  polygonOffset?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
  side?: Side;
  transparent: boolean;
  vertexColors?: boolean;
  customProgramCacheKey?: Material["customProgramCacheKey"];
}) {
  const materialKey = [
    materialFamily.id,
    transparent ? "transparent" : "opaque",
    vertexColors ? "vertex-colors" : "solid",
    side ?? "front",
  ].join(":");
  const commonProps = {
    color,
    depthWrite,
    opacity,
    onBeforeCompile,
    polygonOffset,
    polygonOffsetFactor,
    polygonOffsetUnits,
    side,
    transparent,
    vertexColors,
    customProgramCacheKey,
  };
  const presetProps = resolveThreeProps(materialFamily.material.props);
  const resolvedCommonProps = omitUndefined(commonProps);

  if (materialFamily.material.type === "MeshBasicMaterial") {
    return (
      <meshBasicMaterial
        ref={materialRef as Ref<MeshBasicMaterial>}
        key={materialKey}
        {...presetProps}
        {...resolvedCommonProps}
      />
    );
  }

  if (materialFamily.material.type === "MeshLambertMaterial") {
    return (
      <meshLambertMaterial
        ref={materialRef as Ref<MeshLambertMaterial>}
        key={materialKey}
        {...presetProps}
        {...resolvedCommonProps}
      />
    );
  }

  if (materialFamily.material.type === "MeshPhysicalMaterial") {
    return (
      <meshPhysicalMaterial
        ref={materialRef as Ref<MeshPhysicalMaterial>}
        key={materialKey}
        {...presetProps}
        {...resolvedCommonProps}
      />
    );
  }

  return (
    <meshStandardMaterial
      ref={materialRef as Ref<MeshStandardMaterial>}
      key={materialKey}
      {...presetProps}
      {...resolvedCommonProps}
    />
  );
}

function omitUndefined(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
}

function resolveThreeProps(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, resolveThreePropValue(value)]),
  );
}

function resolveThreePropValue(value: unknown): unknown {
  if (typeof value === "string") {
    return THREE_PROP_CONSTANTS[value] ?? value;
  }
  if (Array.isArray(value)) {
    return value.map(resolveThreePropValue);
  }
  if (typeof value === "object" && value !== null) {
    return resolveThreeProps(value as Record<string, unknown>);
  }

  return value;
}

const THREE_PROP_CONSTANTS: Record<string, unknown> = {
  BackSide,
  DoubleSide,
  FrontSide,
};
