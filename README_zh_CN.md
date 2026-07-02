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

### 从源码安装

如果你从 GitHub 克隆源码安装，先构建前端，再安装 Python 包：

```shell
git clone https://github.com/songfeitong/pretty-lattice.git
cd pretty-lattice

cd web
bun install
bun run build

cd ..
python scripts/sync_web_static.py
python -m pip install .
```

## 快速开始

安装后，启动本地图形界面：

```shell
prl gui
```

Pretty Lattice 会启动一个本地服务，并自动打开浏览器。

也可以直接打开结构文件：

```shell
prl SrTiO3.vasp
```

也可以不安装，临时运行：

```shell
uvx --from pretty-lattice prl gui
```

常用启动选项：

```shell
prl gui --file SrTiO3.vasp
prl gui --no-open     # 只启动服务，不自动打开浏览器
prl gui -p 0          # 自动选择可用端口
```

## 示例

### 材质预设

<p align="center">
  <img src="assets/SrTiO3-material-presets.png" alt="SrTiO3 material preset examples" width="75%">
</p>

### 配色预设

<p align="center">
  <img src="assets/Ba2Ca2Cu3HgO8-color-schemes.png" alt="Ba2Ca2Cu3HgO8 color scheme examples" width="90%">
</p>

## 许可证

Pretty Lattice 使用 [MIT License](LICENSE) 发布。
