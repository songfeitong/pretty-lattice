# 原子对象与场景交互

状态：已实现

范围：`Objects > Atoms`、元素级与单原子显示样式、原子信息卡片，以及场景选择与
Objects 的联动。

## 目的

`Objects > Atoms` 是低频但精确的显示样式工作区，不是原子数据浏览器。用户首先在
三维场景中识别并选中原子，再在 Objects 中编辑当前对象。面板不渲染无法单凭编号理解的
完整原子列表。

界面分为三个层级：

1. 常驻的元素容器，负责批量控制。
2. 当前 selected atom 的临时工作面板，负责单原子控制。
3. individually hidden atoms 的轻量恢复项，负责清除单原子隐藏状态。

信息卡片保持以只读信息为主，只额外提供一个可逆的 Hide 快捷操作。颜色、半径等属性编辑
继续位于 Objects。

## 对象身份与周期镜像

Atoms 面板只管理 canonical unit-cell sites。周期镜像不作为独立可编辑对象出现，而是通过
共享 `siteId` 继承 canonical site 的颜色、半径和可见性。

用户选中周期镜像时：

- 信息卡片显示被点击实例的实际 fractional/cartesian coordinates 和 cell offset。
- Objects 中出现对应 canonical site 的 selected workspace。
- Objects 中的样式修改作用于该 canonical site 及其所有周期镜像。

原子标签使用 `元素:site index`，例如 `Li:15`。不要显示后端 `siteId` 的连字符形式。

## 元素容器

每种元素显示为一个独立的圆角矩形容器。元素顺序采用 canonical atoms 在 `scene.atoms`
中的首次出现顺序。

元素容器使用轻边框、克制的 surface background 和元素间 gap，不使用 table 分割线。
没有展开按钮，也没有 collapsed/expanded 状态。

容器 header 常驻显示：

- 元素颜色 token；点击后使用现有颜色选择器编辑整个元素。
- 元素符号。
- canonical site 数量。
- 当前元素级有效半径，单位为 Å。
- 当前元素级有效可见性。

元素 header 是批量控制面。编辑某一属性时，将该属性应用到该元素的所有 atoms，并清除
该元素下对应的单原子 overrides。颜色、半径和可见性相互独立，不得因编辑一个属性清除
另外两个属性。

元素容器保留 context menu 中的 `Apply to all atoms`。该操作将 header 当前的颜色、半径
和可见性应用到该元素，并清除该元素下所有对应的单原子 overrides。

## Selected atom workspace

场景中存在 selected atom 时，对应元素容器内出现一个临时 selected workspace。它位于
元素 header 下方、Hidden atoms 之前。

Selected workspace 不是另一张 card。它只用一条分隔线与元素 header 分开，内容直接排在
元素容器内；不增加圆角、边框或独立底色，避免无意义的嵌套 surface。

Workspace 显示并允许编辑：

- 原子颜色 token 和 `元素:site index` 标签。
- 单原子有效半径。
- 单原子有效可见性。

单原子颜色和半径编辑保留为 atom-level overrides。Selection 清除后 workspace 消失，但
overrides 继续生效；该原子仍可在场景中重新选中。

界面中最多存在一个 selected workspace。选中另一原子时，workspace 移动到对应元素容器。
不保留最近选中过的 atoms。

## Hidden atom recovery rows

Hidden atoms 只包含具有显式 atom-level `visible: false` override 的 canonical sites。

以下 effective hidden 状态不得展开为 hidden atom rows：

- `Display > Atoms` 全局关闭。
- 元素级 visibility 关闭。
- 其他上层显示规则导致的隐藏。

这保证隐藏整个元素或全局关闭 atoms 时不会重新产生大型原子列表。

某个元素存在 individually hidden atoms 时，在该元素容器底部显示 `Hidden atoms` 区域。
Rows 按 canonical site 原始顺序排列。每行只显示：

- 只读的原子颜色 token；保留当前有效颜色，但不能打开颜色编辑器。
- `元素:site index`。
- `Minus` 恢复按钮。

Hidden recovery row 不提供颜色编辑、半径或 selection，不打开信息卡片，也不使用 selected
background。按钮 tooltip 使用“恢复元素可见性”的语义。

点击 `Minus` 删除该 atom 的 visibility override，使它重新继承元素可见性：

- 元素可见时，该原子重新出现在场景和导出中。
- 元素隐藏时，该原子继续随元素隐藏。
- 无论最终 effective visibility 如何，该 row 都因 explicit override 被删除而消失。

## 原子信息卡片

双击场景原子后显示信息卡片。Header 顺序为：

```text
close   ● Na:2                   eye-off   copy   locate
```

右侧三个操作中，Hide 位于最左侧并使用 `EyeOff`。Close 继续使用 `X`；不要使用第二个
`X` 表示 Hide。

卡片提供：

- Close。
- Hide atom。
- Copy。
- Locate in Objects。

Hide 是卡片唯一会改变场景的快捷操作。它写入 canonical site 的 atom-level
`visible: false`，因此同一 site 的所有周期镜像一起隐藏。随后清除 selection、关闭卡片，
并在对应元素容器中生成 hidden recovery row。Hide 不自动打开 Objects sidebar。

卡片内容始终显示：

```text
Fractional          1.250, 0.500, -0.852
Cartesian (Å)        6.005, 2.300, -11.176
Cell offset         1, 0, -1
```

- 坐标属于被点击的可见 atom instance，而不是 canonical unit-cell atom。
- Fractional coordinates 允许超出 `[0, 1)`。
- Cartesian label 使用 thin space `U+2009` 和 Å。
- Cell offset 始终显示，包括 `0, 0, 0`。
- 屏幕坐标显示三位小数。
- Copy 使用同一 instance coordinates，保留六位小数。

## 场景选择与 Locate

场景的 selected atom id 是唯一 selection source。Objects 不维护独立 selection。

场景交互：

- 单击 atom：pulse feedback。
- 双击 atom：选中并打开信息卡片。
- 点击非 selectable scene space：清除 selection。

Objects 联动：

- 如果 sidebar 已经打开在 `Objects > Atoms`，双击场景原子后滚动 inspector body，
  使对应元素容器和 selected workspace 可见。
- 如果 sidebar 关闭、位于 Settings 或位于 `Objects > Bonds`，双击本身不自动打开或切换。
- 信息卡片的 Locate 明确打开 Inspector、切换到 `Objects > Atoms` 并滚动到 workspace。
- 只滚动 inspector body，不使用 page-level `scrollIntoView`。

隐藏 selected atom 后清除 selection。Selected workspace 与信息卡片消失，该 atom 转入
hidden recovery rows。

## 样式覆盖模型

最终 atom appearance 按以下优先级解析：

1. 全局 preset 或 custom table。
2. Element-level override。
3. Atom-level override。

Preview、export、legend、bonds、polyhedra、信息卡片 token 和 Objects 必须共享同一套最终
appearance 解析。

### 半径

半径是最终显示半径，单位为 Å。输入使用紧凑数值控件。

编辑任意元素或 atom 半径时切换全局 radius model 为 Custom。进入 Custom 时烘焙当前
有效显示半径；从 Custom 切回 preset 时清除 radius overrides，并恢复进入 Custom 前的
atom size。

### 颜色

元素颜色修改与 legend 修改是同一操作，必须写入共享 updater。元素修改会清除该元素的
atom color overrides；单原子修改只影响对应 canonical site。

手动编辑颜色时切换到 Custom color mode。切换回任何 preset color scheme 时清除已有
color overrides。

全应用中只能有一个 rich color picker 处于打开状态。切换 scene、离开 owning panel、
Locate 改变 sidebar context 或切换回 preset 时关闭 active picker。

### 可见性

元素与 selected workspace 使用 Eye/EyeOff 控件。隐藏只改变显示状态，不修改结构数据、
bonding definition 或派生 connectivity。

`Display > Atoms` 关闭时，所有元素和 atom 的 effective visibility 为 false；重新打开时
清除所有 object-level visibility overrides，使 atoms 恢复为统一可见状态。颜色和半径
overrides 不受影响。

## Reset 与生命周期

- Reset all 清除所有 object style overrides。
- 更换结构清除 selection、Locate request、active picker 和 object overrides。
- 更换 radius preset 清除 radius overrides。
- 更换 color preset 清除 color overrides。
- Element `Apply to all atoms` 清除该元素的 selected/hidden atoms 所依赖的对应 overrides；
  hidden recovery rows 随 visibility override 被清除而消失。

## 性能与实现边界

Atoms 面板不再构造完整 atom rows，不使用 TanStack Table、分页、搜索、展开状态或虚拟列表。
元素容器数量由结构中的元素种类决定；child content 只来自一个 selected atom 和显式
individually hidden atoms。

前端 presentation state 继续持有 object styles。Backend scene contract 只需提供稳定
`siteId`、site index、元素和周期镜像身份。

Canvas 使用 demand rendering。任何会改变 effective visibility、颜色或半径的 React
commit 都必须请求 frame，保证 preview 与 export 同步。

## 验收要点

- Atoms 不显示完整 atom list，也不存在元素展开和虚拟滚动逻辑。
- 每种元素显示为独立圆角容器，header 可编辑元素颜色、半径和可见性。
- 只有当前 selected atom 显示完整单原子 workspace。
- 只有显式 `visible: false` atoms 显示轻量 hidden recovery rows。
- Hidden row 的 `Minus` 清除 visibility override，而不是强制写入 `visible: true`。
- 信息卡片使用 `EyeOff` 快捷隐藏，位于 Copy 与 Locate 之前。
- Hide 后 selection/card/workspace 清除，hidden recovery row 出现。
- 周期镜像坐标显示 instance position，样式编辑作用于 canonical site。
- Locate 只滚动 inspector body。
- Preview 与 export 的颜色、半径和可见性一致。
- 使用 Bun tests、typecheck 和 build 验证；不默认使用 browser 或 Playwright。
