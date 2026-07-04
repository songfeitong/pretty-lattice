# Thermo-Nuclear Code Quality Review

Date: 2026-06-30

Scope: whole-repo maintainability review of the current `pretty-lattice` codebase. This pass starts from `docs/index.md`, follows the current backend/frontend boundary documents, and intentionally avoids browser or Playwright validation.

## Short Answer

这个项目现在不是“到处都乱”。相反，后端已经从早期的 catch-all `scene.py` 里拆出来，整体边界比上一轮扫描健康很多。真正的问题集中在前端：最近几轮拆分把一些巨型文件打散了，但没有把复杂度彻底删掉。一部分复杂度只是从旧的 `CommonControlsPanel` / `LatticeScene` 转移到了新的 `StructureSceneObjects`、`OrientationTab`、`exportFigure` 和仍然很重的 `App`。

我的审批结论很硬：在继续给预览、导出、相机控制和显示选项加功能之前，应该先做一次结构压缩。否则每个新选项都会继续穿过 `App`、控制面板、scene renderer、export renderer 和 App 级测试，形成越来越贵的改动路径。

## Remediation Status

本报告下面的行数和定位是审查时的快照。随后已经按 `Recommended Refactor Order` 完成一轮结构压缩：

- `App.tsx` 降到 656 行，上传/静态预览、相机 command、导出状态、locked interaction feedback 已拆到独立 hooks。
- `StructureSceneObjects.tsx` 降到 409 行，atoms、bonds、polyhedra、cell frame 和 shared bond render model 已拆开。
- `app/exportFigure.ts` 降到 183 行，zip、PDF text、legend、raster、combined layout 已进入 `web/src/export/` 域。
- `OrientationTab.tsx` 降到 52 行，只组合 primary-axis/roll 和 vector editor 子组件；roll helper 与 vector editor draft/apply/reset 均有单测。
- `app/settings.ts` facade 已删除，中立状态/helper 改从 `model` 导入。
- `colorSchemes.ts` 降到 383 行，auto-distinct 和 Oklch 数学已独立成模块。
- `scene_contract.json` 现在是结构阈值、bond algorithm、image reason、visibility dependency 的共享合同源，Python 和 TS 都从它派生运行时常量。

## Headline Findings

### 1. 前端仍有多个超过 1000 行的核心文件

当前最大的源码文件是：

- `web/src/scene/StructureSceneObjects.tsx`: 1448 行。
- `web/src/app/App.tsx`: 1374 行。
- `web/src/app/exportFigure.ts`: 1348 行。
- `web/src/app/controls/commonPanel/OrientationTab.tsx`: 1224 行。
- `web/src/model/colorSchemes.ts`: 931 行，尚未过线，但已经接近。

这不是单纯的行数洁癖。这里的危险在于这些文件都处在高频变更路径上：预览渲染、交互状态、导出、相机控制、配色。它们越大，后续功能越容易以“再塞一个 if / 再加一个 prop / 再补一个局部 helper”的方式增长。

建议把 1000 行当成硬边界处理：新的视觉功能和导出功能进入这些文件之前，先拆。

### 2. `App.tsx` 是最大的一处编排债

`web/src/app/App.tsx` 同时管理：

- scene load / static preview / upload error。
- bond algorithm reupload。
- display/style/export state reset。
- camera command / roll preview / controls freeze state。
- atom inspect / pulse state。
- context menu event redispatch。
- locked interaction feedback。
- export projected size synchronization。
- overlay layout and inspector wiring。

证据很集中：状态和 ref 在 `App.tsx:167` 到 `App.tsx:234` 已经铺开成一大片；`resetLoadedPreviewState()` 在 `App.tsx:301` 到 `App.tsx:342` 试图一次性重置几乎所有子系统；文件上传和 bond algorithm 重新计算分别在 `App.tsx:685` 到 `App.tsx:783`；导出和 reset-all 又在 `App.tsx:901` 到 `App.tsx:993`；locked interaction 捕获逻辑在 `App.tsx:995` 到 `App.tsx:1097`。

这已经不是一个组件，而是一个应用控制器、相机状态机、上传状态机和导出协调器的合体。它现在还能工作，是因为测试覆盖够多；但结构上很难继续承受新 workflow。

建议的 code-judo move：不要先拆 JSX。先拆状态所有权。

- `useStructurePreview()`：拥有 `scene`、`previewStatus`、`currentFile`、`selectedFileName`、`bondAlgorithm`、load/reload/reset-after-load。
- `usePreviewCameraCommands()`：拥有 command versions、freeze refs、roll preview、orientation sync。
- `useFigureExportController()`：拥有 projected size sync、export error、isExporting、export action。
- `useLockedInteractionFeedback()`：拥有 wheel/pointer/context feedback gate。

这样 `App` 留作 overlay composition，而不是所有业务流程的终点站。

### 3. `StructureSceneObjects.tsx` 只是换了名字的 scene catch-all

2026-06-30 更新：独立 atom mesh / bond mesh 渲染后端已经删除。
2026-07-04 更新：atom 后端也迁移为 `BatchedAtoms.tsx`，当前
composition 固定走 `BatchedAtoms.tsx` 和 `BatchedBonds.tsx`。下面原始
观察记录的是删除前的风险形态；后续不应再恢复 mesh/batched 双后端选择。

这个文件表面上叫 “StructureSceneObjects”，但实际包含：

- scene object composition: `StructureSceneObjects()`，`StructureSceneObjects.tsx:283` 到 `StructureSceneObjects.tsx:442`。
- atom mesh、selection ring、pulse/select highlight state: `StructureSceneObjects.tsx:454` 到 `StructureSceneObjects.tsx:787`。
- batched bond data model、batch key hash、geometry population: `StructureSceneObjects.tsx:789` 到 `StructureSceneObjects.tsx:1121`。
- non-batched bond mesh path: `StructureSceneObjects.tsx:1123` 到 `StructureSceneObjects.tsx:1309`。
- polyhedra surface/edge creation: `StructureSceneObjects.tsx:1311` 到 `StructureSceneObjects.tsx:1393`。
- unit-cell fat-line frame: `StructureSceneObjects.tsx:1395` 到 `StructureSceneObjects.tsx:1444`。

最值得警惕的是 bond 逻辑：batched path 和 mesh path 都在自己重新组织 start/end atom、center、length、quaternion、color。现在还没有明显 bug，但这是典型的“两个渲染后端共用一个概念，却没有共用一个模型”。后续如果 bond color、selection、opacity、visibility 或 export parity 改一次，很容易只改到一条 path。

建议把它拆成：

- `StructureSceneObjects.tsx`: 只做 atoms/bonds/polyhedra/cell frame 的 composition。
- `BatchedAtoms.tsx`: 原子 batch 渲染和高亮动画。
- `BondRenderItems.ts`: 从 `SceneSpec` 生成单一 bond render model。
- `BatchedBonds.tsx`: 消费 `BondRenderItem[]` 的唯一 bond 渲染后端。
- `PolyhedronMesh.tsx`。
- `CellFrame.tsx`。

关键不是“拆文件好看”，而是让 composition 留在 scene 边界，具体
atoms/bonds/polyhedra/cell frame 逻辑留在各自模块。

### 4. `OrientationTab.tsx` 已经不是一个 tab，而是一个微型应用

`web/src/app/controls/commonPanel/OrientationTab.tsx` 现在把四类东西揉在一起：

- tab shell and reset-roll feedback: `OrientationTab.tsx:55` 到 `OrientationTab.tsx:153`。
- screen-axis mini R3F canvas, labels, hitbox geometry, animation constants: `OrientationTab.tsx:156` 到 `OrientationTab.tsx:563`。
- roll slider/input, drag preview, animation, keyboard behavior: `OrientationTab.tsx:565` 到 `OrientationTab.tsx:805`。
- manual vector editor and parser/formatter glue: `OrientationTab.tsx:807` 到 `OrientationTab.tsx:1216`。

这个文件很明显是从“把 CommonControlsPanel 拆成 tab”之后留下来的新边界问题。拆 tab 是对的，但 `OrientationTab` 自己又长成了 catch-all。

建议拆成：

- `orientation/OrientationTabContent.tsx`
- `orientation/ScreenAxisChooser.tsx`
- `orientation/RollControl.tsx`
- `orientation/VectorEditor.tsx`
- `orientation/orientationControlMath.ts`

其中 `shortestRollDelta()`、`parseRollInput()`、`draftFromCameraState()` 等纯函数可以单测；小 R3F chooser 则独立成一个可替换组件。这样后面调 hitbox、调 roll input、调向量编辑不会互相干扰。

### 5. `exportFigure.ts` 把导出域的所有层次塞进一个文件

`web/src/app/exportFigure.ts` 当前同时负责：

- public export orchestration: `createFigureExportFiles()`，`exportFigure.ts:106` 到 `exportFigure.ts:201`。
- combined export orchestration and placement。
- legend canvas measurement/rendering: `exportFigure.ts:370` 到 `exportFigure.ts:620`。
- crystal-axis export wrapper。
- PDF text overlay and font embedding: `exportFigure.ts:673` 到 `exportFigure.ts:770`。
- raster blob encoding and downsampling。
- hand-rolled zip writing: `exportFigure.ts:841` 到 `exportFigure.ts:977`。
- structure raster delegation and combined layer assembly: `exportFigure.ts:979` 到 `exportFigure.ts:1272`。

这让导出领域很难判断“哪个层拥有哪个概念”。比如 raster/PDF/legend/zip 都混在 app 层，而 `web/src/scene/exportRenderer.tsx` 又拥有 offscreen R3F rendering、canvas crop、alpha bounds、text projection和 raster background。两边都是 export，但边界不是按概念切的，而是按历史增长切的。

建议的 code-judo move：

- 建一个 `web/src/export/` 域，承接与用户导出文件有关的逻辑。
- `createFigureExportFiles.ts`: orchestration only。
- `legendExport.ts`: legend measure/render/text items。
- `pdfTextExport.ts`: PDF image + vector text overlay。
- `zipExport.ts`: zip writer。
- `combinedExportLayout.ts`: layer bounds/placement/offset text items。
- `rasterCanvas.ts`: shared canvas-to-blob/downsample/background helpers。

然后让 `scene/exportRenderer.tsx` 只负责“把 scene/camera 渲成 raster image”，不要再承担导出文件格式和附件组合。

### 6. `SceneSpec` 合同仍然手写双份，迟早会漂

Python 合同在 `src/pretty_lattice/structures/schema.py:7` 到 `schema.py:128`；TypeScript 镜像在 `web/src/api/scene.ts:3` 到 `api/scene.ts:100`。现在还有一些共享常量通过 JSON 复用，比如 `STRUCTURE_ATOM_COUNT_THRESHOLD`，这是好方向。但 scene payload、bond algorithm、visibility dependency 等核心合同仍然是两边手写。

这不是今天的最大债，因为当前测试覆盖了很多 contract 行为。但它是后续 schema 变化的结构性风险：Python 先改 payload，TS 类型只会在运行时暴露问题；TS 先加假设，Python 不一定跟上。

建议先不要上很重的 schema framework。更小的路线是：

- 把 Python 端 `SceneSpec` 导出一份 JSON Schema，或维护一份项目自有 `scene.schema.json`。
- TS 类型从 schema 生成，或者至少在测试里用 schema 验证 fixture/API mock。
- `BondAlgorithm`、`VisibilityDependency`、warning code 这类 enum 从同一个数据源生成两边常量。

目标是让合同漂移变成测试失败，而不是 UI 奇怪。

### 7. model 边界已经建立，但旧 facade 还在继续扩散

`web/src/app/settings.ts` 现在只是 re-export `model/appearance`、`model/displayState`、`model/exportSettings`、`model/layout`、`model/rendering`、`model/structureLimits`。这说明上一轮边界迁移方向是对的。但当前新代码和测试仍然大量从 `./settings` 或 `../src/app/settings` 导入。

这类 facade 作为迁移期 shim 可以接受；长期留着会模糊“app owns workflow, model owns neutral state”的边界。尤其 `app/exportFigure.ts` 和 `App.tsx` 还从 `./settings` 取中立类型和 helper，会让后续读者误以为这些模型仍属于 app 层。

建议开一个很小的清理 PR：

- 生产代码全部改从 `../model/...` 或 `../model` 导入。
- 测试也改到 `../src/model/...`。
- 删除 `app/settings.ts`，或只保留极短期兼容并标注 deprecation。

这不是最高风险，但它是便宜且明确的边界清理。

### 8. `colorSchemes.ts` 接近成为数据加载、验证、颜色科学和自动调色的混合模块

`web/src/model/colorSchemes.ts` 现在 931 行，包含：

- 静态 colormap imports 和 catalog loading。
- catalog/raw colormap validation。
- token style generation。
- element color lookup。
- similar-color conflict graph。
- Oklab/Oklch conversion。
- local color variant search。
- element semantic priority and periodic-table ordering。

这里的算法不差，但文件边界太宽。`autoDistinctElementColorOverrides()` 从 `colorSchemes.ts:253` 到后续 Oklch helper 的整段逻辑，本质上是一个独立的 color adjustment engine，不应该和 catalog parser 绑死。

建议拆成：

- `colorSchemes/catalog.ts`
- `colorSchemes/elementColor.ts`
- `colorSchemes/autoDistinct.ts`
- `colorSchemes/oklch.ts`

这样未来如果要换调色策略，不会碰 catalog validation 和 UI option 生成。

### 9. `App.test.tsx` 已经和 `App.tsx` 一样成为改动阻力

`web/tests/App.test.tsx` 有 2310 行。它覆盖很多真实 workflow，这是好事；但它现在把 mocks、export fake、scene fixtures、upload helpers、context menu、reset、inspector、camera、export、warnings 全部放在一个文件里。

当测试文件变成一个巨型 integration surface，重构时会出现两个问题：

- 读者必须一次性理解整个 App 才敢改一个局部 workflow。
- fixture/helper 只能在这个文件里复用，其他测试只能复制或绕开。

建议拆成：

- `web/tests/helpers/appHarness.tsx`
- `web/tests/helpers/sceneFixtures.ts`
- `web/tests/app.upload.test.tsx`
- `web/tests/app.display-style.test.tsx`
- `web/tests/app.export.test.tsx`
- `web/tests/app.camera.test.tsx`
- `web/tests/app.inspector.test.tsx`

这会让后续拆 `App.tsx` 的风险明显下降。

## Backend Status

后端这次不是主要问题。

`src/pretty_lattice/structures/scene_builder.py` 现在已经是较清晰的编排层：读取 cell vectors、构造 atom records、调用 connectivity、polyhedra、summary，然后组装 `SceneSpec`。`schema.py`、`periodic_images.py`、`connectivity.py`、`polyhedra.py`、`summary.py`、`visibility.py` 的边界基本符合项目文档里 “Python owns structure IO, materials analysis, and scene generation” 的方向。

剩余小债：

- `build_scene_response()` 这个名字仍偏 HTTP，但它现在只是 `build_scene_spec()` 的 facade。可以等调用点迁移后删除。
- `tests/test_structures.py` 有 649 行，覆盖面很广。它还没到必须拆的程度，但如果继续加 backend behavior，建议拆成 contract / periodic images / connectivity / polyhedra / summary。
- Python/TS scene contract 手写双份是比 backend 模块本身更大的长期风险。

## Recommended Refactor Order

### Slice 1: 先拆 `App` 的状态所有权

目标不是减少 JSX 行数，而是把 workflow ownership 拆出来。完成后 `App.tsx` 应该读起来像“把几个子系统接到 UI 上”，而不是“所有子系统都在这里实现”。

验收标准：

- `App.tsx` 降到 700 行以下。
- 上传、静态预览、bond algorithm reupload、reset-after-load 在一个 hook 里。
- 相机 command/freeze/roll preview 在一个 hook 里。
- 导出 projected size 和导出错误在一个 hook 里。
- `App.test.tsx` 至少先抽出 shared harness，避免后续拆组件时测试也一起爆炸。

### Slice 2: 拆 `StructureSceneObjects`

独立 bond mesh 后端已删除，`BondRenderItem[]` 已经是 batched bonds 的单一输入模型。这个 slice 后续应聚焦继续缩小 `StructureSceneObjects.tsx` 的 composition 边界，而不是恢复双后端。

验收标准：

- `StructureSceneObjects.tsx` 只保留 composition。
- batched bonds 消费单一 `BondRenderItem[]`。
- atom highlight 不再埋在 scene object catch-all 里。
- 现有 lattice scene tests 继续覆盖 geometry 行为。

### Slice 3: 拆导出域

把 `app/exportFigure.ts` 拆成 `export/` 域。这个 slice 不要改导出 UI，也不要改视觉默认值。

验收标准：

- public orchestration file 不超过 250 行。
- legend、PDF text、zip、combined layout 各有独立模块。
- `scene/exportRenderer.tsx` 只返回 raster image，不关心 zip/PDF/附件组合。
- 增加或迁移导出单测，覆盖 combined layout、PDF text item offset、zip file names。

### Slice 4: 拆 `OrientationTab`

这个 slice 可以在 App 和 scene 拆完后做，因为它更偏局部 UI。目标是让 hitbox/mini-canvas、roll control、vector editor 各自可读。

验收标准：

- `OrientationTabContent` 只组合子组件。
- roll input 的 parse/format/animation helper 可单测。
- vector editor draft/apply/reset 可单测。
- 小 R3F chooser 的 constants 和 hitbox math 不再压在 tab 文件里。

### Slice 5: 合同和 facade 清理

这一组适合做小 PR：

- 迁移 `app/settings.ts` facade imports 到 `model`。
- 明确 `SceneSpec` schema 的单一来源。
- 拆 `colorSchemes.ts`。

## Approval Bar

如果下一步 PR 继续往这些文件里加视觉选项、导出选项或相机交互，我会把它视为结构性风险，而不是普通增量。当前代码能跑，但可维护性已经在几个中心文件上到达临界点。

可以继续做功能，但正确姿势应该是：每个新功能先找到它的 canonical owner；如果 owner 现在是 1200 行以上的 catch-all，就先开一个窄 refactor slice，把 owner 拆出来，再落功能。

## Verification Notes

This review was static. I did not run browser or Playwright testing, following the repo instruction. I also did not run the full test suite because the requested deliverable is a written code-quality report, not a behavior-changing code patch.

Commands and checks used included repo file listing, line counts, documentation entrypoint review, focused source inspection, dependency-direction search, large-file structure search, and current git status. Existing unrelated changes were left untouched: `README.md` modified and `README_zh_CN.md` untracked.
