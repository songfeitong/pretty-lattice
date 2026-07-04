# Render Depth and Transparency Sorting Review

调研日期：2026-07-02

## 结论先行

当前默认视觉路径大体是合理的：atoms 和 bonds 在 100% opacity 时作为实体对象写入 depth buffer；低 opacity atoms 仍写入 depth buffer，用稳定的结构遮挡优先于物理玻璃式混色；unit-cell frame 作为 depth-tested 参考线在主结构之后、polyhedra 之前绘制；polyhedra 作为半透明语义壳层，在主结构和 unit cell 之后绘制并写入自己的深度来抑制后方面和后方白边叠色；selection ring 最后绘制但仍参与 depth test。

这套方案最重要的优点是它符合 Pretty Lattice 的用户语义，而不是追求物理正确的玻璃透明：polyhedra 是“配位壳层提示”，unit cell 是“空间参考线”，atoms/bonds 是主要结构实体。

没有发现默认状态下的硬性排序错误。2026-07-04 更新后，atoms 已从
`InstancedMesh` 迁移到 `BatchedMesh`，所以原先 atom-vs-atom 透明排序
风险已经降低。主要剩余风险在 opacity 被拉低后的跨对象组合：

1. `BatchedMesh` 会排序 atom batch 内部对象，但 atoms、bonds、unit cell、polyhedra 仍是不同 render objects；当前用 atom `depthWrite=true` 保持结构遮挡稳定，而不是追求严格玻璃混色。
2. polyhedra surface 当前 `transparent=true` 且 `depthWrite=true`。这能很好地阻止后方面和后方 edge 叠出来；它必须晚于 atoms/bonds/unit cell 绘制，否则会挡住 polyhedra 内部的 transparent atoms 和后方 unit-cell lines。
3. material preset 目前可以透传 `depthTest` 等 Three.js props。虽然现有 preset 没有破坏排序，但未来如果某个 preset 设置 `depthTest: false`，会直接破坏 structure depth semantics。

## 用户视角下的正确视觉语义

我建议把当前渲染对象分成五类，而不是只用“透明/不透明”二分：

| 对象 | 用户语义 | 正确视觉效果 |
|---|---|---|
| Atoms | 主结构实体 | 默认是 solid spheres，和 bonds/unit cell/polyhedra 按真实深度遮挡。低 opacity 时是“弱化显示”，不是精确玻璃模拟。 |
| Bonds | 主结构实体 | 默认是 solid cylinders，应该被前方 atoms 遮挡，也能遮挡后方 unit-cell lines。低 opacity 时同 atoms，是近似 ghosting。 |
| Unit cell | 空间参考线 | 不应该永远盖在最上面；它应该按真实 3D 深度被前方 atom/bond 遮挡，也应该在几何上位于前方时显示在 atom/bond 前面。 |
| Polyhedra surface | 配位壳层提示 | 应该是半透明壳层，能让 atoms/bonds 透出来；但不应该让同一壳层背面的面、相邻重合面、后方 polyhedra edges 反复叠色。 |
| Highlight/ring | 交互反馈 | 高亮 tint 属于 atom 本身；selection ring 是 scene-attached overlay，应该足够靠前，但仍可被更前方实体遮挡，避免变成纯屏幕 HUD。 |

这个语义和物理透明不同。物理玻璃通常希望多层透明表面都叠加；我们对 polyhedra 的目标正好相反：它是一个“可看穿的壳层标注”，不是多层玻璃。

## Three.js 排序规则依据

本项目当前安装的是 `three@0.171.0`。我核对了 Three.js 官方文档、Context7 提供的 Three.js 文档摘要，以及本项目 `web/node_modules/three` 中的实际源码。

关键规则如下：

1. `Material.opacity` 只有在 `Material.transparent=true` 时才真正控制透明混合；`transparent=false` 时 material 仍按不透明对象处理。参考 Three.js Material docs。
2. `depthTest=true` 表示绘制时会拿当前 fragment 深度和 depth buffer 比较；被前方物体挡住的 fragment 不会写颜色。
3. `depthWrite=true` 表示绘制成功后会把自己的深度写进 depth buffer；`depthWrite=false` 常用于 overlay 或透明对象，避免它们挡住后续对象。
4. WebGLRenderer 把 object/material 分到三个 render list：opaque、transmissive、transparent。本项目主要涉及 opaque 和 transparent。源码依据是 `WebGLRenderLists.js` 中 `material.transparent === true` 的分流。
5. WebGLRenderer 总是先画 opaque，再画 transmissive，再画 transparent。`renderOrder` 只能影响各自 list 内部排序，不能让 transparent 对象跑到 opaque 之前。
6. 默认 opaque sort 是 low-to-high `renderOrder`，再考虑 material id、z、object id；默认 transparent sort 也是 low-to-high `renderOrder`，然后 back-to-front z。源码依据是 `painterSortStable` 和 `reversePainterSortStable`。
7. `Object3D.renderOrder` 对 `Group` 有特殊含义：Group 的 `renderOrder` 会成为后代的 group order。我们当前主要给 leaf objects 设置 `renderOrder`。
8. `BatchedMesh` 有自己的 `sortObjects` 和 `perObjectFrustumCulled`，默认都是 `true`。它会在 `onBeforeRender` 中按 material 是否 transparent 对 batch 内 draw ranges 排序。
9. `InstancedMesh` 不会自动重排单个 instance。Three.js examples 提供 `SceneUtils.sortInstancedMesh(...)`，但那会重排 `instanceMatrix` / `instanceColor` 等 attributes，必须同步维护 atom id 到 instance id 的映射。
10. `transparent + DoubleSide` 的 material 默认 `forceSinglePass=false`，Three.js 会 back side 和 front side 各画一遍。这一点会影响 polyhedra surface。

相关来源：

- Three.js Material docs: <https://threejs.org/docs/#api/en/materials/Material>
- Three.js Object3D renderOrder docs: <https://threejs.org/docs/#api/en/core/Object3D.renderOrder>
- Three.js WebGLRenderer sortObjects docs: <https://threejs.org/docs/#api/en/renderers/WebGLRenderer.sortObjects>
- Three.js BatchedMesh docs: <https://threejs.org/docs/#api/en/objects/BatchedMesh>
- Three.js SceneUtils sortInstancedMesh docs: <https://threejs.org/docs/#examples/en/utils/SceneUtils.sortInstancedMesh>
- Local source checked: `web/node_modules/three/src/renderers/webgl/WebGLRenderLists.js`
- Local source checked: `web/node_modules/three/src/renderers/WebGLRenderer.js`
- Local source checked: `web/node_modules/three/src/objects/BatchedMesh.js`
- Local source checked: `web/node_modules/three/examples/jsm/utils/SceneUtils.js`

## 当前实现

当前集中排序常量在 `web/src/scene/renderOrder.ts`：

```ts
export const STRUCTURE_RENDER_ORDER = {
  atomMesh: 10,
  bondMesh: 11,
  unitCellFrame: 12,
  polyhedronSurface: 20,
  polyhedronEdge: 21,
  atomSelectionRing: 40,
} as const;
```

这个顺序本身是合理的。需要注意的是，Three.js 的 opaque 和 transparent list 分开，所以这组数字不是全局绝对绘制顺序。它的真实含义是：

1. 在 transparent list 内，transparent atoms 早于 transparent bonds，unit cell 早于 polyhedra surface/edge，selection ring 最晚。
2. 在 opaque list 内，atoms/bonds 只有自己；默认 100% opacity 时它们会先于所有 transparent 对象绘制。

### Atoms

当前路径：`web/src/scene/BatchedAtoms.tsx`

材质策略：

- `opacity < 1` 时：`transparent=true`，`depthWrite=true`。
- `opacity === 1` 时：`transparent=false`，`depthWrite=true`。
- `renderOrder=STRUCTURE_RENDER_ORDER.atomMesh`。

默认状态下这是正确的。atoms 是实体对象，会写 depth，和 bonds、unit cell、polyhedra 的遮挡关系由 depth buffer 决定。

2026-07-04 更新：atoms 已迁移到 `BatchedMesh`。`mesh.sortObjects=true` 会在 batch 内按 atom 的 draw range 排序，所以低 opacity 下的 atom-vs-atom 透明顺序比旧 `InstancedMesh` 路径更稳。当前仍保留 `depthWrite=true`，不是为了补救 instancing，而是为了让 atoms 相对 bonds、unit cell、polyhedra 继续保持项目定义的结构遮挡语义。

Atoms 的 render order 早于 bonds。这样当 atoms 和 bonds 都进入 transparent list 时，atoms 会先写入 depth buffer；随后 bonds 仍然做 depth test，插入原子球内部的 bond 片段会被 atom depth 挡掉，避免相机拖动时因为 atom/bond 自动排序变化而随机显隐。

交互身份现在使用 `event.batchId`，通过 `batchPicking.ts` 中的 registry 映射回 atom render item。不要把 `batchId === atom index` 当成跨版本契约；当前代码在 populate batch 时显式注册映射。

### Bonds

当前路径：`web/src/scene/BatchedBonds.tsx`

材质策略和 atoms 一样：

- `opacity < 1` 时：`transparent=true`，`depthWrite=false`。
- `opacity === 1` 时：`transparent=false`，`depthWrite=true`。
- `renderOrder=STRUCTURE_RENDER_ORDER.bondMesh`。

默认 100% opacity 下这是正确的。bond cylinders 和 atom spheres 同为实体结构对象，depth buffer 会处理真实遮挡；低 opacity 下 bonds 晚于 atoms 绘制，以便 transparent atoms 先写 depth，稳定遮挡插入原子球内部的 bond 片段。

`BatchedMesh` 对 bonds 比 `InstancedMesh` 更有利：Three.js `BatchedMesh.sortObjects=true` 会按 batch 内 draw ranges 排序，transparent bonds 至少有内部排序机制。2026-07-04 更新后，代码已经显式设置 `mesh.sortObjects=true` 和 `mesh.perObjectFrustumCulled=true`，和 atoms/polyhedra 保持一致。

### Unit Cell Frame

当前路径：`web/src/scene/CellFrame.tsx`

当前策略：

- `transparent=true`，即使 opacity 是 100%。
- `depthTest=true`。
- `depthWrite=false`。
- `renderOrder=STRUCTURE_RENDER_ORDER.unitCellFrame`。

这正好对应 unit cell 的语义：它是参考线 overlay，但不是屏幕 HUD。它在 atom/bond 后画，因此前方的 unit-cell edge 能显示出来；同时它保留 `depthTest=true`，因此几何上在后方的 cell edge 会被前方 atom/bond 挡住。它在 polyhedra surface 前画，所以 polyhedra 的透明壳层会像覆盖 atoms/bonds 一样覆盖 unit cell，后方 unit-cell lines 能透过 polyhedra 壳层看到。

`transparent=true` at 100% 是有意的。它避免 100% opacity 时 cell frame 回到 opaque queue，从而再次依赖 Three.js 默认对象顺序。视觉上 100% 仍是实线；渲染管线里则按 transparent overlay 处理。

这块当前逻辑是合理的。唯一要小心的是，未来如果有另一个 transparent overlay 需要和 unit cell/polyhedra 交互，应该继续通过 `STRUCTURE_RENDER_ORDER` 集中管理，不要回到 Three.js 默认对象排序。

### Polyhedra Surface

当前路径：`web/src/scene/BatchedPolyhedra.tsx`

当前策略：

- `transparent=true`。
- `depthWrite=true`。
- `side=DoubleSide`。
- `polygonOffset=true`，`polygonOffsetFactor=3`。
- `renderOrder=STRUCTURE_RENDER_ORDER.polyhedronSurface`。
- `BatchedMesh.sortObjects=true`，`BatchedMesh.perObjectFrustumCulled=true`。

这是一套“语义透明壳层”方案，不是普通透明玻璃方案。

它解决了你的核心诉求：polyhedra 可以半透明，但不希望透出后方 polyhedron surface 或后方白边。`depthWrite=true` 会让先绘制出的壳层把自己的深度写入 depth buffer，后方 polyhedron faces 和后方 edges 会被挡住。surface 去重逻辑又进一步删除共面的重复 faces，避免同一平面多次叠色。

因为 atoms/bonds/unit cell 先画进颜色，polyhedra surface 后画到同一片 framebuffer 上。这样当 surface 位于这些对象前方时，它们会通过半透明 surface 被看到；当 surface 位于它们后方且前方对象已经写入 depth 时，surface fragment 会被 depth test 挡掉。这个顺序对 transparent atoms 和 unit cell 尤其重要：如果 polyhedra surface 先写 depth，包在里面的 transparent atom 或后方 unit-cell line 会在后续绘制时被 depth test 直接挡掉。

### Polyhedra Edges

当前路径：`web/src/scene/BatchedPolyhedra.tsx`

当前策略：

- `transparent=true`。
- `depthWrite=false`。
- `renderOrder=STRUCTURE_RENDER_ORDER.polyhedronEdge`。
- edge opacity = `min(1, surfaceOpacity * POLYHEDRON_EDGE_OPACITY_RATIO)`。

edge 晚于 surface 绘制，但 surface 已经写入 depth。因为默认 depth func 是 `LessEqualDepth`，同一前表面的边线通常还能通过；后表面或后方 polyhedron 的边线会被 surface depth 挡住。这正是“不透出后面的白边”的目标。

这块当前设计是合理的。`polygonOffsetFactor=3` 也有助于让 surface depth 稍微后移，减少前表面 edge 和 surface 的 z-fighting。

### Atom Highlight and Selection Ring

当前路径：

- `web/src/scene/BatchedAtoms.tsx`
- `web/src/scene/AtomSelectionRing.tsx`

高亮 tint 不是单独对象，而是直接改 `BatchedMesh` 中对应 batch item 的颜色。这很好：它随 atom 本身参加同一套 depth/lighting/opacity 规则，不会产生额外排序层。

selection ring 是一个 `SpriteMaterial`：

- `transparent=true`。
- `depthWrite=false`。
- 没有显式 `depthTest`，所以继承 material 默认 `depthTest=true`。
- `renderOrder=STRUCTURE_RENDER_ORDER.atomSelectionRing`。

这意味着 selection ring 最后画，但仍然能被更前方的 scene geometry 遮挡。这个语义更像“贴在结构里的选中 halo”，不是永远置顶的 UI HUD。已知限制是：当选中 atom 位于 polyhedra 内部时，polyhedra surface 已经写入 depth buffer，ring 后画时可能被 depth test 挡住。要彻底改善这个问题，应该考虑 selected atom 的几何 halo，而不是继续只调整 sprite render order。

## Opacity 100% 跳变策略

当前有两套策略：

1. atoms/bonds：`opacity === 100%` 时切回 opaque queue，并打开 `depthWrite`。
2. unit cell/polyhedra/ring：即使 opacity 是 100%，也保持 transparent queue。

这不是天然错误，因为它们的语义不同：

- atoms/bonds 是实体结构，100% 时应该是 solid geometry。
- unit cell 是 overlay line，需要稳定地在结构实体之后画，但为了能透过 polyhedra 壳层看到，它应该在 polyhedra surface 之前画。
- polyhedra 是语义透明壳层，即使 100% 也仍然属于“壳层/标注”对象，不应该突然变成实体结构。
- ring 是交互 overlay，必然属于 transparent path。

但这套策略现在分散在不同组件里，缺少一个显式的 policy 名字。后续建议增加一个小的 render-policy helper 或至少注释，把这些规则写成项目语义，而不是让读代码的人误以为只是 Three.js flag 拼凑。

## BatchedMesh and InstancedMesh 审计

### Batched atoms

2026-07-04 更新后适合当前默认路径。优点是 atom/bond/polyhedra 都使用 BatchedMesh-family 的对象模型，透明 atoms 有 batch 内排序，raycast 能返回 `batchId`，高亮可以通过 `setColorAt(batchId, color)` 完成。

主要限制：

- `BatchedMesh` 只排序自己内部的 batch items，不会把 atom batch 和 bond batch 交错成一个全局透明列表。
- 无 `WEBGL_multi_draw` 的浏览器会退化成多个 draw calls；本项目接受这个边缘浏览器代价，优先保持代码统一。
- 如果未来做 bond selection，需要给 `BondSpec` 增加稳定 id，并复用现有 batch picking registry。

### Batched bonds

适合当前路径。`BatchedMesh` 自带 per-object sorting 和 culling，这比把所有 bonds merge 成一个普通 geometry 更适合透明 bonds。

主要建议：

- 显式设置 `mesh.sortObjects = true` 和 `mesh.perObjectFrustumCulled = true`，不是因为默认错，而是因为 bonds 和 polyhedra 都依赖这个语义，显式更稳。
- 如果以后 bond selection/hover 变复杂，BatchedMesh 的 per-instance identity 需要额外设计。

### Batched polyhedra

当前选择是合理的，因为 polyhedra 需要：

- 批量减少 draw calls。
- 保留每个 polyhedron 的 surface item，以便 BatchedMesh 内部排序。
- 分离 surface items 和 edge items，避免 surface 去重误删 outline。

当前实现已经显式设置 `sortObjects` 和 `perObjectFrustumCulled`，这是对的。

## 主要风险和建议

### 风险 1：transparent batch sorting 不是跨对象族的全局排序

级别：低到中

`BatchedAtoms` 会排序 atom batch 内部对象，但 atoms、bonds、unit cell、polyhedra 仍是不同 render objects。当前通过 `renderOrder` 和 atom `depthWrite=true` 把 atom opacity 解释成结构弱化显示，优先保证前后遮挡稳定，而不是追求真实透明混色。

建议继续把这个记录为项目语义。只有当产品明确需要物理玻璃式透明时，再考虑全局透明排序或 OIT 类方案。

### 风险 2：polyhedra shell 与 transparent atoms/bonds 的组合

级别：低到中

当前顺序已经让 transparent atoms/bonds/unit cell 先于 polyhedra shell 绘制，因此被 polyhedra 包住的 transparent atom 或位于 polyhedra 后方的 unit-cell line 不会因为 shell 先写 depth 而消失。polyhedra surface 仍然 `depthWrite=true`，所以后方 polyhedra faces 和后方 edges 仍会被挡住。

剩余风险是这套方案仍是语义透明，不是物理透明：如果用户期待多个透明壳层、透明 atoms、透明 bonds 完全按玻璃方式叠色，当前方案仍只是近似。

### 风险 3：material preset 可透传 depthTest

级别：中

`StructureMaterial` 现在会先 spread preset props，再 spread common props。common props 覆盖了 `color`、`opacity`、`transparent`、`depthWrite`、`side`、`vertexColors`，但没有覆盖 `depthTest`。模板里也允许 `depthTest`。

这意味着未来某个 material preset 如果设置 `depthTest:false`，atoms/bonds/polyhedra 的 3D 遮挡会直接坏掉。

建议：

- 从 material preset schema 中禁止 `depthTest`、`depthWrite`、`transparent`、`opacity`、`side`、`color`、`vertexColors` 这类 scene policy props；或
- 在 `StructureMaterial` 中显式接管 `depthTest`，让 object-level render policy 决定。

### 风险 4：render policy 分散

级别：低到中

`opacity < 1` 的跳变规则写在 atoms/bonds 各自组件里；unit cell/polyhedra/ring 又各自手写 transparent/depth policy。现在还能读懂，但后续新增 object 类型时容易复发排序 bug。

建议增加类似：

```ts
type StructureRenderRole =
  | "structure-solid"
  | "unit-cell-overlay"
  | "polyhedron-shell"
  | "selection-overlay";
```

然后通过一个小 helper 返回 `transparent`、`depthTest`、`depthWrite`、`renderOrder`。不一定立刻改，但这是后续清理的好方向。

## 当前是否需要继续改代码

如果目标是修复 issue 里 unit-cell line 被 atom/bond 错挡的问题，当前改法足够：unit cell 已经成为 `depthTest=true`、`depthWrite=false`、`transparent=true` 的 structure overlay，并且排在 atom/bond 之后、polyhedra 之前。

如果目标是把所有 opacity 组合都做到严格透明正确，当前实现还不是最终答案。但我不建议现在立刻追求物理透明，因为这会和 polyhedra 的“不要后方面/白边叠出来”的产品语义冲突。更适合的方向是先把 render policy 命名并文档化，然后在真实视觉案例暴露问题时，针对“transparent atoms/bonds + polyhedra”单独设计。

## 建议的下一步

1. 保留当前视觉方案，不做大改。
2. 在代码中给 `STRUCTURE_RENDER_ORDER` 和 polyhedra `depthWrite=true` 加短注释，说明它们是项目语义而不是任意数字。
3. 在 `StructureMaterial` 或 material preset validation 中封住 `depthTest` 这类会破坏 scene policy 的 props。
4. 如果以后要认真支持物理玻璃式透明，再开一个单独设计：不要只调整单个 material flag，需要同时设计跨对象族的透明排序或 order-independent transparency。
