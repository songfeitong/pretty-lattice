import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Quaternion,
  SpriteMaterial,
  Vector3,
} from "three";

import type { AtomRadiusModel, AtomSpec } from "../api/scene";
import { atomColorForScheme, type ElementColorOverrides } from "../model/colorSchemes";
import type { StyleState } from "../model";
import { atomRadiusForModel } from "./sceneGeometry";
import type { ResolvedStructureMaterialFamily } from "./materialPresetResolver";
import { StructureMaterial } from "./StructureMaterial";
import type { SceneMeshDetail } from "./StructureSceneObjects";
import { AtomSelectionRing } from "./AtomSelectionRing";
import {
  ATOM_HIGHLIGHT_PULSE_COLOR_MIX,
  ATOM_HIGHLIGHT_PULSE_MS,
  ATOM_HIGHLIGHT_SELECT_MS,
  ATOM_HIGHLIGHT_SELECTED_COLOR_MIX,
  ATOM_HIGHLIGHT_TARGET_COLOR,
  ATOM_SELECTION_RING_PULSE_MIN_SCALE,
  ATOM_SELECTION_RING_SELECTED_OPACITY,
  ATOM_SELECTION_RING_SELECTED_SCALE,
  atomPulseFade,
  easeOutCubic,
} from "./atomHighlight";
import type { VectorTuple } from "./viewMath";

interface AtomColorInstanceSpec {
  atom: AtomSpec;
  baseColor: Color;
  color: string;
}

interface AtomInstanceSpec extends AtomColorInstanceSpec {
  radius: number;
}

export function InstancedAtoms({
  atoms,
  colorScheme,
  colorOverrides,
  inspectedAtomId,
  interactionLocked,
  materialFamily,
  measuredAtomIds = [],
  meshDetail,
  onInspect,
  onMeasure,
  onPulse,
  onLockedInteractionAttempt,
  opacity,
  pulseAtomId,
  pulseToken,
  radiusModel,
  radiusScale,
}: {
  atoms: AtomSpec[];
  colorScheme: StyleState["colorScheme"];
  colorOverrides?: ElementColorOverrides;
  inspectedAtomId: string | null;
  interactionLocked: boolean;
  materialFamily: ResolvedStructureMaterialFamily;
  measuredAtomIds?: string[];
  meshDetail: SceneMeshDetail;
  onInspect?: (atomId: string | null) => void;
  onMeasure?: (atomId: string) => void;
  onPulse?: (atomId: string) => void;
  onLockedInteractionAttempt?: () => void;
  opacity: number;
  pulseAtomId: string | null;
  pulseToken: number;
  radiusModel: AtomRadiusModel;
  radiusScale: number;
}) {
  const meshRef = useRef<InstancedMesh | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const isTransparent = opacity < 1;
  const atomColorInstances = useMemo<AtomColorInstanceSpec[]>(
    () =>
      atoms.map((atom) => {
        const color = atomColorForScheme(atom, colorScheme, colorOverrides);
        return {
          atom,
          baseColor: new Color(color),
          color,
        };
      }),
    [atoms, colorOverrides, colorScheme],
  );
  const atomInstances = useMemo<AtomInstanceSpec[]>(
    () =>
      atomColorInstances.map((instance) => ({
        ...instance,
        radius: atomRadiusForModel(instance.atom, radiusModel) * radiusScale,
      })),
    [atomColorInstances, radiusModel, radiusScale],
  );
  const atomIndexById = useMemo(() => {
    const indexById = new Map<string, number>();
    atomInstances.forEach((instance, index) => {
      indexById.set(instance.atom.id, index);
    });
    return indexById;
  }, [atomInstances]);
  const inspectedInstance = instanceForAtomId(
    atomInstances,
    atomIndexById,
    inspectedAtomId,
  );
  const measuredInstances = measuredAtomIds.flatMap((atomId) => {
    const instance = instanceForAtomId(atomInstances, atomIndexById, atomId);
    return instance ? [instance] : [];
  });
  const activePulse = pulseAtomId && pulseToken !== 0
    ? { atomId: pulseAtomId, token: pulseToken }
    : null;
  const pulseInstance = inspectedInstance || !activePulse
    ? null
    : instanceForAtomId(atomInstances, atomIndexById, activePulse.atomId);
  const activeHighlight = inspectedInstance ?? pulseInstance;

  const handlePulseComplete = useCallback(() => {}, []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    const quaternion = new Quaternion();
    for (let index = 0; index < atomInstances.length; index += 1) {
      const instance = atomInstances[index]!;
      position.fromArray(instance.atom.position);
      scale.setScalar(instance.radius);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    }

    mesh.count = atomInstances.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [atomInstances, invalidate]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    for (let index = 0; index < atomColorInstances.length; index += 1) {
      const instance = atomColorInstances[index]!;
      mesh.setColorAt(index, instance.baseColor);
    }

    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    invalidate();
  }, [atomColorInstances, invalidate]);

  const atomForEvent = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (event.instanceId === undefined) {
        return null;
      }

      return atomInstances[event.instanceId]?.atom ?? null;
    },
    [atomInstances],
  );

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const atom = atomForEvent(event);
      if (!atom) {
        return;
      }

      event.stopPropagation();
      if (interactionLocked) {
        return;
      }

      if (event.nativeEvent.ctrlKey) {
        onMeasure?.(atom.id);
        return;
      }

      onPulse?.(atom.id);
    },
    [atomForEvent, interactionLocked, onPulse],
  );

  const handleDoubleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const atom = atomForEvent(event);
      if (!atom) {
        return;
      }

      event.stopPropagation();
      if (interactionLocked) {
        onLockedInteractionAttempt?.();
        return;
      }

      if (event.nativeEvent.ctrlKey) {
        return;
      }

      onInspect?.(atom.id);
    },
    [atomForEvent, interactionLocked, onInspect, onLockedInteractionAttempt],
  );

  if (atomInstances.length === 0) {
    return null;
  }

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, atomInstances.length]}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        <sphereGeometry
          args={[
            1,
            meshDetail.sphereWidthSegments,
            meshDetail.sphereHeightSegments,
          ]}
        />
        <StructureMaterial
          color="#ffffff"
          depthWrite={!isTransparent}
          materialFamily={materialFamily}
          opacity={opacity}
          transparent={isTransparent}
        />
      </instancedMesh>
      {activeHighlight ? (
        <InstancedAtomHighlightAnimator
          key={[
            activeHighlight.instance.atom.id,
            inspectedInstance ? "selected" : "pulse",
            inspectedInstance ? "" : pulseToken,
            activeHighlight.instance.color,
          ].join(":")}
          baseColor={activeHighlight.instance.baseColor}
          index={activeHighlight.index}
          inspected={inspectedInstance !== null}
          meshRef={meshRef}
          onComplete={handlePulseComplete}
        />
      ) : null}
      {inspectedInstance ? (
        <InstancedAtomSelectionRing
          key={inspectedInstance.instance.atom.id}
          position={inspectedInstance.instance.atom.position}
          radius={inspectedInstance.instance.radius}
        />
      ) : null}
      {measuredInstances.map(({ instance }) => (
        <InstancedAtomSelectionRing
          key={`measure-${instance.atom.id}`}
          position={instance.atom.position}
          radius={instance.radius}
        />
      ))}
    </>
  );
}

function instanceForAtomId(
  atomInstances: AtomInstanceSpec[],
  atomIndexById: Map<string, number>,
  atomId: string | null,
): { index: number; instance: AtomInstanceSpec } | null {
  if (!atomId) {
    return null;
  }

  const index = atomIndexById.get(atomId);
  if (index === undefined) {
    return null;
  }

  const instance = atomInstances[index];
  return instance ? { index, instance } : null;
}

function setAtomInstanceColor(
  mesh: InstancedMesh,
  index: number,
  color: Color,
) {
  mesh.setColorAt(index, color);
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }
}

function InstancedAtomHighlightAnimator({
  baseColor,
  index,
  inspected,
  meshRef,
  onComplete,
}: {
  baseColor: Color;
  index: number;
  inspected: boolean;
  meshRef: { current: InstancedMesh | null };
  onComplete: () => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const startTimeRef = useRef(performance.now());
  const isActiveRef = useRef(true);

  useEffect(() => {
    startTimeRef.current = performance.now();
    isActiveRef.current = true;
    invalidate();

    return () => {
      const mesh = meshRef.current;
      if (mesh) {
        setAtomInstanceColor(mesh, index, baseColor);
        invalidate();
      }
    };
  }, [baseColor, index, inspected, invalidate, meshRef]);

  useFrame(() => {
    if (!isActiveRef.current) {
      return;
    }

    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    const elapsedMs = performance.now() - startTimeRef.current;
    const targetMix = inspected
      ? ATOM_HIGHLIGHT_SELECTED_COLOR_MIX
      : ATOM_HIGHLIGHT_PULSE_COLOR_MIX;
    const durationMs = inspected ? ATOM_HIGHLIGHT_SELECT_MS : ATOM_HIGHLIGHT_PULSE_MS;
    const progress = Math.min(1, elapsedMs / durationMs);
    const fade = inspected ? easeOutCubic(progress) : atomPulseFade(progress);
    const color = baseColor.clone().lerp(ATOM_HIGHLIGHT_TARGET_COLOR, targetMix * fade);
    setAtomInstanceColor(mesh, index, color);

    if (progress >= 1) {
      if (!inspected) {
        setAtomInstanceColor(mesh, index, baseColor);
        onComplete();
      }
      isActiveRef.current = false;
      return;
    }

    invalidate();
  });

  return null;
}

function InstancedAtomSelectionRing({
  position,
  radius,
}: {
  position: VectorTuple;
  radius: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const ringGroupRef = useRef<Group | null>(null);
  const ringMaterialRef = useRef<SpriteMaterial | null>(null);
  const startTimeRef = useRef(performance.now());
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    startTimeRef.current = performance.now();
    setIsActive(true);
    invalidate();
  }, [invalidate]);

  useFrame(() => {
    if (!isActive) {
      return;
    }

    const ringGroup = ringGroupRef.current;
    const ringMaterial = ringMaterialRef.current;
    if (!ringGroup || !ringMaterial) {
      return;
    }

    const progress = Math.min(
      1,
      (performance.now() - startTimeRef.current) / ATOM_HIGHLIGHT_SELECT_MS,
    );
    const easedProgress = easeOutCubic(progress);
    const scale =
      ATOM_SELECTION_RING_PULSE_MIN_SCALE +
      (ATOM_SELECTION_RING_SELECTED_SCALE - ATOM_SELECTION_RING_PULSE_MIN_SCALE) *
        easedProgress;
    ringGroup.scale.setScalar(scale);
    ringMaterial.opacity = ATOM_SELECTION_RING_SELECTED_OPACITY * easedProgress;

    if (progress >= 1) {
      setIsActive(false);
      return;
    }

    invalidate();
  });

  return (
    <AtomSelectionRing
      materialRef={ringMaterialRef}
      opacity={0}
      position={position}
      radius={radius}
      ringRef={ringGroupRef}
      scale={ATOM_SELECTION_RING_PULSE_MIN_SCALE}
    />
  );
}
