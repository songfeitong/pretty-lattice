# 结构尺寸与 Connectivity 按需加载

状态：待实现

范围：结构尺寸分级、默认成键算法、大结构首屏、bond/polyhedra/one-hop
bonded atoms 的按需计算、加载与失败反馈，以及上传大小限制。

## 大策略

Pretty Lattice 按原始结构的原子数把预览分成 small、medium 和 large 三档。

- 小结构优先使用质量更高的 CrystalNN。
- 中等结构改用更快的 CutOffDictNN，但仍在进入预览前把连接性算完整。
- 大结构先显示 atoms 和 unit cell；只有用户真正需要时，才计算 bonds、polyhedra
  和 one-hop bonded atoms。

核心目标是：`1024` 原子以下保持现在“一次加载完成”的简单体验；`1024` 原子及以上
不再为了默认可能用不到的连接性阻塞首屏。

```text
0–255 atoms       CrystalNN      完整场景后进入预览
256–1023 atoms    CutOffDictNN   完整场景后进入预览
≥1024 atoms       CutOffDictNN   基础场景先开，connectivity 按需计算
```

`256` 和 `1024` 是产品尺寸分界，不是安全上限。后端用于防止内存或响应爆炸的结构、
scene、bond 和 polyhedra 数量限制继续独立存在。

## 术语

### 原始结构原子数

尺寸分级使用解析后的原始 `Structure` 原子数，也就是结构摘要中的 `atomCount`。
不要使用加入晶胞边界镜像或 one-hop bonded images 后的 scene atom 数量。

### Connectivity bundle

以下内容共享同一次邻居分析，作为一个整体计算：

```text
connectivity bundle =
  one-hop bonded atom images
  + bonds
  + bond families
  + polyhedra
```

Bond、polyhedra 和 one-hop bonded atoms 的显示开关仍然相互独立。“绑定”只表示它们
共用一次计算和同一个加载生命周期，不表示必须同时显示。

Polyhedra 不再拥有单独的 lazy request、缓存或加载状态。一次 connectivity 请求会同时
尝试生成 bonds 和 polyhedra；合法结构也可能自然得到零个 polyhedra。

## 共享配置

跨 Python 和 TypeScript 的产品阈值必须只有一个来源。配置放在
`src/pretty_lattice/structures/scene_contract.json`，语义等价于：

```json
{
  "structureSizeTiers": {
    "mediumFromAtomCount": 256,
    "largeFromAtomCount": 1024
  },
  "previewLimits": {
    "maxUploadBytes": 4194304
  }
}
```

前后端分别提供同语义的 `classifyStructureSize(atomCount)`，返回：

- `small`：少于 256 个原子；
- `medium`：至少 256、少于 1024 个原子；
- `large`：至少 1024 个原子。

删除原来语义模糊的 `structureAtomCountThreshold`。不要保留一个泛化别名继续同时承载
不同含义。

上传大小上限改为 `4 MiB`，即 `4 * 1024 * 1024` bytes。前端用共享值提前拒绝，
后端仍是最终权威，并继续同时检查 `Content-Length` 和实际流式读取的大小。

## 各尺寸等级的默认行为

| 等级 | 原子数 | 默认算法 | 首次返回 | 默认 mesh | Symmetry |
| --- | ---: | --- | --- | --- | --- |
| small | 0–255 | CrystalNN | 完整场景 | medium | 计算 |
| medium | 256–1023 | CutOffDictNN | 完整场景 | medium | 计算 |
| large | ≥1024 | CutOffDictNN | 基础场景 | low | 跳过 |

后端响应必须告诉前端实际采用的 bonding algorithm。前端不再根据原子数自行猜测。

Large 结构虽然在首屏不计算 connectivity，但默认 bonding algorithm 从一开始就是
CutOffDictNN。用户之后第一次打开 Bonds、Polyhedra、One-hop bonded atoms 或进入
`Objects > Bonds` 时，按需请求必须直接使用 CutOffDictNN，不能因为首屏还没有 bond
数据而回退到 CrystalNN。只有用户主动选择其他算法时，才使用用户明确选择的算法。

Small 和 medium 的加载行为保持简单：文件解析、connectivity 和 scene 生成全部成功后，
再进入预览。它们不显示 connectivity skeleton 或局部 spinner。

## Large 基础场景

Large 结构首次打开时只生成首屏需要的数据：

- canonical atoms；
- cell-boundary atom images；
- unit cell；
- structure summary；
- 必要的 scene metadata。

此时不生成：

- one-hop bonded atom images；
- bonds；
- bond families；
- polyhedra。

响应必须明确表示 connectivity 是尚未包含还是已经包含。不能只返回空数组，让前端无法
区分“还没算”和“已经算过但结果为空”。具体字段名可以在实现中确定，但响应必须携带：

```text
connectivity: deferred | ready
bondAlgorithm: 实际准备使用或已经使用的算法
```

前端在此基础上维护 `deferred | loading | ready | error` 四种 UI 状态。`loading` 和
`error` 是请求生命周期，不要求后端维护持久任务。第一版继续使用普通 HTTP 请求，不引入
WebSocket、SSE 或后台 job manager。

## 什么时候触发 Connectivity

Large 场景中的以下操作表示用户已经需要连接性，应触发同一个完整计算：

- 打开 `Display > Bonds`；
- 打开 `Display > Polyhedra`；
- 打开 `Display > One-hop bonded atoms`；
- 进入 `Objects > Bonds`；
- 修改 bonding algorithm；
- 修改 custom maximum length/cutoff。

`Cell-boundary atoms` 不依赖 connectivity，始终可以立即开关。

同一时刻只能有一个 connectivity 请求。重复点击不能创建重复计算。

## 触发后的显示意图

系统必须记住是什么操作触发了计算。成功后只完成用户刚才表达的显示意图：

| 触发操作 | 计算成功后 |
| --- | --- |
| 打开 Bonds | 只自动打开 Bonds |
| 打开 Polyhedra | 只自动打开 Polyhedra |
| 打开 One-hop bonded atoms | 只自动打开 One-hop bonded atoms |
| 进入 Objects > Bonds | 三个显示开关都保持关闭，只展示 bond 数据 |
| 修改算法或 cutoff | 保持计算前的组件可见性 |

虽然整个 bundle 已经算好，未被用户请求的组件不能擅自显示。成功后再开关这三个组件都
只改变本地可见性，不重新请求后端。

## Display 中的加载反馈

加载反馈要低调，并贴着用户刚刚操作的位置出现。

用户从 Display 触发计算时，只在对应行的文字后显示一个小 spinner：

```text
☐ Bonds                 ◌
☐ Polyhedra
☐ One-hop bonded atoms
```

或：

```text
☐ Bonds
☐ Polyhedra             ◌
☐ One-hop bonded atoms
```

要求：

- 计算完成前，触发项保持未选中；
- 只在触发行显示 spinner；
- 三个 connectivity 相关开关在请求期间不能再次触发；
- 对应 opacity 控件在数据尚未 ready 时不可编辑；
- 不在画布或左侧结构卡增加全局计算状态；
- 原子场景在计算期间保持可旋转、缩放、选择和调整样式。

Spinner 参考现有 Export spinner 的视觉和速度：

- `border-2` 圆环；
- 淡色完整圆环，顶部使用较实的前景色；
- 每圈 `450ms`；
- 只在允许动画时旋转，遵守 reduced-motion；
- Display 行中使用约 `12px` 的紧凑尺寸和 muted foreground 颜色。

不要新增另一种 loading 动效。

## Objects > Bonds 的加载反馈

进入 `Objects > Bonds` 会直接触发 connectivity，不再要求用户多点一次 Calculate。

加载时：

- 在 `Bonds` tab 文字后显示同款小 spinner；
- bonding algorithm Select 保留，但暂时不可编辑；
- bond table 区域使用 shadcn `Skeleton` 模拟真实 family rows；
- Skeleton 使用几行不同宽度的紧凑占位，保持真实表格的大致结构；
- 不显示居中的大 spinner、说明段落、进度条或整页 shimmer。

Skeleton 的作用是保持布局稳定，让数据出现时不明显跳动。项目应使用 shadcn 的
`Skeleton` 源组件，不手写另一套 `animate-pulse` 占位。

## 计算成功

Connectivity 成功后，用完整 scene 替换基础 scene，但必须保留：

- 当前相机姿态和 zoom；
- component visibility 和 opacity；
- atom/style/颜色设置；
- inspector 是否打开及当前 tab；
- 当前仍然有效的 atom selection；
- 触发计算时记录的显示意图。

不要把第二阶段当成重新打开文件，也不要重新执行整套默认设置 reset。

第二阶段第一版返回完整 `SceneSpec`，不设计 bond/polyhedra delta patch。One-hop bonded
images 会改变 atoms 数组，完整替换比维护跨请求数组下标更可靠。稳定对象状态继续依赖
atom/bond id，而不是数组下标。

## 计算失败与 Retry

Connectivity 失败是非破坏性错误：保留基础原子场景，不切换到全屏错误状态。

失败反馈复用现有“结构加载失败”同款的浮动 shadcn `Alert`，不在 Display 行增加红色
错误图标，也不为 Objects 页面设计另一套错误卡。

推荐文案语义：

```text
无法计算 bonds 和 polyhedra
原子结构仍然可以正常使用。
```

对于可能恢复的临时失败，Alert 中提供低调的 `Retry`。Retry 使用：

- 同一个文件；
- 当前 bonding algorithm；
- 当前 custom cutoff overrides；
- 原来记录的显示意图。

Retry 不重置相机或设置，也不清空基础 scene。请求期间按钮不可重复点击。

以下确定性错误不显示 Retry，而是给出可执行的调整建议：

- 生成的 scene atoms、bonds 或 polyhedra 超过安全上限；
- custom cutoff 的周期邻居搜索规模超过上限；
- 估算响应大小超过限制；
- 输入结构本身超过支持范围。

用户关闭 Alert 后，再次操作 Bonds、Polyhedra、One-hop bonded atoms 或 Objects > Bonds，
也可以重新触发一次可重试的计算。

Polyhedra 单独生成失败时继续遵守现有非致命 warning 策略：保留已经可用的 atoms 和
bonds，并通过 Alert/scene warning 告知用户。Connectivity 绑定表示共用计算请求，
不要求因为可选的 polyhedra 失败而丢弃已经成功的 bonds。

## 请求竞态与取消

渐进加载不能让旧结果覆盖新场景。前端必须为 preview/connectivity 请求维护递增的
generation 或等价 request token，并在提交结果前确认：

- 文件仍是当前文件；
- bonding algorithm 仍与请求一致；
- custom cutoff profile 仍与请求一致；
- 请求 generation 仍是最新值。

打开新文件、切换算法或发起更新的重算时，应取消旧 fetch；即使底层 Python 工作线程
无法立刻停止，旧结果也绝不能进入 UI。

后端继续使用现有的受限工作线程和最近一个解析后 `Structure` 缓存。第二阶段可以命中
解析缓存，不应再次承担大型 CIF 的完整解析成本。大计算并发仍限制为 1，避免多个
高内存 scene 同时生成。

## Reset、导出与其他行为

- Large scene 的 Reset all 恢复 CutOffDictNN、low mesh，以及 Bonds、Polyhedra、
  One-hop bonded atoms 全部关闭。
- 如果 connectivity 已经 ready，普通显示 reset 不需要重新计算。
- 如果 reset 需要从 custom bonding 恢复默认算法，则按默认 CutOffDictNN 重算一次。
- 导出只导出当前已经存在并可见的内容；导出本身不能暗中触发 connectivity。
- Static scene preview 没有可用后端时，不提供按需重算；它只能使用静态文件中已经包含的
  数据。

## 不在本功能内

- Connectivity 计算百分比或预计剩余时间；
- WebSocket、SSE、服务端任务队列或持久 job id；
- 独立 lazy polyhedra 请求；
- 缓存多份完整 `SceneSpec`；
- 为 large scene 自动后台预取 connectivity；
- 更改现有后端安全上限；
- 重新定义 CrystalNN 和 CutOffDictNN 的物理含义。

## 验收标准

实现完成时至少验证：

1. `255 / 256 / 1023 / 1024` 四个边界值使用正确等级和算法。
2. 1023 原子的结构在返回前已经包含完整 connectivity。
3. 1024 原子的结构先返回可操作的基础场景，且没有 bonds、polyhedra 和 one-hop images。
4. 三个 Display 触发入口和 Objects > Bonds 只启动一次共享计算。
5. Spinner 只出现在触发行，样式和 `450ms` 速度与 Export 一致。
6. Objects > Bonds 加载时显示稳定的 shadcn Skeleton，成功后替换为真实数据。
7. 每种触发入口成功后只打开用户请求的组件。
8. Connectivity 期间原子场景、相机和本地样式保持可操作。
9. 可重试失败显示现有同款 Alert 和 Retry；确定性限制错误不显示无意义的 Retry。
10. 换文件、换算法和连续请求不会出现旧结果覆盖新 scene。
11. 前后端都从共享配置读取 `256 / 1024 / 4 MiB`，仓库中不再存在重复的产品阈值。
12. 现有后端安全上限和自定义 cutoff 的事务性失败语义保持有效。
13. Quick/full backend benchmark 保持可运行，并记录 256–1024 区间与 large 基础首屏的
    实际耗时。
