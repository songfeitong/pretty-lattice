import { useLayoutEffect, useMemo } from "react";
import { OrthographicCamera } from "three";
import { useThree } from "@react-three/fiber";

import type { SceneSpec } from "../api/scene";
import type {
  AtomRenderingMode,
  BondRenderingMode,
  ComponentOpacityState,
  StyleState,
} from "../model";
import type { CameraPoseSnapshot } from "./cameraPose";
import { applyCameraPoseSnapshot } from "./cameraPose";
import type { ResolvedStructureMaterialFamily } from "./materialPresetResolver";
import type { SceneLayout } from "./sceneLayout";
import type { SceneMeshDetail } from "./StructureSceneObjects";
import { MemoizedStructureSceneObjects, SceneFog } from "./StructureSceneObjects";
import { applyOrthographicExportFrame, type StructureExportFramePlan } from "./exportFrame";

export function ExportSceneContent({
  atomRenderingMode,
  bondRenderingMode,
  cameraPose,
  componentOpacity,
  exportFramePlan,
  layout,
  materialFamily,
  meshDetail,
  scene,
  showAtoms,
  showUnitCell,
  style,
  unitCellLineColor,
  unitCellLineWidthScale = 1,
}: {
  atomRenderingMode: AtomRenderingMode;
  bondRenderingMode: BondRenderingMode;
  cameraPose: CameraPoseSnapshot;
  componentOpacity: ComponentOpacityState;
  exportFramePlan: StructureExportFramePlan;
  layout: SceneLayout;
  materialFamily: ResolvedStructureMaterialFamily;
  meshDetail: SceneMeshDetail;
  scene: SceneSpec;
  showAtoms: boolean;
  showUnitCell: boolean;
  style: StyleState;
  unitCellLineColor?: string;
  unitCellLineWidthScale?: number;
}) {
  const { camera } = useThree();
  const atomById = useMemo(() => new Map(scene.atoms.map((atom) => [atom.id, atom])), [scene]);

  useLayoutEffect(() => {
    applyCameraPoseSnapshot(camera, cameraPose, layout.standardPose.distance, layout.span);
  }, [camera, cameraPose, layout.span, layout.standardPose.distance]);

  useLayoutEffect(() => {
    if (camera instanceof OrthographicCamera) {
      applyOrthographicExportFrame(camera, exportFramePlan);
    }
  }, [camera, exportFramePlan]);

  return (
    <>
      <SceneFog layout={layout} style={style} />
      <MemoizedStructureSceneObjects
        atomRenderingMode={atomRenderingMode}
        bondRenderingMode={bondRenderingMode}
        atomById={atomById}
        componentOpacity={componentOpacity}
        groupPosition={layout.groupPosition}
        materialFamily={materialFamily}
        meshDetail={meshDetail}
        scene={scene}
        showAtoms={showAtoms}
        showUnitCell={showUnitCell}
        style={style}
        unitCellLineColor={unitCellLineColor}
        unitCellLineWidthScale={unitCellLineWidthScale}
      />
    </>
  );
}
