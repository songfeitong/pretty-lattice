# 状态管理与全局 Undo/Redo

状态：暂停；产品语义保留，技术方案待重新评估

范围：前端状态分类、Zustand/Immer 职责、全局 Undo/Redo 语义、连续操作事务、
相机同步、异步 bonding 与 scene revision。

## 文档地位

本 Spec 保留已经确认的状态分类、Undo 范围和用户操作语义，供以后重新启动该功能时
继续讨论。当前不计划按本文直接实施，也不要求其他功能提前适配 Undo。

Zustand、Immer patches、scene revision cache、异步锁定和状态迁移方式是本轮形成的
候选技术方案，尚未通过满意的实际实现验证。以后重启前应先用窄原型重新评估，不把这些
选择视为不可变的架构决定。

## 提纲挈领

产品语义上，Pretty Lattice 区分可撤回设置、Workspace UI 和 Runtime，并让所有
可撤回设置共享一条历史。技术实现上，本轮候选方案是使用 Zustand 收口状态、Immer
生成正向与反向 patches，再由项目自己的 history 层管理事务和异步边界。

核心规则：

- 图本身、Preview 和 Export 三类设置共享一条按时间排序的 Undo/Redo 历史。
- Workspace UI、Runtime 和全局用户偏好不进入历史。
- 记录用户已经完成的操作，不记录每次内部状态变化。
- 连续预览保持实时，但一次拖动、输入或相机操作只产生一条历史。

本轮候选技术方案示意（未验证）：

- 大型 `SceneSpec` 不进入 Immer；历史只切换轻量 scene revision ID。
- Three.js 高频交互继续使用 imperative 路径，结束后才提交 canonical state。

```text
Zustand store
  undoable present state
    figure
    preview
    export
    structureRevisionId
  history
    past entries { patches, inversePatches }
    future entries { patches, inversePatches }
    active transaction

External services
  Scene revision cache
  Three.js camera bridge
  Runtime requests and errors
```

## 状态分类

前端状态按以下五类确定所有权。状态可以被多个模块读取，但只能有一个 canonical
owner，不得因 Preview 和 Export 都需要而重复保存。

| 类别 | 内容 | 是否进入 Undo |
| --- | --- | --- |
| 图本身 | 显隐、透明度、颜色、半径、材质、雾、对象覆盖、bonding/cutoff、相机构图、光照 | 是 |
| Preview | 预览 mesh quality、交互模式、灵敏度、惯性、FPS、交互锁定 | 是 |
| Export | 尺寸、格式、背景、组件组合、超采样、导出 mesh quality | 是 |
| Workspace UI | 面板开关、当前 tab、折叠状态、selection、picker、tooltip、滚动位置 | 否 |
| Runtime | 文件请求、loading、error、exporting、派生尺寸、动画与命令版本、完整 scene | 否 |

Language、theme 和 motion 是跨文档的全局用户偏好，不属于以上三类可撤回设置，也不受
Undo 或 Reset All 影响。

“通过 UI 修改”不等于 Workspace UI。例如打开 Style tab 属于 Workspace UI；在该 tab
中修改原子颜色属于图本身。

## 候选技术方案：Zustand 的职责与边界

本节是待重新验证的实现候选，不是当前代码必须遵循的约束。

使用 Zustand vanilla `createStore()` 创建 store factory，并通过 React Provider 为每个
App 实例提供独立 store。不要使用模块级全局单例，避免测试和未来多实例之间泄漏状态。

组件必须使用 selector 订阅所需字段，不得订阅或解构整个 store。Zustand 的
`getState()` 和 selector subscription 可供快捷键、相机 bridge 和 scene revision adapter
使用。

Zustand 只收口三类可撤回设置、当前 revision ID 和历史控制。以下状态继续留在局部
component、专属 hook 或外部 service：

- Workspace UI 和输入框尚未提交的文本；
- Runtime、请求错误和导出任务；
- Three.js 每帧 pose、Quaternion ref 和 FPS sample；
- 完整 `SceneSpec` 与 scene revision cache；
- language、theme、motion provider。

## 候选技术方案：Immer 与更新入口

直接使用 Immer 的 `produceWithPatches()` 和 `applyPatches()`，不依赖 Zustand Immer
middleware 自动记录历史，也不引入 Zundo。

每次状态修改必须选择明确入口：

```ts
history.commit(recipe)
history.beginTransaction()
history.updateTransaction(recipe)
history.commitTransaction()
history.cancelTransaction()
history.replaceWithoutHistory(recipe)
```

- `commit`：一次已完成的用户操作，生成 patches 和 inverse patches。
- transaction：连续操作的实时预览与最终净变化。
- `replaceWithoutHistory`：文件初始化、派生同步和内部维护，不生成历史。

Immer draft 只允许在同步 recipe 内使用。不得保存 draft、在回调外继续访问，或跨异步
边界传递。

Undoable state 应使用稳定、可检查的数据结构。Bond visibility 中的 `Set`/`Map` 改为
普通 `Record`，便于 patch、比较和未来序列化；完整 scene 始终留在 store 外。

## 历史语义

- 三类设置共用一条严格按提交顺序排列的历史。
- Undo 应用 inverse patches；Redo 应用正向 patches。
- Undo 后发生新的可撤回操作时清空 Redo。
- Workspace UI 和 Runtime 操作不写历史，也不清空 Redo。
- 结果与当前状态相同、失败或取消的操作不写历史。
- 历史只保留最近 20 次已提交操作，超出后丢弃最旧项。
- 历史只存在于当前页面和当前结构 session，不持久化。
- 历史项不需要面向用户的动作名称；UI 固定显示 `Undo` 和 `Redo`。

系统维护动作不得形成独立历史。例如切换 JPG 时自动把透明背景改为白色，或锁定比例时
联动高度，都与触发它的用户操作合并。纯派生计算最好不存储；必须写回时使用
`replaceWithoutHistory`。

## 连续操作与输入事务

Slider、颜色选择器和相机交互遵循相同的开始、提交和取消边界：

1. 开始时捕获 transaction base state。
2. 中间值实时预览但不追加历史；普通设置可更新 present，相机继续走 imperative 路径。
3. 结束时生成 base 到最终状态的净 patches，只追加一条历史。
4. `Escape` 或取消恢复 base state 和外部预览，不追加历史。

数值或文本输入框在编辑期间使用组件局部 draft：

- 未提交时，`Cmd/Ctrl+Z` 保留浏览器原生文本撤回。
- Enter 或失焦并成功提交后，整次修改进入全局历史。
- 无效输入或 Escape 取消不进入历史。

按钮、toggle、select 和键盘单步调整通常各产生一次 commit。一个用户动作即使连带修改
多个字段，也必须保持为单条原子历史。

## 候选技术方案：相机

相机使用双层状态：

- Three.js 和现有 imperative bridge 持有交互中的实时 pose/zoom。
- Zustand 保存最近一次已完成操作的 canonical camera state。

拖动、滚轮、惯性和动画过程中不向 Zustand 写入每帧状态。交互完全 settled 后提交最终
pose 和 zoom，形成一条历史。Undo、Redo、Reset View 和 Reset All 通过外层 camera
adapter 把 canonical state 发送回 Three.js。

Immer reducer 必须保持纯函数。相机命令、scene 切换、picker 清理和 selection 有效性等
副作用由 store 外层 adapter 根据前后状态变化执行。

## 候选技术方案：Bonding 与 scene revision

Bond algorithm、custom cutoff 和 connectivity 重算属于可撤回的图设置，但完整 scene
不能进入 Immer。

- 每次成功计算生成一个 immutable scene revision，并存入外部 cache。
- Zustand 只保存 bonding 配置和 `structureRevisionId`。
- Undo/Redo 切换 revision ID，直接复用缓存 scene，不重新请求后端。
- 请求失败不修改 present state、不移动历史游标，也不创建 revision。
- Cache 只保留当前状态和最近 20 条历史仍可到达的 revisions。

结构重算期间，禁用所有可撤回设置操作以及 Undo/Redo，避免异步完成顺序与用户操作顺序
冲突；Workspace UI 仍可操作。Reset All 如需异步恢复默认 bonding，必须等后端成功后再
原子提交全部重置，失败时保持原状态。

切换 revision 时保留仍有稳定 ID 对应的 bond family/instance visibility；清理当前 scene
中已无对应对象的覆盖。Undo 回旧 revision 时恢复切换前的完整覆盖状态。

## Reset、文件和 selection

Reset All：

- 一次重置图本身、Preview 和 Export 三类设置；
- 不修改 Workspace UI、Runtime 或全局用户偏好；
- 无论内部改变多少字段，都只产生一条历史；
- 一次 Undo 完整恢复重置前状态。

打开新文件：

- 只有成功加载后才重置三类设置并清空 Undo/Redo；
- 加载失败时保留当前文件、当前设置和历史；
- 不允许通过 Undo 回到上一个文件。

Selection 属于 Workspace UI，不进入历史。应用 Undo/Redo 后，如果 selected 对象仍存在且
可见则保留；如果失效则清除。之后对象重新出现时不自动恢复旧 selection。

## 用户入口

第一版提供：

- macOS：`Cmd+Z`、`Cmd+Shift+Z`；
- Windows/Linux：`Ctrl+Z`、`Ctrl+Shift+Z`，兼容 `Ctrl+Y`；
- 共享右键菜单中的固定 `Undo`、`Redo` 项。

右键菜单始终保留两项；没有对应历史时禁用。第一版不增加常驻按钮、历史面板或动作名称。

## 非目标

- 不使用 Zundo，也不让 Zustand 自动猜测哪些变化应进入历史。
- 不把全部应用状态迁移到一个万能 store。
- 不持久化历史，也不实现跨文件 Undo。
- 不设计 Pretty Lattice 专属项目文件。
- 不在第一版增加常驻 Undo/Redo 按钮或 History 面板。
- 不改变 language、theme、motion 的现有生命周期。

## 验收要点

以下验收要点仅在该功能重新启动并重新确认技术方案后生效。

- 三类设置通过单一 Zustand store 和 selector 读取，不再由 `App` 大量中转 setter。
- 所有正式更新通过显式 history API；系统同步不会意外写入历史。
- 连续控件和相机交互各自产生一条、而不是大量历史。
- Reset All、联动设置和 bonding 切换保持原子性。
- 异步失败不污染状态或历史；新文件失败不丢失当前工作。
- Scene cache、Three.js 高频状态、Workspace UI 和 Runtime 不进入 Immer patches。
- Undo/Redo 后 Preview 与 Export 继续使用同一份 canonical 图设置。
