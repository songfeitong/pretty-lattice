# 原子对象与场景交互

状态：已实现

范围：`Objects > Atoms`、元素级与单原子显示样式、原子信息卡片，以及场景选择与
Objects 的联动。

## 目的

`Objects > Atoms` 是低频但精确的显示样式工作区，不是原子数据浏览器。用户首先在
三维场景中识别并选中原子，再在 Objects 中编辑当前对象。面板不渲染无法单凭编号理解的
完整原子列表。

界面先提供作用于全部原子的半径模型与整体缩放，再分为三个对象层级：

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

## 全局半径控制

`Objects > Atoms` 顶部依次显示两个独立选项：

- `Radius model` Select，提供 Uniform、Atomic、Van der Waals、Ionic 和 Custom。
- `Radius scale` Slider，控制所有原子的整体半径缩放。

全局半径控制与下方对象级控制之间使用 separator 分隔。Atoms 页的顶层 section separators
上下两侧都保留 `16px` 间距；元素容器内部用于划分 selected workspace 的 separator 不应用
这项 section 间距。Styles 面板不显示 Size section，也不重复显示或重置原子半径模型与整体缩放。

Custom 模式表示当前半径已经烘焙为可逐元素、逐原子编辑的绝对值，因此整体半径 Slider 禁用。
从 preset 进入 Custom 时记录原先的整体缩放；切回任意 preset 时清除 radius overrides，并恢复
进入 Custom 前的整体缩放。

## 元素容器

每种元素显示为一个独立的圆角矩形容器。元素顺序采用 canonical atoms 在 `scene.atoms`
中的首次出现顺序。

所有元素容器之前显示一个统一的列标题 row，依次标记 `Atom`、`R (Å)` 和 `Opacity`；标题
不在元素或 selected atom rows 内重复。标题使用比原始辅助标签高一级的字号和字重。顶部
标题、元素 row 和 selected atom row 共用固定的“对象｜半径输入｜不透明度输入｜可见性”
列定义，保证两列输入框与 Eye/EyeOff 纵向对齐。

元素容器使用轻边框、克制的 surface background 和元素间 gap，不使用 table 分割线。
没有展开按钮，也没有 collapsed/expanded 状态。

元素容器之间使用 `8px` 垂直间距。元素符号占用固定宽度，使不同元素后的 canonical site
数量从同一条竖线开始并保持左对齐。

元素主 row 比 selected atom row 高 `4px`。列标题 row 与首个元素容器之间使用更紧凑的
间距。Radius 输入框宽 `42px`，始终显示两位小数；Opacity 输入框沿用相同的视觉与交互，
宽 `36px`。两者都在固定列中居中。

容器 header 常驻显示：

- 元素颜色 token；点击后使用现有颜色选择器编辑整个元素。
- 元素符号。
- canonical site 数量。
- 当前元素级有效半径，单位为 Å。
- 当前元素级有效不透明度，范围为 `0–100`。
- 当前元素级有效可见性。

所有能打开颜色选择器的可编辑颜色 token 在 hover 时显示 pointer cursor，明确提示可点击；
Hidden atoms 中的只读颜色 token 保持默认 cursor。

元素 header 是批量控制面。编辑某一属性时，将该属性应用到该元素的所有 atoms，并清除
该元素下对应的单原子 overrides。颜色、半径、不透明度和可见性相互独立，不得因编辑一个
属性清除其他属性。

元素容器保留 context menu 中的 `Apply to all atoms`。该操作将 header 当前的颜色、半径、
不透明度和可见性应用到该元素，并清除该元素下所有对应的单原子 overrides。

## Selected atom workspace

场景中存在 selected atom 时，对应元素容器内出现一个临时 selected workspace。它位于
元素 header 下方、Hidden atoms 之前。

Selected workspace 不是另一张 card，也不增加 `Selected atom` 标题、圆角或独立边框。
元素主 row 使用与 Inspector 一致的 card 背景，不额外制造深浅层级。Selected workspace 作为
元素容器的下半区使用轻微 muted 灰色底色；顶部分隔线和底色延伸到元素容器的左右内边缘，
底色延伸到容器底部，让当前原子状态比普通 header 更容易辨认。Selected workspace
出现和消失时使用 `320ms` 的高度与透明度过渡；退场结束后才卸载原子控件，并遵守全局
reduced motion 设置。

Workspace 显示并允许编辑：

- 原子颜色 token 和 `元素:site index` 标签。
- 单原子有效半径。
- 单原子有效不透明度。
- 单原子有效可见性。

单原子颜色、半径和不透明度编辑保留为 atom-level overrides。Selection 清除后 workspace 消失，但
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

存在 individually hidden atoms 时，在所有元素容器之后显示一个统一、可收起的
`Hidden atoms · N` 恢复区。Hidden atoms 不再分散在各元素容器内，也不按元素增加二级分组。

恢复区初始默认收起。当前会话中 hidden atom 数量从 0 变为非零时自动展开一次，让刚执行
Hide 的用户可以立即撤销；之后尊重用户手动选择的展开状态。数量归零时整个区域消失并重置
为收起状态。标题使用紧凑的 `24px` 高 row；标题文字和数量位于左侧，与上方 `Atom` 列标题
对齐且不响应点击，chevron 按钮紧跟在数量右侧并单独切换展开状态。手动展开和收起使用
`320ms` 的高度与透明度过渡，chevron 同步旋转，并遵守全局 reduced motion 设置。

Rows 按元素首次出现顺序及各元素 canonical site 原始顺序组成一个扁平列表。每行只显示：

- 只读的原子颜色 token；保留当前有效颜色，但不能打开颜色编辑器。
- `元素:site index`。
- `Minus` 恢复按钮。

Recovery rows 与元素主 row 使用相同的水平内边距，使只读颜色 token 的左边缘与上方元素
颜色 token 对齐。

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
有效显示半径；从 Custom 切回 preset 时遵循顶部全局半径控制的恢复规则。

### 颜色

元素颜色修改与 legend 修改是同一操作，必须写入共享 updater。元素修改会清除该元素的
atom color overrides；单原子修改只影响对应 canonical site。

手动编辑颜色时切换到 Custom color mode。切换回任何 preset color scheme 时清除已有
color overrides。

全应用中只能有一个 rich color picker 处于打开状态。切换 scene、离开 owning panel、
Locate 改变 sidebar context 或切换回 preset 时关闭 active picker。

### 不透明度

不透明度只使用一条绝对值覆盖链，不做乘法：`Display > Atoms` opacity 是全局 base，element
opacity 覆盖全局值，atom opacity 再覆盖 element 值。最终渲染 alpha 就是 effective opacity
除以 `100`。

元素和 selected atom 输入框始终显示当前 effective opacity。修改 `Display > Atoms` 的全局
opacity 时，将新值批量应用到所有原子并立即清除全部 element/atom opacity overrides，因此
所有 Objects 输入框统一显示新的全局值。输入使用与半径相同的紧凑控件，不显示百分号；
直接输入、上下方向键、Enter、Escape、focus/blur 行为与半径控件一致，提交值限制在
`0–100`。

编辑元素不透明度会清除该元素下的 atom opacity overrides；编辑单原子不透明度只写入对应
canonical site，并由所有周期镜像继承。不透明度为 `0` 不等同于 visibility override，
不会出现在 Hidden atoms 恢复区，也不改变 bonds、polyhedra 或 connectivity。

Preview 与 export 使用同一份逐原子不透明度。不透明度为 `0` 的原子不参与 export projected
bounds，但非零透明原子仍参与布局。

### 可见性

元素与 selected workspace 使用 Eye/EyeOff 控件。隐藏只改变显示状态，不修改结构数据、
bonding definition 或派生 connectivity。

`Display > Atoms` 关闭时，所有元素和 atom 的 effective visibility 为 false；重新打开时
清除所有 object-level visibility overrides，使 atoms 恢复为统一可见状态。颜色、半径和
不透明度 overrides 不受影响。

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

Canvas 使用 demand rendering。任何会改变 effective visibility、颜色、半径或不透明度的 React
commit 都必须请求 frame，保证 preview 与 export 同步。

## 验收要点

- Atoms 不显示完整 atom list，也不存在元素展开和虚拟滚动逻辑。
- Atoms 顶部独立显示 radius model Select 与 global radius scale Slider，并与对象级控制分隔。
- Styles 不再显示或重置 atom radius model 与 global radius scale。
- 每种元素显示为独立圆角容器，header 可编辑元素颜色、半径、不透明度和可见性。
- 只有当前 selected atom 显示完整单原子 workspace。
- 元素和 selected atom 都显示 `0–100` 的 Opacity 输入，外观与 Radius 输入一致且不带 `%`。
- 全局、元素和单原子不透明度按 absolute override 解析，不相乘；输入框显示 effective value。
- 修改或 reset 全局不透明度会清除全部 element/atom opacity overrides，并统一所有输入框。
- 元素不透明度清除该元素下的单原子不透明度覆盖；单原子不透明度由周期镜像继承。
- 只有显式 `visible: false` atoms 显示轻量 hidden recovery rows。
- Hidden row 的 `Minus` 清除 visibility override，而不是强制写入 `visible: true`。
- 信息卡片使用 `EyeOff` 快捷隐藏，位于 Copy 与 Locate 之前。
- Hide 后 selection/card/workspace 清除，hidden recovery row 出现。
- 周期镜像坐标显示 instance position，样式编辑作用于 canonical site。
- Locate 只滚动 inspector body。
- Preview 与 export 的颜色、半径、不透明度和可见性一致。
- 使用 Bun tests、typecheck 和 build 验证；不默认使用 browser 或 Playwright。
