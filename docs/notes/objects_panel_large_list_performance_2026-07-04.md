# Objects Panel Large-List Performance

Date: 2026-07-04

这份笔记记录一次 Objects > Atoms 面板的性能修复经验。触发场景是一个约
10k 原子的 stress test。

## 现象

在 3D 预览里选中原子仍然很快，但点击 Locate in Objects 或在 Objects 里展开
某个元素分组会明显变慢，甚至像是卡死。

这说明慢点不在 atom picking，而在定位之后 sidebar table 要做的工作。

## 根因

旧实现里，元素分组一旦展开，就会把该元素下的所有 atom row 都放进 table
渲染。对于大体系，尤其是单元素或少元素的大体系，这会一次性制造几千到上万
个真实 DOM row。

这条慢路径叠了几层成本：

- 展开元素时构造所有展开行。
- TanStack Table 建模所有 row 后，React 继续把所有 row 渲染进 DOM。
- Locate 依赖目标 row 已经 mount 到 DOM，再通过 row ref 滚动过去。
- 每个 atom row 的 radius、color、visible cell 会分别解析 appearance。

关键判断是：`Map.get(atomId)` 不是瓶颈。真正的问题是 DOM 数量、组件数量，
以及重复的 row appearance 计算。

## 本次修复

Objects atom table 改成固定行高虚拟化：

- 仍然保留当前 shadcn/TanStack table 的列模型。
- DOM 只渲染 inspector viewport 附近的 rows，加少量 overscan。
- 用顶部和底部 spacer row 保持完整滚动高度。
- Locate 先展开目标元素，再用目标 atom 的 row index 计算滚动位置。
- Locate 不再等待目标 DOM row 存在，也不再维护全量 row refs。
- 对已经展开的元素重复 locate 时，不再产生新的 `expandedElements` 对象。
- element appearance 在一次 render 内预先缓存；atom appearance 只在虚拟窗口内
  的真实渲染行上计算，避免 collapsed 状态也扫描全体 atoms。

这样能避免展开大分组时 DOM 爆炸，同时保持现有交互和表格语义。

## 后续原则

以后任何可能列出大量 atoms、bonds、sites、symmetry operations 或 grid
samples 的面板，都应该默认按大列表设计：

- 不要因为某个 item “逻辑上可见”就把它渲染成真实 DOM。
- 导航和定位优先用 index，不要依赖 DOM node lookup。
- 只要 group size 没有上限，展开 group 就应该被当成 virtual list 问题。
- cell 渲染前先缓存每行派生状态，避免每列重复计算。
- 能固定 row height 时尽量固定；固定行高会让虚拟列表和 locate 计算都便宜。

## 测试经验

回归测试应该保护“大列表不会创建一行一个 DOM node”的合同。浏览器测试仍然
适合验证真实滚动手感，但单元/app 测试不应该过度依赖 pixel-perfect scroll
offset。
