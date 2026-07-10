# 后端 Python 性能审查

日期：2026-07-10

这次只做调查、性能分析和实际测试，没有修改生产代码。临时脚本放在 `tmp/`，不会进入 Git。

## 结论先说

后端在普通晶体结构上没有明显性能问题。现有 10 个测试结构只有 5–45 个原子，场景构建约需 18–266 ms，日常使用足够快。

“项目代码没有直接用 NumPy”也不等于“性能一定差”。pymatgen 和 SciPy 内部已经大量使用 NumPy，而我们自己写的大多数循环只处理三个坐标分量。把这些小循环逐个改成 NumPy，收益很小，反而会让代码更绕。

真正值得用 NumPy 的地方是**整批邻居数据的筛选**。当前 VESTA cutoff 路径会先把所有候选邻居做成 Python 对象，再逐个过滤。改为直接读取 pymatgen 返回的数组并一次性筛选后：

- 邻居表这一阶段快了 18–26 倍；
- 5,000 原子时，该阶段的内存峰值从 85.4 MiB 降到 14.9 MiB；
- 完整场景构建快了 1.65–2.52 倍；
- 测试范围内的新旧 `SceneSpec` 完全一致。

大体系还有三项主要问题：

- CrystalNN 本身很重，在当前 1,000 原子切换点之前就已经需要数秒；
- 大型显式 CIF 的 pymatgen 解析非常慢；
- 后端会提前生成默认不显示的多面体，并且整个计算过程会堵住 FastAPI 的事件循环。

因此，第一步不应该是“全面 NumPy 化”，而应该集中重写邻居表这条路径。

## 调查范围和环境

实际调用链如下：

```text
上传结构文件
-> pymatgen 解析为 Structure
-> 规范化坐标
-> 生成原子和周期镜像
-> 分析邻居与成键
-> 生成多面体
-> 生成结构摘要
-> 返回 SceneSpec 并 gzip 压缩
```

检查和测量包括：

- `src/pretty_lattice/` 下全部生产 Python 代码；
- 仓库内 10 个 CIF 测试结构；
- SrTiO3 和 LiFePO4 的多种超胞；
- 同一个大结构的 CIF 与 POSCAR；
- 分阶段耗时、函数调用分析、Python 内存分配、进程内存、响应大小，以及真实 Uvicorn 并发测试；
- 临时优化方案与当前完整 `SceneSpec` 的对比。

所有性能测试都确认分析没有退化成 warning，应该存在的键和多面体也确实生成了，避免把“分析失败”误当成“运行很快”。

测试环境：

```text
Apple M1 Pro，10 核 CPU，32 GiB 内存
Python 3.12.13
FastAPI 0.138.0 / Pydantic 2.13.4
pymatgen-core 2026.5.18
NumPy 2.4.6
SciPy 1.18.0
```

基础检查：

```text
uv run ruff check .                  通过
uv run pytest -q -p no:cacheprovider 100 passed
```

下面的时间只适合比较本机上的不同方案，不应当当成其他机器上的绝对指标。

## 当前性能

### SrTiO3 随原子数增长的表现

下表只统计场景构建，不含文件解析、HTTP 响应和 gzip：

| 结构原子数 | 默认成键算法 | 场景构建 | 场景原子数 | 键数 | 多面体数 |
| ---: | --- | ---: | ---: | ---: | ---: |
| 5 | CrystalNN | 0.057 s | 69 | 108 | 9 |
| 40 | CrystalNN | 0.272 s | 203 | 396 | 35 |
| 135 | CrystalNN | 0.793 s | 445 | 984 | 91 |
| 320 | CrystalNN | 2.05 s | 825 | 1,980 | 189 |
| 625 | CrystalNN | 4.58 s | 1,373 | 3,492 | 341 |
| 875 | CrystalNN | 6.91 s | 1,801 | 4,696 | 463 |
| 1,000 | cutoff | 0.61 s | 2,015 | 5,298 | 524 |
| 1,080 | cutoff | 0.64 s | 2,119 | 5,628 | 559 |
| 2,560 | cutoff | 1.29 s | 4,325 | 12,204 | 1,241 |
| 5,000 | cutoff | 2.33 s | 7,683 | 22,572 | 2,331 |
| 10,000 | cutoff | 4.66 s | 14,373 | 43,492 | 4,541 |

最显眼的问题是：875 原子约需 6.9 秒，1,000 原子反而只需约 0.6 秒。原因不是大体系更快，而是默认算法在 1,000 原子处从 CrystalNN 切换成了 cutoff。

同一个 1,000 原子结构：

```text
CrystalNN：8.31–8.56 s
cutoff：   0.56–0.61 s
```

两种算法的物理含义并不完全相同，所以不能只因为 cutoff 快就全部替换。这里需要重新选择合理的切换点，并明确告诉用户实际用了哪种算法。

### 文件格式、响应大小和内存

这里使用的是空间群为 P1、逐个列出所有原子的 CIF，比较接近模拟软件导出大型超胞的情况：

| 结构原子数 | 上传大小 | CIF 解析 | 场景构建 | JSON | gzip | 原始 JSON → gzip | 内存峰值增加 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 625 | 36.9 KB | 0.09 s | 4.42 s | 3.6 ms | 8.0 ms | 996 KB → 65 KB | 约 13 MiB |
| 1,080 | 63.7 KB | 0.25 s | 0.60 s | 6.3 ms | 11.7 ms | 1.65 MB → 95.6 KB | 约 32 MiB |
| 5,000 | 294 KB | 3.27 s | 2.42 s | 21.9 ms | 37.6 ms | 5.89 MB → 323 KB | 约 129 MiB |
| 8,640 | 512 KB | 9.04 s | 3.97 s | 35.7 ms | 67.1 ms | 9.83 MB → 566 KB | 约 218 MiB |

同一个 5,000 原子结构：

```text
显式 CIF：约 3.26 s
POSCAR：  约 0.085 s
```

CIF 慢约 38.5 倍。性能分析显示，时间主要花在 pymatgen 反复检查坐标是否重复，不是我们写临时文件造成的。直接改用 `from_str` 也没有明显改善。

这也说明 1 MiB 上传限制不能代表计算量。10,000 原子的 POSCAR 只有约 704 KB；上表 8,640 原子的 CIF 也只有约 512 KB。

JSON 和 gzip 不是当前瓶颈。FastAPI 0.138 会通过 Pydantic 的 Rust 快速路径直接生成 JSON；gzip 只花几十毫秒，却能把大场景缩小约 94%，应该保留。

## 最优先处理的问题

### 1. cutoff 邻居表创建了太多无用对象

相关代码：

- `src/pretty_lattice/structures/connectivity.py:209-216`
- `src/pretty_lattice/structures/connectivity.py:224-247`

当前流程是：

1. 按 VESTA 最大距离找出全部候选邻居；
2. 为每个候选创建 `PeriodicNeighbor`；
3. 再读取元素、查 cutoff，并逐个过滤；
4. 最后又把结果放进字典。

但后续真正需要的只有 `site_index` 和周期镜像偏移 `image`。

5,000 原子的 SrTiO3 中，大约有 159,000 个候选邻居，最后只接受约 36,000 个。大量时间和内存都浪费在注定会被丢弃的 Python 对象上。

更直接的做法是：

```python
centers, targets, images, distances = structure.get_neighbor_list(max_distance)
mask = distances < cutoff_matrix[site_codes[centers], site_codes[targets]]
```

只为筛选后的结果创建项目自己的轻量记录。

实测：

| 结构原子数 | 当前邻居表 | 数组方案 | 加速 |
| ---: | ---: | ---: | ---: |
| 135 | 21.4 ms | 1.16 ms | 18.5× |
| 1,080 | 185 ms | 7.51 ms | 24.7× |
| 5,000 | 848 ms | 33.0 ms | 25.6× |

完整场景构建也明显改善：

```text
SrTiO3 1,080 原子：0.627 s → 0.346 s
SrTiO3 5,000 原子：2.448 s → 1.482 s
LiFePO4 1,792 原子：0.733 s → 0.291 s
```

临时方案已覆盖 10 个测试结构和上述大体系，完整输出一致。这是最值得先做的优化。

### 2. 每次 cutoff 请求都重新读取 VESTA cutoff 表

`src/pretty_lattice/structures/connectivity.py:203` 每次都会运行：

```python
_PresetCutOffDictNN.from_preset("vesta_2019")
```

pymatgen 会重新读取并解析 YAML，固定花费约 98–104 ms。这个表不会随请求变化，应该只加载一次，并缓存 cutoff 字典、最大距离和元素配对矩阵。

### 3. 大计算会堵住整个后端

`src/pretty_lattice/server/routes.py:22-39` 是异步接口，但读取完请求体以后，会直接同步执行解析、邻居分析、多面体和场景构建。

真实 Uvicorn 测试中：

- 625 原子预览耗时 5.39 秒；
- 预览开始 150 ms 后请求 `/api/health`；
- health 也等待了 5.23 秒。

也就是说，计算期间整个本地服务都不再响应。

应该把“解析文件并生成场景”作为一个同步函数，交给 AnyIO/Starlette 的工作线程执行。由于单个大请求可能多占一百多 MiB 内存，同时运行的大任务还要限制在 1 个，之后再测是否有必要允许 2 个。

工作线程只能让服务保持响应，并不会让计算本身变快。如果以后需要真正中止超时任务，再考虑单独的工作进程。

### 4. 1,000 原子的阈值太晚，而且管了三件不同的事

`src/pretty_lattice/structures/scene_contract.json` 里的 `structureAtomCountThreshold` 同时控制：

- CrystalNN 何时切换成 cutoff；
- 后端何时跳过 symmetry；
- 前端何时降低网格精度。

这三件事的成本和用户体验完全不同，不应该共用一个数字。尤其 CrystalNN 在 320 原子时已经超过 2 秒，到了 625 原子约 4.6 秒，等到 1,000 原子才切换明显太晚。

建议拆成三个清楚命名的阈值。成键算法的切换点还要结合更多材料比较结果质量，不能只看速度。后端也应在响应中直接返回实际使用的算法，前端不要再根据原子数猜。

### 5. 同一个结构会被重复解析

前端切换成键算法或重置设置时，会重新上传同一个文件：

- `web/src/app/hooks/useStructurePreview.ts:171-206`
- `web/src/app/hooks/useStructurePreview.ts:209-237`

后端每次都重新交给 pymatgen 解析。小文件无所谓，但 5,000 原子的显式 CIF 每次要多等约 3.26 秒。

可以只缓存最近 1 个，最多 2 个解析后的 `Structure`：

- 缓存键使用文件内容哈希和格式；
- 明确限制文件大小和原子数；
- 缓存对象只读使用；
- 加锁，避免同一文件被同时重复解析。

不要默认缓存完整 `SceneSpec`。5,000 原子的场景在测试中会多占约 90 MiB 当前内存，三种算法都缓存可能长期占用数百 MiB。

更完整的长期方案是：首次上传返回一个有容量限制的 `structureId`，后续只提交算法和这个 ID。

大型 CIF 第一次解析慢仍然是 pymatgen 上游问题。现在不建议为此更换解析库或强制转成原胞，因为这会改变格式兼容性或用户上传的真实结构。

### 6. 周期边界镜像会重复做同一份邻居分析

`src/pretty_lattice/structures/connectivity.py:76-92` 会把晶胞内原子和边界镜像一起遍历。CrystalNN 和 MinimumDistanceNN 因此可能对同一个原始位点分析多次。

```text
SrTiO3：15 次分析，实际只有 5 个原始位点
NaCl：  27 次分析，实际只有 8 个原始位点
```

镜像只影响最终坐标偏移，不会改变原始位点的邻居关系。每个位点只计算一次再复用，完整场景保持一致：

```text
CrystalNN，5 原子：   57.2 ms → 21.6 ms
CrystalNN，625 原子： 4.44 s → 3.51 s
MinimumDistance，5：  20.8 ms → 10.7 ms
MinimumDistance，625：1.24 s → 1.03 s
```

这项可以和 cutoff 邻居表重写一起完成。

### 7. 多面体默认不显示，却总是提前生成

后端在 `src/pretty_lattice/structures/scene_builder.py:107-114` 无条件生成 polyhedra，而前端默认 `polyhedra: false`。

```text
1,080 原子：559 个多面体，约 0.22 s，占场景构建 36.6%
5,000 原子：2,331 个多面体，约 0.86 s，占场景构建 35.7%
```

小结构可以继续提前生成，保证开关立刻生效。大结构更适合按需加载：用户第一次打开 Polyhedra 时再请求，或者明确传入 `includePolyhedra`。这需要在首屏速度和开关即时性之间做产品选择。

### 8. SceneSpec 里有不少前端不使用的数据

后端同时为 atoms、bonds 和 polyhedra 维护展开后的 visibility dependencies 和分组版本。但生产前端只读取 `AtomSpec.visibilityDependencyGroups`；键和多面体是否可见，已经能通过相关原子是否仍然存在来判断。

删除这些未使用字段后，5,000 原子场景：

- 原始 JSON 缩小 39.5%；
- gzip 后缩小约 8.0%。

gzip 后差距较小，是因为这些重复字段本来就很好压缩。但浏览器最终仍要解压、解析并保存原始 JSON，所以减少 39.5% 仍然有意义。

这还能顺便简化 `ConnectedAtom` 和 `BondRecord`：部分字段从未读取，很多字符串只用于去重，直接使用现有 `AtomKey` 就够了。

## 其他值得处理的问题

### 异常捕获太宽

`src/pretty_lattice/structures/scene_builder.py:70-123` 会捕获所有 `Exception`。第三方分析失败可以转成 warning，但项目自己的 `KeyError`、`IndexError` 或数据格式错误不应该被悄悄吞掉。

建议只在第三方分析边界捕获明确异常。项目内部不可能缺失的 key 如果真的缺失，应直接让测试失败。

### 多面体几何代码可以简化，但不是首要瓶颈

`src/pretty_lattice/structures/polyhedra.py:139-349` 先用 `Delaunay(...).convex_hull`，随后又手写了共面合并、二维凸包、三角剖分和朝向修正。

SciPy 有更直接的 `ConvexHull`。临时方案中，单个凸包计算可以快约 2.6 倍；但放到完整大场景里只提升约 6–8%，而且 `faces` 顺序会变化。

因此可以继续研究，但需要先确认：

- 面的几何集合一致；
- 朝向一致；
- 输出稳定；
- 前端边线没有变化。

这里手写的三个分量加减、点积和叉积本身不是问题，不需要为了使用 NumPy 单独重写。

### 上传限制应该同时考虑解析后的规模

`src/pretty_lattice/server/routes.py:44-60` 只限制上传字节数。没有 `Content-Length` 时，还会先把整个请求读进内存，再检查是否超过 1 MiB。

建议：

- 流式读取，超过大小立即返回 413；
- 解析后限制原子数；
- 限制生成的场景原子数、键数和预计响应大小；
- 限制同时运行的大分析数量。

只看原始原子数仍然不够，因为局域配位数和周期镜像会影响最终场景大小。

### 依赖和性能测试需要补齐

`polyhedra.py` 直接导入 SciPy，但 `pyproject.toml` 没有直接声明 SciPy，只是从 pymatgen 间接获得。直接使用的运行时库应该直接声明。

目前也没有长期保留的性能基准。建议至少覆盖：

- 仓库内 10 个结构；
- SrTiO3 的小、中、大超胞和 1,000 原子切换点；
- LiFePO4 的中大型超胞；
- 同一大结构的 CIF 与 POSCAR；
- 边界原子多、局域配位数较高的结构。

记录每个阶段的耗时、场景大小、内存峰值，以及大预览期间 `/api/health` 的响应时间。慢测试不必每次提交都跑，可以作为手动命令或定时 CI。

### 不要重复压缩字体文件

全局 GZip middleware 也会压缩 WOFF2。一个 1.14 MB 的 WOFF2 压完反而多 365 B，并浪费约 21 ms CPU。

这是低优先级问题。API gzip 必须保留；以后调整静态文件服务时，让 WOFF/WOFF2 跳过 gzip 即可。

## 目前不需要动的部分

- 后端模块拆分已经比较健康，生产 Python 文件都不超过 349 行，不需要再额外套一层通用架构框架。
- 三个整数的镜像偏移、三个坐标分量的规范化，用普通 Python 写很合适。
- 如果以后想优化坐标转换，应一次性建立整批坐标表，而不是给每个小函数套 NumPy。
- 5,000 原子时，Structure 规范化复制约 28–32 ms，不是瓶颈。
- 大体系已经跳过 symmetry，5,000 原子时结构摘要约 7 ms。
- 临时文件不是大型 CIF 解析慢的原因，保留它有利于兼容 pymatgen 支持的多种格式。
- 当前 FastAPI/Pydantic 的 JSON 路径很快。
- API gzip 效果很好。
- 后台预热能减少第一次请求的导入等待，应该保留。
- 不建议通过增加多个 Uvicorn 进程解决问题，它会让多个大场景同时占用内存。

## 建议的实施顺序

### 第一步：重写邻居表路径

1. 定义只包含 `site_index` 和 `image` 的轻量邻居记录。
2. cutoff 改用 `Structure.get_neighbor_list()` 和 NumPy 批量筛选。
3. 只加载一次 VESTA cutoff 表。
4. CrystalNN 和 MinimumDistanceNN 对每个原始位点只计算一次，边界镜像复用结果。
5. 用全部测试结构和几个大体系比较完整 `SceneSpec`。
6. 把这套性能测试整理成可重复运行的命令。

这是收益最大、风险最可控的一步。

### 第二步：让服务保持响应，并避免重复解析

1. 把解析和场景构建放到受限工作线程。
2. 流式读取并限制上传。
3. 增加原子数和场景大小限制。
4. 缓存最近一个解析后的 Structure，或引入 `structureId`。
5. 验证大预览期间 `/api/health` 仍能快速响应。

### 第三步：清理数据协议和阈值

1. 删除前端不用的 visibility 字段。
2. 简化 `ConnectedAtom` 和 `BondRecord`。
3. 分开成键、symmetry 和前端网格精度的阈值。
4. 在场景响应中返回实际使用的成键算法。
5. 用更多材料重新决定 CrystalNN 的默认上限。

### 第四步：处理多面体和低优先级问题

1. 大体系按需生成 polyhedra。
2. 在几何和渲染结果不变的前提下评估 `ConvexHull`。
3. 缩小异常捕获范围。
4. 直接声明 SciPy 依赖，并在修改相关测试时拆分过大的 `test_structures.py`。
