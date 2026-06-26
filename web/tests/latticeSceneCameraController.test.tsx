import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import {
  Children,
  isValidElement,
  type ReactNode,
} from "react";
import { OrthographicCamera, Vector3 } from "three";

import type { SceneSpec } from "../src/api/scene";

class MockControls {
  enabled = true;
  maxZoom = Infinity;
  minZoom = 0;
  keyState = -1;
  mouseButtons: Record<string, unknown> = {};
  noPan = false;
  noRotate = false;
  noZoom = false;
  state = -1;
  target = new Vector3();
  touches: Record<string, unknown> = {};
  updateCalls = 0;
  private listeners = new Map<string, Set<() => void>>();

  constructor() {
    latestControls = this;
  }

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  dispose() {}

  handleResize() {}

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchTestEvent(type: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }

  update() {
    this.updateCalls += 1;
  }
}

class MockOrbitControls extends MockControls {}

class MockTrackballControls extends MockControls {}

let mockCamera = new OrthographicCamera();
let latestFrameCallback: (() => void) | null = null;
let latestControls: MockControls | null = null;

function resetMockCamera() {
  mockCamera = new OrthographicCamera();
  latestFrameCallback = null;
  latestControls = null;
}

mock.module("@react-three/fiber", () => ({
  Canvas: ({
    children,
  }: {
    children: ReactNode;
  }) => (
    <div data-testid="lattice-canvas">
      {Children.toArray(children).filter(
        (child) =>
          isValidElement(child) &&
          typeof child.type === "function" &&
          child.type.name === "PreviewCameraController",
      )}
    </div>
  ),
  useFrame: (callback: () => void) => {
    latestFrameCallback = callback;
  },
  useThree: () => ({
    camera: mockCamera,
    gl: {
      domElement: document.createElement("canvas"),
    },
    size: {
      height: 800,
      width: 1000,
    },
  }),
}));

mock.module("three/examples/jsm/controls/OrbitControls.js", () => ({
  OrbitControls: MockOrbitControls,
}));

mock.module("three/examples/jsm/controls/TrackballControls.js", () => ({
  TrackballControls: MockTrackballControls,
}));

const { createDefaultComponentOpacity, createDefaultStyle } = await import("../src/app/settings");
const { createCameraInteractionStore } = await import("../src/app/cameraInteractionStore");
const { LatticeScene } = await import("../src/scene/LatticeScene");
const {
  applyCrystalCameraRoll,
  createDefaultCrystalCameraState,
  stateWithDirectAxis,
} = await import("../src/scene/crystalCamera");

afterEach(() => {
  resetMockCamera();
});

describe("LatticeScene camera commands", () => {
  test("applies each command pose in the same render instead of lagging one command behind", () => {
    const scene = orthogonalScene();
    const defaultCamera = createDefaultCrystalCameraState();
    const aCamera = stateWithDirectAxis(scene.cell.vectors, defaultCamera, "a");
    const bCamera = stateWithDirectAxis(scene.cell.vectors, defaultCamera, "b");
    const props = {
      cameraCommandVersion: 0,
      cameraInteractionStore: createCameraInteractionStore(),
      cameraState: defaultCamera,
      componentOpacity: createDefaultComponentOpacity(),
      interactionLocked: false,
      interactionMode: "trackball" as const,
      renderBackend: "webgl" as const,
      resetCounter: 0,
      scene,
      style: createDefaultStyle(),
    };

    const { rerender } = render(<LatticeScene {...props} />);

    rerender(
      <LatticeScene
        {...props}
        cameraCommandVersion={1}
        cameraState={aCamera}
      />,
    );
    expect(mockCamera.position.x).toBeGreaterThan(0);
    expect(Math.abs(mockCamera.position.y)).toBeLessThan(1e-8);
    expect(Math.abs(mockCamera.position.z)).toBeLessThan(1e-8);

    rerender(
      <LatticeScene
        {...props}
        cameraCommandVersion={2}
        cameraState={bCamera}
      />,
    );
    expect(Math.abs(mockCamera.position.x)).toBeLessThan(1e-8);
    expect(mockCamera.position.y).toBeGreaterThan(0);
    expect(Math.abs(mockCamera.position.z)).toBeLessThan(1e-8);
  });

  test("animates flagged camera commands from the current pose to the target pose", () => {
    let now = 0;
    const nowSpy = spyOn(performance, "now").mockImplementation(() => now);
    const scene = orthogonalScene();
    const defaultCamera = createDefaultCrystalCameraState();
    const aCamera = stateWithDirectAxis(scene.cell.vectors, defaultCamera, "a");
    const props = {
      cameraAnimatedCommandVersion: 0,
      cameraCommandVersion: 0,
      cameraInteractionStore: createCameraInteractionStore(),
      cameraState: defaultCamera,
      componentOpacity: createDefaultComponentOpacity(),
      interactionLocked: false,
      interactionMode: "trackball" as const,
      renderBackend: "webgl" as const,
      resetCounter: 0,
      scene,
      style: createDefaultStyle(),
    };
    const animationActiveChanges: boolean[] = [];

    try {
      const { rerender } = render(<LatticeScene {...props} />);
      expect(Math.abs(mockCamera.position.x)).toBeLessThan(1e-8);
      expect(mockCamera.position.z).toBeGreaterThan(0);

      rerender(
        <LatticeScene
          {...props}
          cameraAnimatedCommandVersion={1}
          cameraCommandVersion={1}
          cameraState={aCamera}
          onCameraCommandAnimationActiveChange={(isActive) => {
            animationActiveChanges.push(isActive);
          }}
        />,
      );
      expect(Math.abs(mockCamera.position.x)).toBeLessThan(1e-8);
      expect(mockCamera.position.z).toBeGreaterThan(0);
      expect(animationActiveChanges).toEqual([true]);

      now = 130;
      act(() => latestFrameCallback?.());
      expect(mockCamera.position.x).toBeGreaterThan(0);
      expect(mockCamera.position.z).toBeGreaterThan(0);

      now = 280;
      act(() => latestFrameCallback?.());
      expect(mockCamera.position.x).toBeGreaterThan(0);
      expect(Math.abs(mockCamera.position.y)).toBeLessThan(1e-8);
      expect(Math.abs(mockCamera.position.z)).toBeLessThan(1e-8);
      expect(animationActiveChanges).toEqual([true, false]);
    } finally {
      nowSpy.mockRestore();
    }
  });

  test("applies external zoom without advancing control damping", () => {
    const scene = orthogonalScene();
    const defaultCamera = createDefaultCrystalCameraState();
    const cameraInteractionStore = createCameraInteractionStore();
    const props = {
      cameraCommandVersion: 0,
      cameraInteractionStore,
      cameraState: defaultCamera,
      componentOpacity: createDefaultComponentOpacity(),
      interactionLocked: false,
      interactionMode: "trackball" as const,
      renderBackend: "webgl" as const,
      resetCounter: 0,
      scene,
      style: createDefaultStyle(),
    };

    render(<LatticeScene {...props} />);
    const controls = latestControls;
    expect(controls).not.toBeNull();
    if (!controls) {
      return;
    }

    controls.updateCalls = 0;
    const initialZoom = mockCamera.zoom;
    act(() => cameraInteractionStore.requestViewScale(2));

    expect(mockCamera.zoom).toBeCloseTo(initialZoom * 2);
    expect(controls.updateCalls).toBe(0);
  });

  test("syncs control zoom to the interaction store without emitting commands", () => {
    const scene = orthogonalScene();
    const defaultCamera = createDefaultCrystalCameraState();
    const cameraInteractionStore = createCameraInteractionStore();
    const viewScaleSnapshots: number[] = [];
    cameraInteractionStore.subscribeViewScale(() => {
      viewScaleSnapshots.push(cameraInteractionStore.getViewScaleSnapshot());
    });
    const initialCommandVersion =
      cameraInteractionStore.getViewScaleCommandSnapshot().version;

    render(
      <LatticeScene
        cameraCommandVersion={0}
        cameraInteractionStore={cameraInteractionStore}
        cameraState={defaultCamera}
        componentOpacity={createDefaultComponentOpacity()}
        interactionLocked={false}
        interactionMode="trackball"
        renderBackend="webgl"
        resetCounter={0}
        scene={scene}
        style={createDefaultStyle()}
      />,
    );

    const initialZoom = mockCamera.zoom;
    mockCamera.zoom = initialZoom * 1.006;
    act(() => latestControls?.dispatchTestEvent("change"));
    expect(viewScaleSnapshots).toHaveLength(1);
    expect(viewScaleSnapshots[0]).toBeCloseTo(1.006);
    expect(cameraInteractionStore.getViewScaleCommandSnapshot().version).toBe(
      initialCommandVersion,
    );
  });

  test("keeps the view scale snapshot aligned if a controls change event is missed", () => {
    const scene = orthogonalScene();
    const defaultCamera = createDefaultCrystalCameraState();
    const cameraInteractionStore = createCameraInteractionStore();
    const viewScaleSnapshots: number[] = [];
    cameraInteractionStore.subscribeViewScale(() => {
      viewScaleSnapshots.push(cameraInteractionStore.getViewScaleSnapshot());
    });
    const initialCommandVersion =
      cameraInteractionStore.getViewScaleCommandSnapshot().version;

    render(
      <LatticeScene
        cameraCommandVersion={0}
        cameraInteractionStore={cameraInteractionStore}
        cameraState={defaultCamera}
        componentOpacity={createDefaultComponentOpacity()}
        interactionLocked={false}
        interactionMode="trackball"
        renderBackend="webgl"
        resetCounter={0}
        scene={scene}
        style={createDefaultStyle()}
      />,
    );

    const initialZoom = mockCamera.zoom;
    mockCamera.zoom = initialZoom * 1.006;
    act(() => latestFrameCallback?.());

    expect(viewScaleSnapshots).toHaveLength(1);
    expect(viewScaleSnapshots[0]).toBeCloseTo(1.006);
    expect(cameraInteractionStore.getViewScaleCommandSnapshot().version).toBe(
      initialCommandVersion,
    );
  });

  test("applies camera state commands from the interaction store without rerendering", () => {
    const scene = orthogonalScene();
    const defaultCamera = createDefaultCrystalCameraState();
    const cameraInteractionStore = createCameraInteractionStore();
    const rolledCamera = applyCrystalCameraRoll(scene.cell.vectors, defaultCamera, 90);

    render(
      <LatticeScene
        cameraCommandVersion={0}
        cameraInteractionStore={cameraInteractionStore}
        cameraState={defaultCamera}
        componentOpacity={createDefaultComponentOpacity()}
        interactionLocked={false}
        interactionMode="trackball"
        renderBackend="webgl"
        resetCounter={0}
        scene={scene}
        style={createDefaultStyle()}
      />,
    );

    expect(Math.abs(mockCamera.up.x)).toBeLessThan(1e-8);
    expect(mockCamera.up.y).toBeGreaterThan(0);

    act(() => cameraInteractionStore.requestCameraState(rolledCamera));

    expect(mockCamera.up.x).toBeLessThan(0);
    expect(Math.abs(mockCamera.up.y)).toBeLessThan(1e-8);
  });

  test("keeps user camera interaction active until inertia settles", () => {
    const scene = orthogonalScene();
    const defaultCamera = createDefaultCrystalCameraState();
    const interactionChanges: {
      isActive: boolean;
      quaternionW: number | null;
    }[] = [];

    render(
      <LatticeScene
        cameraCommandVersion={0}
        cameraInteractionStore={createCameraInteractionStore()}
        cameraState={defaultCamera}
        componentOpacity={createDefaultComponentOpacity()}
        interactionLocked={false}
        interactionMode="trackball"
        onCameraControlsInteractionActiveChange={(isActive, quaternionSnapshot) => {
          interactionChanges.push({
            isActive,
            quaternionW: quaternionSnapshot?.w ?? null,
          });
        }}
        renderBackend="webgl"
        resetCounter={0}
        scene={scene}
        style={createDefaultStyle()}
      />,
    );

    if (latestControls) {
      latestControls.state = 0;
    }
    act(() => latestControls?.dispatchTestEvent("start"));
    act(() => latestControls?.dispatchTestEvent("end"));
    expect(interactionChanges).toEqual([{ isActive: true, quaternionW: null }]);

    mockCamera.quaternion.set(0, 0, 0.15, 0.85).normalize();
    act(() => latestFrameCallback?.());
    expect(interactionChanges).toEqual([{ isActive: true, quaternionW: null }]);

    mockCamera.quaternion.set(0, 0, 0.25, 0.75).normalize();
    act(() => latestFrameCallback?.());
    expect(interactionChanges).toEqual([{ isActive: true, quaternionW: null }]);

    act(() => latestFrameCallback?.());

    expect(interactionChanges).toEqual([
      { isActive: true, quaternionW: null },
      { isActive: false, quaternionW: mockCamera.quaternion.w },
    ]);
  });

  test("does not report pure zoom controls as camera direction interaction", () => {
    const scene = orthogonalScene();
    const defaultCamera = createDefaultCrystalCameraState();
    const interactionChanges: boolean[] = [];

    render(
      <LatticeScene
        cameraCommandVersion={0}
        cameraInteractionStore={createCameraInteractionStore()}
        cameraState={defaultCamera}
        componentOpacity={createDefaultComponentOpacity()}
        interactionLocked={false}
        interactionMode="trackball"
        onCameraControlsInteractionActiveChange={(isActive) => {
          interactionChanges.push(isActive);
        }}
        renderBackend="webgl"
        resetCounter={0}
        scene={scene}
        style={createDefaultStyle()}
      />,
    );

    act(() => latestControls?.dispatchTestEvent("start"));
    act(() => latestControls?.dispatchTestEvent("end"));
    if (latestControls) {
      latestControls.state = 1;
    }
    act(() => latestControls?.dispatchTestEvent("start"));
    act(() => latestControls?.dispatchTestEvent("end"));

    expect(interactionChanges).toEqual([]);
  });
});

function orthogonalScene(): SceneSpec {
  return {
    atoms: [
      {
        element: "Si",
        fractionalPosition: [0, 0, 0],
        id: "Si-0",
        imageOffset: [0, 0, 0],
        imageReasons: [],
        isPeriodicImage: false,
        position: [0, 0, 0],
        siteId: "Si-0",
        siteIndex: 0,
        visibilityDependencies: [],
        visibilityDependencyGroups: [],
      },
    ],
    bonds: [],
    cell: {
      vectors: [
        [2, 0, 0],
        [0, 3, 0],
        [0, 0, 4],
      ],
    },
    polyhedra: [],
    summary: {
      atomCount: 1,
      cell: {
        a: "2.00",
        alpha: "90.00",
        b: "3.00",
        beta: "90.00",
        c: "4.00",
        gamma: "90.00",
      },
      formula: "Si",
      symmetry: {
        available: false,
        crystalSystem: null,
        latticeSystem: null,
        pointGroup: null,
        pointGroupSchoenflies: null,
        spaceGroup: null,
        spaceGroupNumber: null,
      },
    },
  };
}
