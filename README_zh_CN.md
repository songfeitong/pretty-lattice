<h1 align="center">Pretty Lattice</h1>

<p align="center">
  Pretty Lattice 是一个晶体结构可视化工具，用来快速做出美观、适合发表的结构图。
</p>
<p align="center">
  <a href="https://github.com/songfeitong/pretty-lattice/actions/workflows/ci.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/songfeitong/pretty-lattice/ci.yml?branch=main&label=CI&style=flat-square"></a>
  <a href="https://pypi.org/project/pretty-lattice/"><img alt="PyPI" src="https://img.shields.io/pypi/v/pretty-lattice?style=flat-square"></a>
  <img alt="Python 3.12+" src="https://img.shields.io/badge/python-3.12+-3776ab?style=flat-square">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green?style=flat-square">
</p>


<p align="center">
  <a href="README.md">English</a> | 简体中文
</p>

- **美观**：内置更现代美观的颜色、材质、光照和景深效果
- **易用**：在浏览器里加载、预览和导出结构，直观易用的用户界面
- **可靠**：结构文件读取和分析基于成熟的 [pymatgen](https://github.com/materialsproject/pymatgen)
- **可扩展**：上万原子的结构也能流畅交互
- **灵活**：颜色、半径、材质、透明度、视角和导出参数都可以按需要修改

<p align="center">
  <img src="assets/demo.png" alt="Pretty Lattice interface preview" width="90%">
</p>


## 为什么做 Pretty Lattice

我一直觉得想画出一张好看的晶体结构图很难。

传统的晶体学工具（比如 VESTA）功能确实强大，但默认的视觉效果总让人觉得过时。辣眼睛的配色、粗糙的3D效果，往往得花大量时间手动调整，画面才算勉强能看。当然，另一种选择是把结构导入像 Cinema 4D 或 Blender 这类专业 3D 软件里渲染，可那样又显得大炮打蚊子，而且学习曲线要陡峭得多。

Pretty Lattice 就是我为弥补二者之间的空白空缺所做的尝试。它基于 Three.js 构建，在相对轻量的同时保证高质量的画面。它提供了一个现代直观的用户界面，以及研究者熟悉的操作方式，开箱即用，直出干净又美观的晶体图。

> [!NOTE]
> 从设计的初衷开始，Pretty Lattice 就专注于**可视化**。它并不打算取代 VESTA、Materials Studio 这类成熟的材料分析工具，也不打算提供复杂的结构编辑或分析流程。打开的结构文件会被当作只读文件来处理。更推荐的工作方式是先用更专业的工具准备和分析结构，再把最终结构导入 Pretty Lattice 里查看、调整样式并导出图片。

## 安装

```shell
pip install pretty-lattice
```

也可以用 [uv](https://github.com/astral-sh/uv) 作为独立工具安装：

```shell
uv tool install pretty-lattice
```

运行环境：

- Python 3.12+
- macOS、Linux 或 Windows
- 任意现代浏览器

## 快速开始

安装后，启动本地图形界面：

```shell
prl
```

Pretty Lattice 会启动一个本地服务，并自动打开浏览器。

也可以不安装，临时运行：

```shell
uvx --from pretty-lattice prl
```

常用启动选项：

```shell
prl --no-open     # 只启动服务，不自动打开浏览器
prl -p 0          # 自动选择可用端口
```

`prl gui` 会保留为兼容入口，效果和 `prl` 相同。

## 示例

### 材质预设

<p align="center">
  <img src="assets/SrTiO3-material-presets.png" alt="SrTiO3 material preset examples" width="75%">
</p>

### 配色预设

<p align="center">
  <img src="assets/Ba2Ca2Cu3HgO8-color-schemes.png" alt="Ba2Ca2Cu3HgO8 color scheme examples" width="90%">
</p>

## 参与

本项目还在早期开发阶段，主要功能也还没有完全成型。

目前开发会先由维护者主导，暂时不接受 Pull Request。这样可以在核心体验还在打磨的时候，让项目方向保持清晰和集中。

欢迎 fork 这个项目，也欢迎通过 issue 提交 bug、建议或反馈。

## 许可证

Pretty Lattice 使用 [MIT License](LICENSE) 发布。
