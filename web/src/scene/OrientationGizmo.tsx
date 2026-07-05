import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  type CSSProperties,
  type MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CanvasTexture,
  Color,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  OrthographicCamera,
  Quaternion,
  Vector3,
} from "three";

import type { CameraOrientationRef } from "./LatticeScene";
import type { CameraPoseSnapshot } from "./cameraPose";
import { CameraHeadlight } from "./CameraHeadlight";
import {
  computeOrientationGizmoAxes,
  type OrientationGizmoAxisLabel,
  type OrientationGizmoAxisSpec,
} from "./orientationGizmoMath";
import { pickOrientationGizmoAxis } from "./orientationGizmoHitTesting";
import { PREVIEW_AMBIENT_LIGHT_INTENSITY } from "./renderAppearance";
import type { VectorTuple } from "./viewMath";

export const ORIENTATION_GIZMO_CAMERA_POSITION: VectorTuple = [0, 0, 5];
const BASE_CAMERA_ZOOM = 53;
const BASE_INNER_CANVAS_SIZE = 588;
const CONE_LENGTH = 0.24;
const CONE_RADIUS = 0.13;
export const ORIENTATION_GIZMO_SCALE = 1.36;
const GIZMO_CANVAS_SCALE = 2.4;
const AXIS_HIT_RADIUS_PX = 18;
export const ORIENTATION_GIZMO_LABEL_DISTANCE = 1.3;
const LABEL_HIT_RADIUS_PX = 24;
const LABEL_SCALE = 0.38;
const LABEL_FILL_COLOR = "#343434";
const LABEL_HALO_COLOR = "#ffffff";
const LABEL_TEXTURE_SIZE = 1024;
const LABEL_FONT_SIZE = 608;
const LABEL_OUTLINE_WIDTH = 66;
const ORIGIN_SPHERE_RADIUS = 0.13;
const SHAFT_LENGTH = 0.82;
const SHAFT_RADIUS = 0.055;
export const ORIENTATION_GIZMO_ZOOM_PER_CANVAS_PIXEL = BASE_CAMERA_ZOOM / BASE_INNER_CANVAS_SIZE;
const Y_AXIS = new Vector3(0, 1, 0);

export function OrientationGizmo({
  cameraOrientationRef,
  cellVectors,
  className,
  frameRequestRef,
  onAxisClick,
  orientationVersion = 0,
  showLabels = true,
  style,
}: {
  cameraOrientationRef: CameraOrientationRef;
  cellVectors: VectorTuple[];
  className?: string;
  frameRequestRef?: MutableRefObject<(() => void) | null>;
  onAxisClick?: (axis: OrientationGizmoAxisLabel) => void;
  orientationVersion?: number;
  showLabels?: boolean;
  style?: CSSProperties;
}) {
  const visualCanvasRef = useRef<HTMLDivElement | null>(null);
  const hoveredAxisRef = useRef<OrientationGizmoAxisLabel | null>(null);
  const lastPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const suppressNextClickRef = useRef(false);
  const clickSuppressionTimeoutRef = useRef<number | null>(null);
  const axes = useMemo(() => computeOrientationGizmoAxes(cellVectors), [cellVectors]);
  const [hoveredAxis, setHoveredAxis] = useState<OrientationGizmoAxisLabel | null>(null);

  const pickAxisFromPointer = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const rect = visualCanvasRef.current?.getBoundingClientRect();
      if (!rect) {
        return null;
      }

      return pickOrientationGizmoAxis({
        axes,
        cameraOrientation: cameraOrientationRef.current,
        config: {
          axisHitRadiusPx: AXIS_HIT_RADIUS_PX,
          axisStartDistance: ORIGIN_SPHERE_RADIUS * 1.25,
          axisTipDistance: SHAFT_LENGTH + CONE_LENGTH,
          gizmoScale: ORIENTATION_GIZMO_SCALE,
          labelDistance: ORIENTATION_GIZMO_LABEL_DISTANCE,
          labelHitRadiusPx: LABEL_HIT_RADIUS_PX,
          pixelsPerWorldUnit:
            Math.min(rect.width, rect.height) * ORIENTATION_GIZMO_ZOOM_PER_CANVAS_PIXEL,
        },
        pointer: {
          clientX: event.clientX,
          clientY: event.clientY,
        },
        rect,
      });
    },
    [axes, cameraOrientationRef],
  );

  const updateHoveredAxis = useCallback((nextAxis: OrientationGizmoAxisLabel | null) => {
    if (hoveredAxisRef.current === nextAxis) {
      return;
    }

    hoveredAxisRef.current = nextAxis;
    setHoveredAxis(nextAxis);
  }, []);

  useEffect(() => {
    if (!hoveredAxis) {
      return;
    }

    const previousBodyCursor = document.body.style.cursor;
    const previousDocumentCursor = document.documentElement.style.cursor;
    document.body.style.cursor = "pointer";
    document.documentElement.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = previousBodyCursor;
      document.documentElement.style.cursor = previousDocumentCursor;
    };
  }, [hoveredAxis]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      lastPointerRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
      };
      updateHoveredAxis(pickAxisFromPointer(event));
    }

    function handlePointerDown(event: PointerEvent) {
      lastPointerRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
      };
      const axis = pickAxisFromPointer(event);
      if (!axis) {
        return;
      }

      updateHoveredAxis(null);
      suppressNextClickRef.current = true;
      if (clickSuppressionTimeoutRef.current) {
        window.clearTimeout(clickSuppressionTimeoutRef.current);
      }
      clickSuppressionTimeoutRef.current = window.setTimeout(() => {
        suppressNextClickRef.current = false;
        clickSuppressionTimeoutRef.current = null;
      }, 750);
      event.preventDefault();
      event.stopImmediatePropagation();
      onAxisClick?.(axis);
    }

    function handleClick(event: MouseEvent) {
      if (!suppressNextClickRef.current) {
        return;
      }

      suppressNextClickRef.current = false;
      if (clickSuppressionTimeoutRef.current) {
        window.clearTimeout(clickSuppressionTimeoutRef.current);
        clickSuppressionTimeoutRef.current = null;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    function clearHover() {
      updateHoveredAxis(null);
    }

    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("click", handleClick, true);
    window.addEventListener("blur", clearHover);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("blur", clearHover);
      if (clickSuppressionTimeoutRef.current) {
        window.clearTimeout(clickSuppressionTimeoutRef.current);
      }
    };
  }, [onAxisClick, pickAxisFromPointer, updateHoveredAxis]);

  useEffect(() => {
    const lastPointer = lastPointerRef.current;
    if (!lastPointer) {
      return;
    }

    updateHoveredAxis(pickAxisFromPointer(lastPointer));
  }, [orientationVersion, pickAxisFromPointer, updateHoveredAxis]);

  return (
    <div
      aria-label="Orientation gizmo"
      className={className}
      style={{ ...style, overflow: "visible", pointerEvents: "none" }}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2"
        ref={visualCanvasRef}
        style={{
          height: `${GIZMO_CANVAS_SCALE * 100}%`,
          transform: "translate(-50%, -50%)",
          width: `${GIZMO_CANVAS_SCALE * 100}%`,
        }}
      >
        <Canvas
          orthographic
          camera={{
            position: ORIENTATION_GIZMO_CAMERA_POSITION,
            zoom: BASE_CAMERA_ZOOM,
            near: 0.1,
            far: 20,
          }}
          dpr={[1, 2]}
          frameloop="demand"
          gl={{ antialias: true, alpha: true }}
          style={{ pointerEvents: "none" }}
        >
          <ambientLight intensity={PREVIEW_AMBIENT_LIGHT_INTENSITY} />
          <CameraHeadlight />
          <OrientationGizmoFrameRequester
            frameRequestRef={frameRequestRef}
            orientationVersion={orientationVersion}
          />
          <ResponsiveGizmoCamera />
          <OrientationGizmoScene
            axes={axes}
            cameraOrientationRef={cameraOrientationRef}
            hoveredAxis={hoveredAxis}
            showLabels={showLabels}
          />
        </Canvas>
      </div>
    </div>
  );
}

function OrientationGizmoFrameRequester({
  frameRequestRef,
  orientationVersion,
}: {
  frameRequestRef?: MutableRefObject<(() => void) | null>;
  orientationVersion: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const requestFrame = useCallback(() => {
    invalidate();
  }, [invalidate]);

  useEffect(() => {
    if (!frameRequestRef) {
      return;
    }

    frameRequestRef.current = requestFrame;
    return () => {
      if (frameRequestRef.current === requestFrame) {
        frameRequestRef.current = null;
      }
    };
  }, [frameRequestRef, requestFrame]);

  useEffect(() => {
    requestFrame();
  }, [orientationVersion, requestFrame]);

  return null;
}

function ResponsiveGizmoCamera() {
  const { camera, invalidate, size } = useThree();

  useEffect(() => {
    if (!(camera instanceof OrthographicCamera)) {
      return;
    }

    camera.zoom = Math.min(size.width, size.height) * ORIENTATION_GIZMO_ZOOM_PER_CANVAS_PIXEL;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate, size.height, size.width]);

  return null;
}

function OrientationGizmoScene({
  axes,
  cameraOrientationRef,
  hoveredAxis,
  showLabels,
}: {
  axes: OrientationGizmoAxisSpec[];
  cameraOrientationRef: CameraOrientationRef;
  hoveredAxis: OrientationGizmoAxisLabel | null;
  showLabels: boolean;
}) {
  const groupRef = useRef<Group | null>(null);
  const nextRotationRef = useRef(new Quaternion());

  useFrame(() => {
    const group = groupRef.current;
    if (!group) {
      return;
    }

    group.quaternion.copy(nextRotationRef.current.copy(cameraOrientationRef.current).invert());
  });

  return (
    <group ref={groupRef}>
      <OrientationGizmoAxes
        axes={axes}
        hoveredAxis={hoveredAxis}
        showLabels={showLabels}
      />
    </group>
  );
}

export function StaticOrientationGizmoScene({
  axes,
  cameraPose,
  labelColor = LABEL_FILL_COLOR,
  labelHaloColor = LABEL_HALO_COLOR,
  showLabelHalo = true,
  showLabels = true,
}: {
  axes: OrientationGizmoAxisSpec[];
  cameraPose: CameraPoseSnapshot;
  labelColor?: string;
  labelHaloColor?: string;
  showLabelHalo?: boolean;
  showLabels?: boolean;
}) {
  const rotation = useMemo(
    () => new Quaternion(...cameraPose.quaternion).invert(),
    [cameraPose],
  );

  return (
    <group quaternion={rotation}>
      <OrientationGizmoAxes
        axes={axes}
        hoveredAxis={null}
        labelColor={labelColor}
        labelHaloColor={labelHaloColor}
        showLabelHalo={showLabelHalo}
        showLabels={showLabels}
      />
    </group>
  );
}

function OrientationGizmoAxes({
  axes,
  hoveredAxis,
  labelColor = LABEL_FILL_COLOR,
  labelHaloColor = LABEL_HALO_COLOR,
  showLabelHalo = true,
  showLabels = true,
}: {
  axes: OrientationGizmoAxisSpec[];
  hoveredAxis: OrientationGizmoAxisLabel | null;
  labelColor?: string;
  labelHaloColor?: string;
  showLabelHalo?: boolean;
  showLabels?: boolean;
}) {
  return (
    <group scale={ORIENTATION_GIZMO_SCALE}>
      {axes.map((axis) => (
        <AxisArrow
          axis={axis}
          hovered={axis.label === hoveredAxis}
          key={axis.label}
          labelColor={labelColor}
          labelHaloColor={labelHaloColor}
          showLabelHalo={showLabelHalo}
          showLabel={showLabels}
        />
      ))}
      <mesh renderOrder={4}>
        <sphereGeometry args={[ORIGIN_SPHERE_RADIUS, 40, 24]} />
        <meshLambertMaterial color="#f3f2ee" />
      </mesh>
    </group>
  );
}

function AxisArrow({
  axis,
  hovered,
  labelColor,
  labelHaloColor,
  showLabelHalo,
  showLabel,
}: {
  axis: OrientationGizmoAxisSpec;
  hovered: boolean;
  labelColor: string;
  labelHaloColor: string;
  showLabelHalo: boolean;
  showLabel: boolean;
}) {
  const axisRotation = useMemo(
    () => new Quaternion().setFromUnitVectors(Y_AXIS, new Vector3(...axis.direction)),
    [axis.direction],
  );
  const materialColor = hovered ? new Color(axis.color).lerp(new Color("#ffffff"), 0.3) : axis.color;
  const emissiveColor = hovered ? new Color(axis.color).lerp(new Color("#ffffff"), 0.5) : "#000000";

  return (
    <group quaternion={axisRotation}>
      <mesh position={[0, SHAFT_LENGTH / 2, 0]}>
        <cylinderGeometry args={[SHAFT_RADIUS, SHAFT_RADIUS, SHAFT_LENGTH, 32]} />
        <meshLambertMaterial
          color={materialColor}
          emissive={emissiveColor}
          emissiveIntensity={hovered ? 0.35 : 0}
        />
      </mesh>
      <mesh position={[0, SHAFT_LENGTH + CONE_LENGTH / 2, 0]}>
        <coneGeometry args={[CONE_RADIUS, CONE_LENGTH, 40]} />
        <meshLambertMaterial
          color={materialColor}
          emissive={emissiveColor}
          emissiveIntensity={hovered ? 0.35 : 0}
        />
      </mesh>
      {showLabel ? (
        <AxisLabel
          hovered={hovered}
          label={axis.label}
          labelColor={labelColor}
          labelHaloColor={labelHaloColor}
          showHalo={showLabelHalo}
          position={[0, ORIENTATION_GIZMO_LABEL_DISTANCE, 0]}
        />
      ) : null}
    </group>
  );
}

function AxisLabel({
  hovered,
  label,
  labelColor,
  labelHaloColor,
  position,
  showHalo,
}: {
  hovered: boolean;
  label: string;
  labelColor: string;
  labelHaloColor: string;
  position: VectorTuple;
  showHalo: boolean;
}) {
  const fillTexture = useMemo(() => createLabelAlphaMap(label, "fill"), [label]);
  const outlineTexture = useMemo(() => createLabelAlphaMap(label, "outline"), [label]);
  const fillColor = hovered ? "#111111" : labelColor;

  useEffect(() => () => fillTexture.dispose(), [fillTexture]);
  useEffect(() => () => outlineTexture.dispose(), [outlineTexture]);

  return (
    <group position={position}>
      {showHalo ? (
        <sprite
          renderOrder={9}
          scale={[LABEL_SCALE, LABEL_SCALE, 1]}
        >
          <spriteMaterial
            alphaMap={outlineTexture}
            color={labelHaloColor}
            depthTest
            depthWrite={false}
            alphaTest={0.18}
            transparent
          />
        </sprite>
      ) : null}
      <sprite
        renderOrder={10}
        scale={[LABEL_SCALE, LABEL_SCALE, 1]}
      >
        <spriteMaterial
          alphaMap={fillTexture}
          color={fillColor}
          depthTest
          depthWrite={false}
          alphaTest={0.08}
          transparent
        />
      </sprite>
    </group>
  );
}

function createLabelAlphaMap(label: string, layer: "fill" | "outline") {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = LABEL_TEXTURE_SIZE;
  canvas.height = LABEL_TEXTURE_SIZE;

  if (context) {
    context.fillStyle = "#000000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = `italic 500 ${LABEL_FONT_SIZE}px Geist, 'Helvetica Neue', Arial, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.miterLimit = 2;
    context.fillStyle = "#ffffff";
    if (layer === "outline") {
      drawLabelOutline(context, label);
    } else {
      context.fillText(label, canvas.width / 2, canvas.height / 2 + 4);
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = true;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;

  return texture;
}

function drawLabelOutline(context: CanvasRenderingContext2D, label: string) {
  const centerX = context.canvas.width / 2;
  const centerY = context.canvas.height / 2 + 4;

  context.lineWidth = LABEL_OUTLINE_WIDTH;
  context.strokeStyle = "#ffffff";
  context.strokeText(label, centerX, centerY);
}
