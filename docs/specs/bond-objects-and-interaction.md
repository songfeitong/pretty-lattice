# Bond Objects 与场景交互

状态：已实现

范围：`Objects > Bonds`、bond family 外观与显隐、区间 cutoff 编辑、单根 bond
的场景选择与信息卡片。

## 1. 产品定位

Pretty Lattice 是结构可视化工具，不是配位环境分析软件。结构文件提供 atoms；bonds
则由 CrystalNN、MinimumDistanceNN、CutOffDictNN 或用户的稀疏区间 override 推断。

界面必须持续区分两类操作：

```text
Hide    = connectivity 不变，只改变绘制
Cutoff  = 修改成键定义，重新计算 connectivity
```

因此：

- 高频外观与显隐操作放在普通 Family 行。
- 低频 cutoff 使用独立编辑模式，并放在 separator 上方的全局成键区域。
- 信息卡片负责查看单根 bond，不承担 cutoff 编辑。
- Objects 不长期展示只读 bond-length range；它对可视化工作流价值有限。

## 2. 对象身份

### 2.1 Bond family

Bond family 是无方向的元素对，例如 `Fe–O`。内部 key 必须规范化；`Fe–O` 与
`O–Fe` 是同一 family。

Family 的顺序和左右元素顺序都遵循 canonical unit-cell atoms 中元素首次出现的
顺序，不使用纯字母排序。相同 scene 必须得到稳定顺序。

本功能只编辑当前基础 connectivity 已存在的 families，不提供新增元素对的入口。
增大某个已有 family 的区间上界可以加入基础算法未选中的更长连接。

### 2.2 逻辑 bond relation

逻辑周期连接的身份至少包含：

```ts
{
  startSiteId: string;
  endSiteId: string;
  relativeImageOffset: [number, number, number];
}
```

端点按确定性规则规范化；交换端点时同时对 relative offset 取反。relation identity
不能依赖 `scene.atoms` 数组下标。

### 2.3 可见 bond instance

同一逻辑 relation 可能在显示范围中产生多根周期平移副本。单次拾取仍以可见 instance
为目标，其身份还包含两个端点各自的 cell offset：

```ts
{
  startSiteId: string;
  startImageOffset: [number, number, number];
  endSiteId: string;
  endImageOffset: [number, number, number];
}
```

Selection 和信息卡片保持 instance 级；Hide 保持 relation 级，即隐藏一根 bond 时，
共享 `relationId` 的所有 periodic images 一起隐藏。

## 3. 状态边界

Bonding definition、visibility 和 appearance 分开保存：

```ts
type BondCutoffRange = {
  min: number;
  max: number;
};

type CustomBondingProfile = {
  baseAlgorithm: BondAlgorithm;
  cutoffOverrides: Record<BondFamilyKey, BondCutoffRange>;
};

type BondVisibilityOverrides = {
  hiddenFamilies: Set<BondFamilyKey>;
  hiddenBondRelations: Set<BondRelationId>;
};
```

Appearance 继续使用全局、family、individual 三层覆盖：

```text
global bond appearance
  -> family radius / opacity override
    -> individual bond radius / opacity override
```

数据结构可以采用等价实现，但不得混合这三类状态。

## 4. Custom bonding 语义

CrystalNN、Minimum distance 和 CutOffDictNN 是不可修改的 presets。Custom 是：

```text
base algorithm + sparse family interval overrides
```

存在 override 的 family 完全由闭区间距离规则接管：

```text
minimum <= bond length <= maximum
```

两端比较保留很小的浮点容差。没有 override 的 family 继续继承 base algorithm。
区间规则不是与基础结果做 union；它既能添加基础算法未选中的连接，也能移除区间外的
原连接。

合法区间必须满足：

```text
minimum 和 maximum 都是有限数字
minimum >= 0
maximum > minimum
```

用户第一次提交任一 override 后，Bonding algorithm 显示为 `Custom`。最后一个
override 被移除后恢复 base algorithm。用户主动切换到任一 preset 时，整份 Custom
profile 立即清空；之后再次进入 cutoff 编辑模式时，必须从该 preset 当前生成结果重新
建立建议值。打开新结构或 Reset all 时同样清空。

若 custom override 令一个 family 暂时变成零根 bond，该 family 仍保留在列表中，
以便用户显式恢复自动规则。恢复后若基础算法也不存在该 family，重算后它从列表消失。

## 5. Objects > Bonds 普通模式

### 5.1 顶部全局区域

separator 上方依次显示：

1. Bond radius scale。
2. Bonding algorithm。
3. Custom cutoff。

Custom cutoff 使用与前两行相同的左右布局：左侧固定标签，右侧是 icon-only 入口。
Tooltip 为 `Edit custom cutoff / 编辑自定义截断距离`。存在任一 override 时，入口图标
使用激活样式，但不增加 badge、数量或说明文字。

入口使用 paper-and-pen edit 图标，尺寸与 `X / Check` 相同，边框常驻。进入或退出
编辑模式时，edit 图标与 `X / Check` 操作组
之间使用 150 ms 的轻微淡入和缩放动画；右侧控制列宽保持不变。Reduced motion 下取消
动画。

separator 明确区分“会重算 connectivity 的全局成键设置”和下方对象控制。

### 5.2 Family 列表

普通模式与 Atoms 使用相同的视觉和列结构：

```text
Bond | R (Å) | Opacity | Visibility
```

每个 family 始终只显示主操作行：

- 左列：两个 14 px 元素视觉 token、短连接线和 sans semibold 元素文本。
- 中间两列：居中的 radius 与 opacity 数值输入。
- 右列：Eye / EyeOff。

不显示 family 数量，不提供 family 折叠，不显示只读 Bond length，也不常驻显示 cutoff。
Family card 的高度、圆角、边框、背景、输入框和 icon button 均尽量复用 Atoms 样式。

### 5.3 Selected bond workspace

普通模式下，当前选中的 bond 在所属 family 下方临时显示独立 workspace：

- 与 family 主行之间使用 separator 和弱化背景区分。
- 显示 individual radius、opacity 和 visibility。
- 不重复显示 bond length。
- radius 和 opacity 从 family 继承；修改后写入 individual override。

## 6. Cutoff 编辑模式

### 6.1 进入与退出

点击顶部 Custom cutoff 图标后：

- 全部 Family 同时进入 cutoff 编辑模式。
- 当前选中的 bond 立即取消，信息卡关闭。
- Bonding algorithm 暂时禁用。
- Bond radius scale 保持可用，因为它不影响 connectivity。
- 顶部入口原位替换为 `X` 和 `Check` 两个 icon-only 按钮。
- `X` 和 `Check` 不显示 Tooltip；aria-label 保留完整操作描述。
- `X` 直接丢弃整批草稿并退出，不二次确认、不重算。
- `Check` 校验并提交整批草稿。

编辑期间仍允许用户在场景中重新选择 bond 查看信息卡，以便参考单根键长；Family 下方
不显示 selected bond workspace。退出编辑模式后，仍存在的选择可以恢复普通 workspace。

全局操作区不 sticky，也不在列表底部复制。Family 数量通常较少；键盘操作可以减少
往返滚动。

### 6.2 Family 编辑行

编辑模式复用普通模式四列宽度，不增加 card 高度：

```text
Bond | Min (Å) | Max (Å) | Restore
```

- 两个输入框居中、等宽、使用紧凑 mono 数字字体。
- focus 边框、背景和 ring 与 Family 的 radius/opacity 数值输入完全一致。
- 单位只放在表头，不在每个输入框内重复。
- 中文表头使用 `下界 (Å)` 和 `上界 (Å)`；英文使用 `Min (Å)` 和 `Max (Å)`。
- 最后一列用 `RotateCcw` 表示恢复基础算法，不使用减号，避免被理解成删除 family。
- 不增加说明文字、badge 或额外详情行。

普通模式与 cutoff 编辑模式切换时，每个 Family 的后三列使用 300 ms 的淡入与 2 px
垂直位移动画；卡片高度、Family token 和列宽保持不动。Reduced motion 下取消该动画。

### 6.3 初始草稿

已有 override 的 family 显示当前 `min` 和 `max`。

没有 override 的 family 显示一个未生效的建议起点：

```text
0 - 当前实际生成结果的最大 bond length
```

这里的 maximum 只是编辑起点，不宣称是基础算法的 cutoff。默认 maximum 向上取整到
三位小数，避免用户只修改 minimum 后因显示舍入误删当前最长 bond。输入框失焦或提交
时统一格式化为三位小数，例如 `0.000`、`2.000`；提交仍使用对应数值。

未修改的建议值不生成 override。聚焦、失焦或以不同文本格式重新输入同一数值也不算
实际变化。

### 6.4 Restore

Restore 始终是显式操作：

- 已有 override：点击后标记为待移除；原数值保留，但输入框禁用并淡化。
- 再点一次：撤销待移除，恢复可编辑。
- 没有 override、但存在本轮草稿修改：点击后丢弃该 family 的修改，回到建议起点。
- 没有 override 且未修改：按钮不可用。

Restore 不立即重算，只参与全局批量提交。

### 6.5 校验反馈

只有实际修改或待新增的 families 参与输入校验；未修改并继续继承基础算法的 families
不参与。

任一参与项无效时：

- 整批拒绝提交。
- 不触发重算。
- 不弹 toast，不显示错误文字。
- 对对应输入框播放一次与 View Lock 相同语气的短暂 halo。
- `max <= min` 时两个输入框同时 halo。
- 保持编辑模式和全部草稿，等待用户修正。

### 6.6 批量提交

提交是原子操作：

1. 从当前稀疏 overrides 复制事务草稿。
2. 应用所有合法的新区间与待移除标记。
3. 若最终映射与当前状态完全相同，直接退出，不发送请求。
4. 否则只发送一次重算请求。
5. 请求期间 `Check` 显示 spinner，输入和模式按钮锁定。
6. 成功后保存新 profile、退出编辑模式并切回普通 Family 行。
7. 失败时保持旧 scene 与旧 profile，恢复输入可编辑，并保留整批草稿供重试。

后端错误沿用现有 connectivity 错误提示；halo 只表达本地校验失败。

### 6.7 键盘

- `Enter`：等同全局 Check，校验并提交整批草稿。
- `Escape`：等同全局 X，丢弃整批草稿。
- `Tab`：按正常顺序遍历输入框和 Restore。
- focus：与 Objects 中其他紧凑数字输入一致，暂时清空当前显示值以便直接输入。
- blur：未编辑时恢复原值；已编辑时只格式化并保留草稿，不提交、不重算。

## 7. Visibility

### 7.1 Family visibility

Family Eye/EyeOff 写入 `hiddenFamilies`，不修改 connectivity。隐藏 family 时，其周期
副本和依赖显示对象按现有 visibility dependency 规则一起不绘制。

### 7.2 Relation visibility

单根 bond 的 Hide 写入 `hiddenBondRelations`。共享 relationId 的所有 periodic images
一起隐藏。Hidden bonds 列表按 relation 去重，不为每个周期副本重复列项。

恢复单根 bond 只移除 relation override；若 family 或全局 bonds 仍隐藏，它仍保持不可见。
Hidden bonds 区域的位置、折叠、计数和恢复按钮样式与 Hidden atoms 一致。

## 8. 场景选择与信息卡片

### 8.1 选择

- 单击 bond：pulse。
- 双击 bond：持续选择并打开信息卡。
- 选中 bond 后按 `H`：等同信息卡片的 Hide，并按 relation 隐藏；输入或编辑文本时不触发。
- 选择使用 instance id；Hide 使用 relation id。
- family 或 relation 被隐藏时，相关 selection 清除。
- cutoff 重算后，若原 bond id 不存在，selection 和信息卡清除。

### 8.2 Bond 信息卡

信息卡标题使用两个端点的 site label。字段为：

- `Bond length / 键长`
- `Vector (frac)`：start 指向 end 的 fractional vector，三个分量用逗号分隔。
- `Cell shift / 晶胞平移`：显示 `endImageOffset - startImageOffset`，即从 start 到 end
  跨越的整数晶格平移 `relativeImageOffset`。

Header actions 与 Atom 信息卡对齐：Close、Hide、Copy、Locate。Hide 位于相同位置并采用
相同图标，Tooltip 标注快捷键 `H`。信息卡不放 cutoff、Delete 或其他成键设置。

## 9. 重算与派生对象

前端提交以下输入：

```text
base algorithm
sparse family interval overrides
```

后端对所有 override 取最大的 `max` 作为一次 periodic neighbor search 半径，再按各
family 的闭区间过滤候选。没有 override 的 family 继续使用 base algorithm 结果。

重算成功后必须基于同一 connectivity 一次性重建：

- bonds 与 bond families；
- bond 需要的 periodic image atoms；
- polyhedra；
- selection 所依赖的 scene identity 映射。

任何分析、序列化、安全上限或响应构建失败都不得部分提交。旧 scene 保持可用。

现有安全限制继续生效：

- 最大 neighbor-search 半径的成本预检。
- 最大候选 periodic neighbors。
- 最大 scene bonds、atoms、polyhedra 和响应体大小。
- override family 必须存在于 base connectivity。

## 10. Preview 与 Export 一致性

Preview 和 export 必须共享同一套：

- effective connectivity；
- family/relation visibility；
- global → family → individual 的 radius 和 opacity 解析；
- periodic-image dependency 过滤。

不得出现 preview 已按区间移除 bond，而 export 仍使用旧 connectivity 的情况。

## 11. 验收标准

至少覆盖以下行为：

- 普通模式只显示 `Family / R / Opacity / Eye`，无数量、只读键长和常驻 cutoff 行。
- 顶部 Custom cutoff 入口位于 separator 上方，存在 override 时显示激活状态。
- 进入编辑后全部 Family 同时切换为 `Min / Max / Restore`。
- 默认建议 maximum 按三位小数向上取整，未修改时不生成 override。
- 下界和上界都参与闭区间过滤。
- 任一无效区间令整批本地拒绝，并只播放输入框 halo。
- 多个 Family 修改与 Restore 只触发一次请求。
- 无实际变化时退出但不请求。
- 取消不请求，后端失败保留草稿和旧 scene。
- 编辑期间算法选择器禁用、radius scale 可用、selected workspace 隐藏。
- 进入编辑清除旧 bond selection，编辑中仍可重新查看信息卡。
- Restore 最后一个 override 后退出 Custom 并恢复 base algorithm。
- 零 bond custom family 保留；恢复后可按 base connectivity 消失。
- relation Hide 同时隐藏所有 periodic images，Hidden bonds 按 relation 去重。
- preview/export 的 connectivity、visibility、radius 和 opacity 一致。
