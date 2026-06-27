import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { DirectionalLight, Object3D, Vector3 } from "three";

import { PREVIEW_HEADLIGHT_INTENSITY } from "./renderAppearance";

const HEADLIGHT_TARGET = new Vector3(0, 0, 0);
const DEFAULT_CAMERA_RELATIVE_LIGHT_OFFSET = [0.32, 0.22, 0] as const;
const MIN_LIGHT_DISTANCE = 4;

export function CameraHeadlight({
  intensity = PREVIEW_HEADLIGHT_INTENSITY,
  offset = DEFAULT_CAMERA_RELATIVE_LIGHT_OFFSET,
}: {
  intensity?: number;
  offset?: readonly [number, number, number];
}) {
  const { camera } = useThree();
  const lightRef = useRef<DirectionalLight | null>(null);
  const lightOffsetRef = useRef(new Vector3());
  const cameraRelativeLightOffset = useMemo(
    () => new Vector3(...offset),
    [offset],
  );
  const targetObject = useMemo(() => {
    const object = new Object3D();
    object.position.copy(HEADLIGHT_TARGET);
    return object;
  }, []);

  useFrame(() => {
    const light = lightRef.current;
    if (!light) {
      return;
    }

    const lightDistance = Math.max(camera.position.distanceTo(HEADLIGHT_TARGET), MIN_LIGHT_DISTANCE);
    lightOffsetRef.current
      .copy(cameraRelativeLightOffset)
      .multiplyScalar(lightDistance)
      .applyQuaternion(camera.quaternion);

    light.position.copy(camera.position).add(lightOffsetRef.current);
    targetObject.position.copy(HEADLIGHT_TARGET);
    targetObject.updateMatrixWorld();
  });

  return (
    <>
      <primitive object={targetObject} />
      <directionalLight
        ref={lightRef}
        intensity={intensity}
        target={targetObject}
      />
    </>
  );
}
