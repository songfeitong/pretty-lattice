import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Color, type Mesh, type MeshBasicMaterial, Quaternion, Vector3 } from "three";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

import type {
  CrystalCameraPrimaryDirection,
  CrystalCameraScreenDirection,
  VectorTuple,
} from "../../../../model";
import { UI_DARK_COLOR } from "../styles";

const SCREEN_AXIS_CAMERA_FOV = 42.5;
const SCREEN_AXIS_CAMERA_POSITION: VectorTuple = [0.558, 0.471, 6.139];
const SCREEN_AXIS_CAMERA_ROLL = 0.0149;
const SCREEN_AXIS_GIZMO_POSITION: VectorTuple = [-0.911, -0.691, 0.061];
const SCREEN_AXIS_ARROW_CONE_LENGTH = 0.31;
const SCREEN_AXIS_ARROW_CONE_RADIUS = 0.152;
const SCREEN_AXIS_ARROW_LENGTH = 2.27;
const SCREEN_AXIS_ARROW_RADIUS = 0.083;
const SCREEN_AXIS_ARROW_SELECTED_RADIUS = 0.101;
const SCREEN_AXIS_ORIGIN_RADIUS = 0.1;
const SCREEN_AXIS_SELECTED_COLOR = "#505050";
const SCREEN_AXIS_HOVER_COLOR = "#a0a0a0";
const SCREEN_AXIS_MUTED_COLOR = "#d6d6d6";
const SCREEN_AXIS_TRANSITION_SECONDS = 0.09;
const SCREEN_AXIS_OUTWARD_ARROW_LENGTH = 2.56;
const SCREEN_AXIS_OUTWARD_CONE_RADIUS = 0.1;
const SCREEN_AXIS_OUTWARD_SHAFT_TIP_RADIUS_SCALE = 0.6;
const SCREEN_AXIS_Y = new Vector3(0, 1, 0);
const SCREEN_AXIS_GIZMO_AXES: readonly {
  direction: CrystalCameraScreenDirection;
  label: "X" | "Y" | "Z";
  vector: VectorTuple;
}[] = [
  { direction: "right", label: "X", vector: [1, 0, 0] },
  { direction: "upward", label: "Y", vector: [0, 1, 0] },
  { direction: "outward", label: "Z", vector: [0, 0, 1] },
];

const SCREEN_AXIS_HITBOX_ORIGIN = [4.05, 3.8] as const;
const SCREEN_AXIS_HITBOX_START_WIDTH_REM = 1.3;
const SCREEN_AXIS_HITBOXES: Record<
  CrystalCameraScreenDirection,
  {
    angleOffset: number;
    endWidth: number;
    target: readonly [number, number];
  }
> = {
  outward: { angleOffset: -10, endWidth: 3, target: [0.3, 6.95] },
  right: { angleOffset: 8, endWidth: 3.1, target: [9.65, 4.55] },
  upward: { angleOffset: 0, endWidth: 2.7, target: [4.0, -0.25] },
};

export function ScreenAxisChooser({
  ariaLabelledBy,
  onValueChange,
  value,
}: {
  ariaLabelledBy: string;
  onValueChange: (value: CrystalCameraPrimaryDirection) => void;
  value: CrystalCameraPrimaryDirection;
}) {
  const [hoveredAxis, setHoveredAxis] = useState<CrystalCameraScreenDirection | null>(null);

  return (
    <div
      role="group"
      aria-labelledby={ariaLabelledBy}
      className="relative h-[120px] w-[10.75rem] select-none"
      onMouseLeave={() => setHoveredAxis(null)}
    >
      <Canvas
        aria-hidden="true"
        camera={{
          fov: SCREEN_AXIS_CAMERA_FOV,
          position: SCREEN_AXIS_CAMERA_POSITION,
          near: 0.1,
          far: 30,
        }}
        dpr={[1, 2]}
        frameloop="demand"
        gl={{ antialias: true, alpha: true }}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ pointerEvents: "none" }}
      >
        <ScreenAxisCameraSetup />
        <ScreenAxisGizmoScene hoveredAxis={hoveredAxis} selectedAxis={value} />
      </Canvas>
      <ScreenAxisOverlayLabel
        direction="upward"
        hoveredAxis={hoveredAxis}
        selectedAxis={value}
        className="left-[4.325rem] top-[0.65rem]"
      >
        Y
      </ScreenAxisOverlayLabel>
      <ScreenAxisOverlayLabel
        direction="right"
        hoveredAxis={hoveredAxis}
        selectedAxis={value}
        className="left-[7.8rem] top-[5.15rem]"
      >
        X
      </ScreenAxisOverlayLabel>
      <ScreenAxisOverlayLabel
        direction="outward"
        hoveredAxis={hoveredAxis}
        selectedAxis={value}
        className="left-[1.6rem] top-[6.5rem]"
      >
        Z
      </ScreenAxisOverlayLabel>
      <button
        type="button"
        aria-label="X Right"
        aria-pressed={value === "right"}
        className="absolute z-10 cursor-pointer outline-none focus-visible:ring-[2px] focus-visible:ring-ring/25"
        style={screenAxisHitboxStyle("right")}
        onClick={() => onValueChange("right")}
        onMouseEnter={() => setHoveredAxis("right")}
        onMouseLeave={() => setHoveredAxis(null)}
      />
      <button
        type="button"
        aria-label="Y Up"
        aria-pressed={value === "upward"}
        className="absolute z-10 cursor-pointer outline-none focus-visible:ring-[2px] focus-visible:ring-ring/25"
        style={screenAxisHitboxStyle("upward")}
        onClick={() => onValueChange("upward")}
        onMouseEnter={() => setHoveredAxis("upward")}
        onMouseLeave={() => setHoveredAxis(null)}
      />
      <button
        type="button"
        aria-label="Z Out"
        aria-pressed={value === "outward"}
        className="absolute z-10 cursor-pointer outline-none focus-visible:ring-[2px] focus-visible:ring-ring/25"
        style={screenAxisHitboxStyle("outward")}
        onClick={() => onValueChange("outward")}
        onMouseEnter={() => setHoveredAxis("outward")}
        onMouseLeave={() => setHoveredAxis(null)}
      />
    </div>
  );
}

function ScreenAxisOverlayLabel({
  children,
  className,
  direction,
  hoveredAxis,
  selectedAxis,
}: {
  children: ReactNode;
  className: string;
  direction: CrystalCameraScreenDirection;
  hoveredAxis: CrystalCameraScreenDirection | null;
  selectedAxis: CrystalCameraPrimaryDirection;
}) {
  const isEmphasized = direction === selectedAxis || direction === hoveredAxis;

  return (
    <span
      aria-hidden="true"
      data-screen-axis-label={direction}
      className={cn(
        "pointer-events-none absolute z-[5] select-none text-[11px] font-semibold italic leading-none transition-colors",
        isEmphasized ? "text-foreground" : "text-muted-foreground/55",
        className,
      )}
    >
      {children}
    </span>
  );
}

function ScreenAxisCameraSetup() {
  const { camera } = useThree();

  useEffect(() => {
    const cameraPosition = new Vector3(...SCREEN_AXIS_CAMERA_POSITION);
    const viewDirection = cameraPosition.multiplyScalar(-1).normalize();
    const cameraUp = new Vector3(0, 1, 0);

    cameraUp
      .addScaledVector(viewDirection, -cameraUp.dot(viewDirection))
      .normalize()
      .applyAxisAngle(viewDirection, SCREEN_AXIS_CAMERA_ROLL);
    camera.up.copy(cameraUp);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

function ScreenAxisGizmoScene({
  hoveredAxis,
  selectedAxis,
}: {
  hoveredAxis: CrystalCameraScreenDirection | null;
  selectedAxis: CrystalCameraPrimaryDirection;
}) {
  return (
    <group position={SCREEN_AXIS_GIZMO_POSITION}>
      {SCREEN_AXIS_GIZMO_AXES.map((axis) => {
        const hovered = axis.direction === hoveredAxis;
        const selected = axis.direction === selectedAxis;

        return (
          <ScreenAxisArrow
            axis={axis}
            hovered={hovered}
            key={axis.direction}
            selected={selected}
          />
        );
      })}
      <mesh renderOrder={20}>
        <sphereGeometry args={[SCREEN_AXIS_ORIGIN_RADIUS * 1.35, 32, 16]} />
        <meshBasicMaterial color={UI_DARK_COLOR} depthTest={false} />
      </mesh>
      <mesh renderOrder={21}>
        <sphereGeometry args={[SCREEN_AXIS_ORIGIN_RADIUS, 32, 16]} />
        <meshBasicMaterial color="#f7f7f5" depthTest={false} />
      </mesh>
    </group>
  );
}

function ScreenAxisArrow({
  axis,
  hovered,
  selected,
}: {
  axis: (typeof SCREEN_AXIS_GIZMO_AXES)[number];
  hovered: boolean;
  selected: boolean;
}) {
  const shaftMaterialRef = useRef<MeshBasicMaterial | null>(null);
  const coneMaterialRef = useRef<MeshBasicMaterial | null>(null);
  const shaftMeshRef = useRef<Mesh | null>(null);
  const coneMeshRef = useRef<Mesh | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const axisDirection = useMemo(() => new Vector3(...axis.vector).normalize(), [axis.vector]);
  const axisRotation = useMemo(
    () => new Quaternion().setFromUnitVectors(SCREEN_AXIS_Y, axisDirection),
    [axisDirection],
  );
  const isHighlighted = selected || hovered;
  const axisColor = selected
    ? SCREEN_AXIS_SELECTED_COLOR
    : hovered
      ? SCREEN_AXIS_HOVER_COLOR
      : SCREEN_AXIS_MUTED_COLOR;
  const targetColor = useMemo(() => new Color(axisColor), [axisColor]);
  const initialAxisColorRef = useRef(axisColor);
  const shaftLength = axis.direction === "outward"
    ? SCREEN_AXIS_OUTWARD_ARROW_LENGTH
    : SCREEN_AXIS_ARROW_LENGTH;
  const shaftRadius = SCREEN_AXIS_ARROW_SELECTED_RADIUS;
  const targetShaftScale = isHighlighted
    ? 1
    : SCREEN_AXIS_ARROW_RADIUS / SCREEN_AXIS_ARROW_SELECTED_RADIUS;
  const initialShaftScaleRef = useRef(targetShaftScale);
  const shaftTopRadius = axis.direction === "outward"
    ? shaftRadius * SCREEN_AXIS_OUTWARD_SHAFT_TIP_RADIUS_SCALE
    : shaftRadius;
  const shaftBottomRadius = shaftRadius;
  const coneLength = SCREEN_AXIS_ARROW_CONE_LENGTH;
  const coneRadius = axis.direction === "outward"
    ? SCREEN_AXIS_OUTWARD_CONE_RADIUS
    : SCREEN_AXIS_ARROW_CONE_RADIUS;
  const targetConeScale = isHighlighted ? 1 : 1 / 1.04;
  const initialConeScaleRef = useRef(targetConeScale);

  useEffect(() => {
    invalidate();
  }, [invalidate, targetColor, targetConeScale, targetShaftScale]);

  useFrame((_, delta) => {
    const alpha = screenAxisTransitionAlpha(delta);
    let shouldContinue = false;

    for (const material of [shaftMaterialRef.current, coneMaterialRef.current]) {
      if (material === null) {
        continue;
      }

      if (screenAxisColorDistanceSquared(material.color, targetColor) < 0.00002) {
        material.color.copy(targetColor);
        continue;
      }

      material.color.lerp(targetColor, alpha);
      shouldContinue = true;
    }

    const shaftMesh = shaftMeshRef.current;
    if (shaftMesh !== null) {
      const nextScale = screenAxisLerpScale(shaftMesh.scale.x, targetShaftScale, alpha);
      shaftMesh.scale.set(nextScale, 1, nextScale);
      shouldContinue ||= nextScale !== targetShaftScale;
    }

    const coneMesh = coneMeshRef.current;
    if (coneMesh !== null) {
      const nextScale = screenAxisLerpScale(coneMesh.scale.x, targetConeScale, alpha);
      coneMesh.scale.set(nextScale, 1, nextScale);
      shouldContinue ||= nextScale !== targetConeScale;
    }

    if (shouldContinue) {
      invalidate();
    }
  });

  return (
    <group quaternion={axisRotation}>
      <mesh
        ref={shaftMeshRef}
        position={[0, shaftLength / 2, 0]}
        renderOrder={isHighlighted ? 8 : 2}
        scale={[initialShaftScaleRef.current, 1, initialShaftScaleRef.current]}
      >
        <cylinderGeometry args={[shaftTopRadius, shaftBottomRadius, shaftLength, 24]} />
        <meshBasicMaterial ref={shaftMaterialRef} color={initialAxisColorRef.current} />
      </mesh>
      <mesh
        ref={coneMeshRef}
        position={[0, shaftLength + coneLength / 2, 0]}
        renderOrder={isHighlighted ? 9 : 3}
        scale={[initialConeScaleRef.current, 1, initialConeScaleRef.current]}
      >
        <coneGeometry args={[coneRadius * 1.04, coneLength, 32]} />
        <meshBasicMaterial ref={coneMaterialRef} color={initialAxisColorRef.current} />
      </mesh>
    </group>
  );
}

function screenAxisTransitionAlpha(deltaSeconds: number) {
  return 1 - Math.pow(0.001, deltaSeconds / SCREEN_AXIS_TRANSITION_SECONDS);
}

function screenAxisColorDistanceSquared(a: Color, b: Color) {
  const red = a.r - b.r;
  const green = a.g - b.g;
  const blue = a.b - b.b;
  return red * red + green * green + blue * blue;
}

function screenAxisLerpScale(current: number, target: number, alpha: number) {
  const next = current + (target - current) * alpha;
  return Math.abs(next - target) < 0.001 ? target : next;
}

function screenAxisHitboxStyle(direction: CrystalCameraScreenDirection): CSSProperties {
  const hitbox = SCREEN_AXIS_HITBOXES[direction];
  const [originX, originY] = SCREEN_AXIS_HITBOX_ORIGIN;
  const [targetX, targetY] = hitbox.target;
  const deltaX = targetX - originX;
  const deltaY = targetY - originY;
  const length = Math.hypot(deltaX, deltaY);
  const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI) + hitbox.angleOffset;
  const startInset = 50 - (SCREEN_AXIS_HITBOX_START_WIDTH_REM / hitbox.endWidth) * 50;

  return {
    clipPath: `polygon(0 ${startInset}%, 100% 0, 100% 100%, 0 ${100 - startInset}%)`,
    height: `${hitbox.endWidth}rem`,
    left: `${originX}rem`,
    top: `${originY}rem`,
    transform: `translateY(-50%) rotate(${angle}deg)`,
    transformOrigin: "left center",
    width: `${length}rem`,
  };
}
