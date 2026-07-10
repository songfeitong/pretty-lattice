# Bond Objects 与场景交互

状态：已实现

范围：`Objects > Bonds`、单根 bond 的场景选中与信息卡片、已有 bond
family 的可见性和自定义 maximum length。

## 目的

Pretty Lattice 中的 atom 来自结构文件，而 bond 通常是 CrystalNN、
MinimumDistanceNN 或 CutOffDictNN 等规则推断出的显示结果。用户需要控制 bond，
但这些操作不应假装是在修改结构文件中的客观数据。

本功能坚持三个方向：

- 继续聚焦 visualization，不把 Objects 变成配位分析面板。
- 信息卡片只用于查看；会改变场景的操作放在 Objects。
- 明确区分“重新计算 bonding”和“只是不画”。

核心语义是：

```text
Hide = 保留 connectivity，只改变可见性
Maximum length = 改变成键规则，重新计算 connectivity
```

修改 maximum length 后，bonds、bond 需要的周期镜像 atoms 和 polyhedra 使用新的
connectivity。隐藏 family 或单根 bond 时，这些派生对象不重新计算。

## 本期范围

本期实现：

- `Objects > Bonds` family 列表。
- Family 的实际 length 范围和可见性。
- 已有 family 的自定义 maximum length。
- Family 级和单根 bond instance 级 Hide。
- 单根 bond 的单击 pulse、双击选中、持续高亮和只读信息卡片。
- 从信息卡片定位到 Objects，并在 family 下临时显示当前 bond。
- Family reset。

本期不实现：

- 添加新的 bond family。
- 手动新增一根当前不存在的 bond。
- 展开或搜索某个 family 下的全部 bond instances。
- Minimum length。
- 配位数、配位环境或其他分析摘要。
- Bond order、primary/secondary bond、氢键或其他 interaction 类型。
- Per-family 颜色、粗细、线型和标签控制。
- 单独为 bond 实现 Undo；以后统一接入全局 Undo。
- 修改并写回结构文件。

## 术语与身份

### Bond family

Bond family 是无方向的元素对，例如 `Fe–O`、`Li–O` 和 `P–O`。内部 key
必须规范化，`Fe–O` 与 `O–Fe` 是同一个 family。

Family 的显示顺序和左右顺序都遵循 canonical unit-cell atoms 中元素第一次出现的
顺序。不要使用纯字母排序，以免把更自然的 `P–O` 显示成 `O–P`。相同输入和相同
scene 必须得到稳定顺序。

### 逻辑 bond relation

逻辑周期连接不能用 `scene.atoms` 的数组下标作为身份。数组下标会在过滤、重算和
scene 重建后变化。

一个逻辑 bond relation 至少包含：

```ts
{
  startSiteId: string;
  endSiteId: string;
  relativeImageOffset: [number, number, number];
}
```

`relativeImageOffset` 是 end atom 相对于 start atom 的晶胞平移。端点顺序必须采用
确定性的规范化规则；交换端点时同时对 relative offset 取反。

这份身份用于 connectivity 去重、重算后匹配和 family 归属。

### 可见 bond instance

平移等价的多根可见圆柱可能共享同一个逻辑 relation。为了只选择或隐藏用户当前
点到的那一根，可见 bond instance 还必须包含两个端点各自的 cell offset：

```ts
{
  startSiteId: string;
  startImageOffset: [number, number, number];
  endSiteId: string;
  endImageOffset: [number, number, number];
}
```

它可以等价地由两个稳定 atom instance id 表示。端点顺序仍需确定性规范化。不要用
`startAtomIndex/endAtomIndex` 持久化 selection、Hide 或 Locate 状态。

## 状态分层

Bonding definition 与 visibility 必须分开保存。

```ts
type CustomBondingProfile = {
  baseAlgorithm: BondAlgorithm;
  cutoffOverrides: Record<BondFamilyKey, number>;
};

type BondVisibilityOverrides = {
  hiddenFamilies: Set<BondFamilyKey>;
  hiddenBondInstances: Set<BondInstanceId>;
};
```

数据结构不要求逐字采用以上 TypeScript，但必须保留同样的语义边界。

### Custom bonding

CrystalNN、Minimum distance 和 CutOffDictNN 是不可修改的 presets。用户第一次为
某个 family 设置 maximum length 后，Bonding algorithm 切换为 `Custom`。

Custom 不是把整个 CrystalNN 结果强行转换成一份 cutoff dict，而是：

```text
base algorithm + sparse family cutoff overrides
```

存在 override 的 family 完全由距离规则接管；没有 override 的 family 继续继承
base algorithm。例如：

```text
Fe–O -> maximum length 2.30 Å
Li–O -> 继续继承 base algorithm
P–O  -> 继续继承 base algorithm
```

距离规则不是与原 family 结果做 union。它既能加入 base algorithm 没选中的短距离
pair，也能移除超过 cutoff 的原 bond。

Custom 草稿在用户临时切回 preset 后保留；再次选择 `Custom` 时恢复。打开新结构或
执行 Reset all 时清空。若 family reset 后已经没有任何 cutoff overrides，则退出空的
Custom 状态并恢复它的 base algorithm。只有 visibility overrides 时不应保持
`Custom`。

### Visibility

Family eye 和 individual eye 都只写入 visibility overrides：

- 不切换到 `Custom`。
- 不改变 family 的 length 范围。
- 不重新计算 one-hop atoms 或 polyhedra。
- 不修改后端的 base connectivity。

## Objects > Bonds

### 基本布局

`Objects` 保留 nested tabs：

- Atoms
- Bonds

`Bonds` 使用紧凑、领域专用的 table，不引入通用 app-wide DataTable。

列为：

- `Bond`
- `Length (Å)`
- `Visible`

不要增加 coordination、rule、bond count 或内部 id 列。

Family row 示例：

```text
Bond                         Length (Å)       Visible

▾ ● Fe — ● O                 1.95–2.23           eye   reset
▸ ● Li — ● O                 1.98–2.43           eye
▸ ● P  — ● O                 1.51–1.75           eye
```

两个圆形 token 分别使用当前两个元素的有效 atom 颜色，带细边框，以免浅色 token
消失在背景中。中间只使用中性的横线，不画缩小版 bond cylinder。

Family rows 默认折叠。每个 family 都可以展开，因为展开区始终包含 maximum length
设置。

### Length

Family row 的 `Length` 是当前 bonding definition 生成出的实际 bond length 范围，
不是 cutoff，也不允许直接编辑。

计算顺序是：

```text
base algorithm
-> 应用 custom family cutoff overrides
-> 得到实际 bonds
-> 计算 family length 范围
-> 最后应用 family/individual visibility
```

因此：

- Hide 最长的一根 bond 不改变 family length。
- 隐藏整个 family 不改变 family length。
- 修改 maximum length 并完成 bonding 重算后，family length 才更新。

Family range 使用紧凑的 Å 格式，最多显示三位小数并去除无意义的末尾零。单值范围
可以显示为一个 length，不必重复两遍。

如果 custom cutoff 使一个已有 family 暂时变成零根 bond，该 family 仍必须保留，
否则用户无法 Reset。此时 `Length` 显示 `—`，Reset 仍可用。

### Visible

可见性继续使用现有 Objects 的 eye/eye-off 语言：

- Visible：eye，正常前景色。
- Hidden：eye-off，muted 颜色。

Family eye 隐藏或显示整个 family。隐藏 family 后，row 和 maximum length 仍可查看、
编辑和 reset。

`Display > Bonds` 是全局有效可见性：

- 关闭时，所有 family 和当前 individual row 都显示为不可见。
- 重新开启时，与现有 Atoms 规则一致，清除 bond family 和 individual visibility
  overrides，使所有 bonding definition 生成的 bonds 恢复可见。
- Object-level visibility 操作不反向关闭 `Display > Bonds`。

### 展开区

Maximum length 是 family 属性，必须始终紧跟 family row。当前 selected bond 只能放在
它后面，不能插入 family 与 maximum length 之间。

```text
▾ ● Fe — ● O                 1.95–2.23           eye   reset

    Maximum length             Automatic          Set

    ● Fe:2 — ● O:7              2.137             eye
```

没有 selected bond 时，展开区在 maximum length 行结束。

### Maximum length

Objects 不重复显示 `CrystalNN` 等具体算法名称。未覆盖的 family 只显示：

```text
Maximum length    Automatic    Set
```

点击 `Set` 后显示紧凑数字输入：

```text
Maximum length    [ 2.30 ] Å    reset
```

规则：

- 第一版只支持 maximum，不支持 minimum。
- 初始建议值使用当前 family 的实际最大 length。
- 用户语义是 `bond length <= maximum length`，边界包含在内。
- 输入框只包含数字，单位放在外部。
- 不在每个 keystroke 后重算；Enter 或失焦时提交。
- 空值、非数字、非有限值、零和负数必须拒绝并恢复上一有效值，不能静默截断。
- 计算期间保留旧 scene；相关输入显示 loading/disabled。
- 只有后端重算成功后才提交新值并切换到 `Custom`。
- 失败时保留旧 scene、旧值和旧 bonding mode，并显示清楚的错误。
- Reset 恢复 `Automatic` 并触发重算。

不要在没有产品依据的情况下用一个很小的固定上限限制科学用例。后端必须在昂贵邻居
搜索前执行安全校验，并继续受现有 scene atom/bond 数量限制保护；超限时返回明确错误，
不能卡死或清空当前 scene。

### Family reset

Family row 只有在该 family 存在修改时才显示 reset affordance。Reset family 清除：

- 该 family 的 maximum-length override。
- 该 family 的 hidden-family override。
- 该 family 的所有 hidden individual bond instance overrides。

Reset 不清除其他 families，也不重置无关的 camera、style、export 或 inspector 状态。

## 单根 bond 的场景交互

### 选择模型

Atom 和 bond 共用一个 scene selection 概念：

```ts
type InspectedSceneObject =
  | { kind: "atom"; id: string }
  | { kind: "bond"; id: string }
  | null;
```

不要让 atom card 和 bond card 同时打开，也不要让 Objects 维护第二份 table selection。

### 点击行为

交互尽量沿用现有 atom 规则：

- 单击 atom：清除 selected bond，atom pulse。
- 双击 atom：选中 atom，打开 atom card。
- 单击 bond：清除 selected atom，bond pulse。
- 双击 bond：选中 bond，打开 bond card。
- 单击已经 selected 的同一对象：保持 selection，不重复 pulse。
- 点击背景、cell 或 polyhedron：清除 selection。
- Interaction locked 时不 pulse、不选择；双击复用现有 lock feedback。

Atom 与 bond 重叠时使用 Three.js/R3F 原生的最近可见表面结果：

- 点击 atom sphere 覆盖区域，atom 优先。
- 点击两个 atom 之间露出的 cylinder，bond 响应。
- 多根 bond 重叠时，离相机最近的 bond 响应。

Atom 和 bond handlers 都应停止事件继续传给后方交点。第一版不做 hover highlight、
重叠对象循环选择或扩大的隐形 bond hit target。若真实使用证明 bond 太难点，再单独设计
克制的 picking tolerance，不能提前让 bond 抢走 atom 点击。

### Pulse 与 selected 视觉

交互节奏和视觉语言与 atom 一致，但 overlay 形状服从对象几何：

```text
Atom single click  -> 短暂向白色提亮
Atom selected      -> 持续提亮 + 圆形 selection ring

Bond single click  -> 整根 bond 短暂向白色提亮
Bond selected      -> 持续提亮 + 沿 cylinder 的细 outline/halo
```

Bond 不使用屏幕朝向圆环。Outline/halo 复用 atom selection 的主题颜色和相近动画节奏，
但不要覆盖或抹掉原来的 unicolor/bicolor 身份。

当前 bicolor bond 的两半颜色写在 geometry vertex colors 中，不适合简单套用 atom 的
`setColorAt()` 高亮。实现应保留原 batched bond，在 pulse/selected 时只为当前一根 bond
渲染独立 highlight overlay。场景同时最多一个 overlay，不能因为 selection 重建整批
bonds。

`BatchedBonds` 应像 `BatchedAtoms` 一样通过 `batchId` registry 把 pointer event 映射到
稳定 bond instance id。`batchId = 0` 必须被视为有效值。

## Bond 信息卡片

信息卡片是只读 surface。它只提供：

- Close。
- Copy。
- Locate in Objects。

不要在卡片里放 Hide、Delete、cutoff 或其他会改变 scene 的操作。

### Header

Header 示例：

```text
close   ● Fe:2 — ● O:7   copy   locate
```

- 两个圆形 token 紧挨各自 atom label。
- Token 使用具体 endpoint atom 的最终有效颜色，包括 per-atom override。
- 周期镜像继承 canonical atom 的颜色。
- 中间使用无方向横线，不使用箭头。
- 不增加独立 bond token、胶囊或缩小圆柱。

### 内容

```text
Length          2.137 Å
Start cell      0, 0, 0
End cell        0, 0, -1
```

规则：

- 使用 `Length`，不用 `Distance`。
- 标题左端 atom 对应 `Start cell`，右端对应 `End cell`。
- start/end 是确定性的几何端点名称，不表示化学方向。
- 两个 cell offset 都显示；不再显示可由它们相减得到的 relative offset。
- 屏幕 length 显示三位小数。

卡片不显示：

- Family。
- Rule 或具体 bonding algorithm。
- Coordination。
- `startAtomIndex/endAtomIndex`。
- Relative cell offset。
- 两个 atom 的完整 fractional/cartesian coordinates。
- Visibility dependencies 或 image reasons。

Copy 文本使用更高精度：

```text
Bond: Fe:2 -- O:7
Length (A): 2.137428
Start cell: 0, 0, 0
End cell: 0, 0, -1
```

### Locate in Objects

Locate：

- 打开 Inspector。
- 切换到 `Objects > Bonds`。
- 展开对应 family。
- 只滚动 inspector body，使当前 contextual bond row 可见。
- 不使用 page-level `scrollIntoView`，不能让整个 preview 跳动。

如果 sidebar 已经打开在 `Objects > Bonds`，双击场景 bond 直接展开并定位。若 sidebar
关闭、位于 Settings 或位于 Objects > Atoms，场景双击本身不自动打开或切换；用户通过
卡片的 Locate 明确执行。

## 当前 bond contextual row

Objects 不列出 family 下的全部 bond。只有当前 selected bond 在对应 family 下出现一根
临时 child row：

```text
● Fe:2 — ● O:7    2.137    eye
```

规则：

- Row 放在 maximum length 之后。
- 使用轻微 selected background。
- 显示具体 endpoints、length 和 individual visibility。
- 不重复显示 start/end cell；这些属于信息卡片。
- Eye-off 只隐藏当前可见 bond instance，不隐藏所有平移等价 relation。
- 控件点击不能触发行 selection。
- selected bond 清除后，row 消失。
- 选中另一根 bond 时，row 更新并在需要时移动到另一个 family。
- Family 手动折叠时可以暂时隐藏 row，但不能清除 scene selection。
- 不保留“最近看过”的 rows，避免逐渐退化为完整 bond list。

隐藏当前 selected bond 后：

- 写入 individual visibility override。
- bond 从 preview 和 export 的有效可见 scene 中消失。
- 清除 selected bond，关闭卡片，contextual row 随之消失。
- 用户通过该 family 的 Reset 恢复。

## Bonding 重算后的状态

修改或 reset maximum length 后，后端基于以下输入重建有效 connectivity：

- 当前结构文件。
- Custom profile 的 base algorithm。
- Sparse family cutoff overrides。

重算必须同时更新：

- Bonds。
- 新 connectivity 需要的 one-hop periodic image atoms。
- Polyhedra。
- Family 实际 length 范围。

重算不应重置：

- Camera pose 或 zoom。
- Component opacity。
- Atom/bond style。
- Inspector open state、active top-level tab 和 Objects nested tab。
- Family 展开状态，只要 family 仍然存在。

Selection 按稳定身份协调：

- Selected bond instance 在新 scene 中仍存在时，保持 selection 和信息卡片。
- Selected bond 被 cutoff 移除时，清除 selection 和卡片。
- Selected atom 仍存在且可见时保持；因 one-hop connectivity 变化消失时清除。

## Preview、export 与 demand rendering

Preview 和 export 必须使用同一份有效 bond visibility 与 custom bonding 结果。不能出现
preview 已隐藏而 export 仍显示，或 preview 已重算而 export 仍使用 base scene 的情况。

Preview Canvas 使用 demand rendering。以下变化都必须主动请求 frame：

- Bond pulse/selected overlay。
- Family 或 individual visibility。
- Bonding 重算完成后的 scene 替换。
- Family reset。

## 前后端边界

Python backend 负责：

- 读取结构。
- 执行 base bonding algorithm。
- 对存在 cutoff override 的 family 做周期距离搜索并替换该 family 结果。
- 合并、规范化和去重 connectivity。
- 生成需要的周期镜像 atoms、bonds 和 polyhedra。
- 执行输入、scene 数量和计算成本保护。

Web frontend 负责：

- Custom draft 与 visibility overrides 的用户状态。
- Objects family table 和 contextual row。
- Selection、pulse、highlight、信息卡片和 Locate。
- 从稳定 ids 解析 preview/export 可见性。
- 在提交 maximum length 时把 base algorithm 和 sparse overrides 发送给 backend。

Backend scene contract 应为 bond instances 提供稳定身份所需的数据。保留 index endpoints
用于紧凑几何引用是允许的，但任何用户状态都不能以数组下标为持久 key。

## 验收要点

- Bonds 按 family 聚合，不渲染完整 individual list。
- Family ordering 和 endpoint ordering 稳定、自然。
- Family `Length` 只读，Hide 不改变它，cutoff 重算会改变它。
- 零 bond 的 custom family 保留为 `—`，可以 Reset。
- Family/individual Hide 不切换 Custom，也不重算 polyhedra。
- Maximum length 成功提交后切换 Custom，并更新 bonds、one-hop atoms 和 polyhedra。
- Reset family 只影响目标 family；最后一个 cutoff override 被清除后退出空 Custom。
- Atom/bond click 和 double-click 互斥、lock-aware，并按最近可见表面响应。
- Bicolor 与 unicolor bond 都能 pulse 和持续高亮，不重建整批 bonds。
- Bond card 严格只读，字段和 copy 格式符合本 spec。
- Locate 只滚动 inspector body，并只显示当前 contextual bond row。
- 隐藏 selected bond 后 selection、card 和 contextual row 正确清除。
- 重算后仍存在的 selection 保留；消失的 selection 清除。
- Preview 与 export 一致。
- 不使用浏览器或 Playwright 作为默认验证步骤；按项目约定使用 Bun/Python 测试、
  typecheck 和 build。
