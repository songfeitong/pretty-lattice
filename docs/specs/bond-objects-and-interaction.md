# Bond Objects 与场景交互

状态：已实现

范围：`Objects > Bonds`、单根 bond 的场景选中与信息卡片、已有 bond
family 的可见性、外观和自定义 cutoff。

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
Cutoff = 改变成键规则，重新计算 connectivity
```

修改 cutoff 后，bonds、bond 需要的周期镜像 atoms 和 polyhedra 使用新的
connectivity。隐藏 family 或单根 bond 时，这些派生对象不重新计算。

## 本期范围

本期实现：

- `Objects > Bonds` family 列表。
- Family 的实际 bond length 范围、半径、不透明度和可见性。
- 已有 family 的自定义 cutoff。
- Family 级和逻辑 bond relation 级 Hide；同一 relation 的所有周期副本一起隐藏。
- 单根 bond 的单击 pulse、双击选中、持续高亮和只读信息卡片。
- 从信息卡片定位到 Objects，并在 family 下临时显示当前 bond。
- 单根 bond instance 的半径、不透明度，以及按 relation 去重的隐藏恢复列表。

本期不实现：

- 添加新的 bond family。
- 手动新增一根当前不存在的 bond。
- 展开或搜索某个 family 下的全部 bond instances。
- Minimum length。
- 配位数、配位环境或其他分析摘要。
- Bond order、primary/secondary bond、氢键或其他 interaction 类型。
- Per-family 颜色、线型和标签控制。
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
  hiddenBondRelations: Set<BondRelationId>;
};
```

数据结构不要求逐字采用以上 TypeScript，但必须保留同样的语义边界。

### Custom bonding

CrystalNN、Minimum distance 和 CutOffDictNN 是不可修改的 presets。用户第一次为
某个 family 设置 cutoff 后，Bonding algorithm 切换为 `Custom`。

Custom 不是把整个 CrystalNN 结果强行转换成一份 cutoff dict，而是：

```text
base algorithm + sparse family cutoff overrides
```

存在 override 的 family 完全由距离规则接管；没有 override 的 family 继续继承
base algorithm。例如：

```text
Fe–O -> cutoff 2.30 Å
Li–O -> 继续继承 base algorithm
P–O  -> 继续继承 base algorithm
```

距离规则不是与原 family 结果做 union。它既能加入 base algorithm 没选中的短距离
pair，也能移除超过 cutoff 的原 bond。

Custom 草稿在用户临时切回 preset 后保留；再次选择 `Custom` 时恢复。打开新结构或
执行 Reset all 时清空。若移除 cutoff 后已经没有任何 cutoff overrides，则退出空的
Custom 状态并恢复它的 base algorithm。只有 visibility overrides 时不应保持
`Custom`。

### Visibility

Family eye 和 relation eye 都只写入 visibility overrides：

- 不切换到 `Custom`。
- 不改变 family 的 length 范围。
- 不重新计算 one-hop atoms 或 polyhedra。
- 不修改后端的 base connectivity。

## Objects > Bonds

### 基本布局

`Objects` 保留 nested tabs：

- Atoms
- Bonds

`Bonds` 使用与 `Atoms` 相同的 card、column header、selected workspace 和 hidden recovery
视觉语言，不使用 table。

Family cards 之前依次显示两个全局选项：

- `Bonding algorithm` Select。
- `Radius scale` Slider，控制所有 bond cylinder 的整体半径缩放。

两行使用与 `Objects > Atoms` 顶部控制完全相同的 label、control 列宽、左右 padding、
行高和垂直间距。全局控制与 family cards 之间使用 separator 分隔。Styles 面板不显示
Size section，也不重复显示或重置 bond radius scale。

主行列为：

- `Bond`
- `R (Å)`
- `Opacity`
- visibility icon

不要增加 coordination、rule、bond count 或内部 id。Bond family 不显示数量。

Family card 示例：

```text
Bond                         R (Å)   Opacity

▾ ● Fe — ● O                 0.10      100       eye
▸ ● Li — ● O                 0.10      100       eye
▸ ● P  — ● O                 0.10      100       eye
```

两个圆形 token 分别使用当前两个元素的有效 atom 颜色，带细边框，以免浅色 token
消失在背景中。中间只使用中性的横线，不画缩小版 bond cylinder。

Family cards 不提供折叠；`Bond length` 和 `Cutoff` 始终显示。第一个元素 token 与
Atoms 主行使用相同的左边距和垂直对齐，但 Bonds 中所有元素 token 统一为 14px。
Family 元素符号沿用 Atoms 的 sans semibold；只有带 site index 的 individual bond
label 使用 mono。

### Bond length

Family 内容区的 `Bond length` 是当前 bonding definition 生成出的实际范围，
不是 cutoff，也不允许直接编辑。

计算顺序是：

```text
base algorithm
-> 应用 custom family cutoff overrides
-> 得到实际 bonds
-> 计算 family length 范围
-> 最后应用 family/relation visibility
```

因此：

- Hide 最长的一根 bond 不改变 family length。
- 隐藏整个 family 不改变 family length。
- 修改 cutoff 并完成 bonding 重算后，family bond length 才更新。

Family range 使用紧凑的 Å 格式，最多显示三位小数并去除无意义的末尾零。单值范围
可以显示为一个 length，不必重复两遍。

如果 custom cutoff 使一个已有 family 暂时变成零根 bond，该 family 仍必须保留，
否则用户无法移除 cutoff。此时 `Bond length` 显示 `—`，Remove 仍可用。

### Visible

可见性继续使用现有 Objects 的 eye/eye-off 语言：

- Visible：eye，正常前景色。
- Hidden：eye-off，muted 颜色。

Family eye 隐藏或显示整个 family。隐藏 family 后，card、Bond length 和 Cutoff 仍可查看
和编辑；主行不出现 reset 图标。

`Display > Bonds` 是全局有效可见性：

- 关闭时，所有 family 和当前 relation row 都显示为不可见。
- 重新开启时，与现有 Atoms 规则一致，清除 bond family 和 relation visibility
  overrides，使所有 bonding definition 生成的 bonds 恢复可见。
- Object-level visibility 操作不反向关闭 `Display > Bonds`。

### Family 内容区

`Bond length` 和 `Cutoff` 是 family 属性，放在 family 主行后的固定内容区。当前
selected bond workspace 放在它们之后。Family 主操作行与 Bond length/Cutoff 区域之间
不加 separator，也不改变背景色；它们共同属于同一张 family card。只有 selected bond
workspace 使用 separator 和灰色背景形成层级区别。

```text
▾ ● Fe — ● O                  0.10      100       eye
    Bond length                         1.95–2.23 Å
    Cutoff                 [ 2.30 ] Å   check   minus
    ● Fe:2 — ● O:7             0.10      100       eye
```

没有 selected bond 时，family card 在 Cutoff 行结束。

### Cutoff

Objects 不重复显示 `CrystalNN` 等具体算法名称。输入框始终存在：

```text
Cutoff    [      ] Å    check(disabled)    minus(disabled)
```

存在 override 时显示当前生效值：

```text
Cutoff    [ 2.30 ] Å    check    minus
```

规则：

- 第一版只支持 maximum，不支持 minimum。
- 当前 family 的实际最大 bond length 只作为空输入框的 placeholder。
- 用户语义是 `bond length <= cutoff`，边界包含在内。
- 输入框只包含数字，单位放在外部。
- 不在每个 keystroke 或失焦后重算；确认图标或 Enter 提交。
- Escape 恢复当前生效值；没有 override 时恢复为空。
- 空值、非数字、非有限值、零和负数不能提交，并通过 invalid 状态反馈。
- 计算期间保留旧 scene；相关输入显示 loading/disabled。
- 只有后端重算成功后才提交新值并切换到 `Custom`。
- 失败时保留旧 scene、旧值和旧 bonding mode，并显示清楚的错误。
- 减号图标移除当前 family 的 cutoff override 并触发重算。

不要在没有产品依据的情况下用一个很小的固定上限限制科学用例。后端必须在昂贵邻居
搜索前执行安全校验，并继续受现有 scene atom/bond 数量限制保护；超限时返回明确错误，
不能卡死或清空当前 scene。

### 外观继承与隐藏恢复

Bond 外观与 Atoms 使用同样的继承语义：global bond radius/opacity -> family override ->
individual bond override。修改 family 的某个外观属性会清除该 family 下相同属性的单键
override。Family 和 selected bond 均提供 `R (Å)`、`Opacity` 与 visibility。

Family 隐藏只改变 family eye，不把所有成员列进恢复区。明确隐藏的逻辑 bond relation
放进底部 `Hidden bonds` Collapsible；同一 relation 的周期平移副本只显示一行。该区域使用
与 `Hidden atoms` 相同的 separator、标题、计数、展开动画和减号恢复按钮。恢复会移除
relation hidden override，使其所有周期副本一起恢复；如果 family 仍隐藏，它们仍不可见。

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
- Hide。
- Copy。
- Locate in Objects。

Hide 与 atom 信息卡使用相同的位置和图标。不要在卡片里放 Delete、cutoff 或其他成键
定义操作。

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
Bond length     2.137 Å
Vector (frac)    0.500, -0.250, 0.000
Cell offset     (0, 0, 0) - (0, 0, -1)
```

规则：

- 使用 `Bond length`，不用 `Length` 或 `Distance`。
- `Vector (frac)` 是从标题左端 start atom 指向右端 end atom 的分数坐标向量，三个分量用逗号分隔，屏幕显示三位小数。
- `Cell offset` 按标题中左右两个 atom 的顺序显示两个端点的晶胞偏移。
- 两个端点是确定性的几何顺序，不表示化学方向。
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
Bond length (A): 2.137428
Vector (frac): 0.500000, -0.250000, 0.000000
Cell offset: (0, 0, 0) - (0, 0, -1)
```

### Locate in Objects

Locate：

- 打开 Inspector。
- 切换到 `Objects > Bonds`。
- 定位到对应 family。
- 只滚动 inspector body，使当前 contextual bond row 可见。
- 不使用 page-level `scrollIntoView`，不能让整个 preview 跳动。

如果 sidebar 已经打开在 `Objects > Bonds`，双击场景 bond 直接定位。若 sidebar
关闭、位于 Settings 或位于 Objects > Atoms，场景双击本身不自动打开或切换；用户通过
卡片的 Locate 明确执行。

## 当前 bond contextual row

Objects 不列出 family 下的全部 bond。只有当前 selected bond 在对应 family 下出现一根
临时 child row：

```text
● Fe:2 — ● O:7    2.137    eye
```

规则：

- Workspace 放在 family 的 Bond length 与 Cutoff 之后。
- 使用与 selected atom 相同的轻微 selected background 和展开动画。
- 显示具体 endpoints、R (Å)、Opacity 和 individual visibility；不重复显示单根键长。
- 不重复显示 start/end cell；这些属于信息卡片。
- Eye-off 隐藏当前 instance 所属的整个逻辑 relation，包括所有周期平移副本。
- 控件点击不能触发行 selection。
- selected bond 清除后，row 消失。
- 选中另一根 bond 时，row 更新并在需要时移动到另一个 family。
- 不保留“最近看过”的 rows，避免逐渐退化为完整 bond list。

隐藏当前 selected bond 后：

- 写入 relation visibility override。
- bond 从 preview 和 export 的有效可见 scene 中消失。
- 清除 selected bond，关闭卡片，contextual row 随之消失。
- 用户通过底部 `Hidden bonds` 恢复。

## Bonding 重算后的状态

设置或移除 cutoff 后，后端基于以下输入重建有效 connectivity：

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

Selection 按稳定身份协调：

- Selected bond instance 在新 scene 中仍存在时，保持 selection 和信息卡片。
- Selected bond 被 cutoff 移除时，清除 selection 和卡片。
- Selected atom 仍存在且可见时保持；因 one-hop connectivity 变化消失时清除。

## Preview、export 与 demand rendering

Preview 和 export 必须使用同一份有效 bond visibility 与 custom bonding 结果。不能出现
preview 已隐藏而 export 仍显示，或 preview 已重算而 export 仍使用 base scene 的情况。

Preview Canvas 使用 demand rendering。以下变化都必须主动请求 frame：

- Bond pulse/selected overlay。
- Family 或 relation visibility。
- Bonding 重算完成后的 scene 替换。
- Family 或 individual 外观修改。

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
- Objects family cards、selected workspace 和 Hidden bonds。
- Selection、pulse、highlight、信息卡片和 Locate。
- 从稳定 ids 解析 preview/export 可见性。
- 在提交或移除 cutoff 时把 base algorithm 和 sparse overrides 发送给 backend。

Backend scene contract 应为 bond instances 提供稳定身份所需的数据。保留 index endpoints
用于紧凑几何引用是允许的，但任何用户状态都不能以数组下标为持久 key。

## 验收要点

- Bonds 顶部的 Bonding algorithm 与 Radius scale 对齐，并与 Atoms 顶部控制使用相同布局。
- Styles 不显示 Size section；atom 与 bond radius scale 分别只存在于对应 Objects tab。
- Bonds 按 family 聚合，不渲染完整 individual list。
- Family ordering 和 endpoint ordering 稳定、自然。
- Family `Bond length` 只读，Hide 不改变它，cutoff 重算会改变它。
- 零 bond 的 custom family 保留为 `—`，可以移除 cutoff。
- Family/relation Hide 不切换 Custom，也不重算 polyhedra。
- Cutoff 成功提交后切换 Custom，并更新 bonds、one-hop atoms 和 polyhedra。
- Remove 只移除目标 family 的 cutoff；最后一个 cutoff override 被清除后退出空 Custom。
- Atom/bond click 和 double-click 互斥、lock-aware，并按最近可见表面响应。
- Bicolor 与 unicolor bond 都能 pulse 和持续高亮，不重建整批 bonds。
- Bond card 严格只读，字段和 copy 格式符合本 spec。
- Locate 只滚动 inspector body，并只显示当前 contextual bond row。
- 隐藏 selected bond 后 selection、card 和 contextual row 正确清除。
- 重算后仍存在的 selection 保留；消失的 selection 清除。
- Preview 与 export 一致。
- 不使用浏览器或 Playwright 作为默认验证步骤；按项目约定使用 Bun/Python 测试、
  typecheck 和 build。
