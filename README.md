<h1 align="center">Pretty Lattice</h1>

<p align="center">
  Pretty Lattice is a crystal visualization tool for creating beautiful, publication-ready figures.
</p>
<p align="center">
  <a href="https://github.com/songfeitong/pretty-lattice/actions/workflows/ci.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/songfeitong/pretty-lattice/ci.yml?branch=main&label=CI&style=flat-square"></a>
  <a href="https://pypi.org/project/pretty-lattice/"><img alt="PyPI" src="https://img.shields.io/pypi/v/pretty-lattice?style=flat-square"></a>
  <img alt="Python 3.12+" src="https://img.shields.io/badge/python-3.12+-3776ab?style=flat-square">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green?style=flat-square">
</p>

<p align="center">
  English | <a href="README_zh_CN.md">简体中文</a>
</p>

- **Pretty**: tasteful defaults for colors, materials, lighting, and depth
- **Simple**: an intuitive browser GUI for loading, viewing, and exporting structures
- **Reliable**: structure parsing and analysis powered by the mature [pymatgen](https://github.com/materialsproject/pymatgen) package
- **Scalable**: smooth interaction with systems up to 10k atoms
- **Customizable**: tune colors, radii, materials, opacity, orientation, and export settings

<p align="center">
  <img src="https://github.com/user-attachments/assets/2c70cb8e-d908-4455-9908-dc6009792177" alt="Pretty Lattice interface preview" width="90%">
</p>


## Why

I always find it harder than it should be to make a good-looking crystal figure.

Traditional crystallographic tools such as VESTA are powerful, but their visual defaults often feel outdated: harsh color palettes, low-quality 3D shading, and a lot of manual tweaking before the result looks acceptable. You could import the structure into professional 3D software such as Cinema 4D or Blender, but that feels like overkill and comes with a much steeper learning curve.

Pretty Lattice is my attempt to fill that gap. Built on [Three.js](https://github.com/mrdoob/three.js), it stays (relatively) lightweight without compromising visual quality. It offers a modern, intuitive interface with familiar controls researchers expect, and produces clean, aesthetically pleasing figures out of the box.

> [!NOTE]
> By design, Pretty Lattice focuses on **visualization**. It is not intended to replace mature materials-analysis tools such as VESTA and Materials Studio, and it does not try to provide complex structure editing or analysis workflows. Input files are treated as read-only. The intended workflow is to prepare and analyze structures with more specialized tools, then bring the final structure into Pretty Lattice for viewing, styling, and export.

## Install

```shell
pip install pretty-lattice
```

Or install as an isolated tool with [uv](https://github.com/astral-sh/uv):

```shell
uv tool install pretty-lattice
```

Requirements:

- Python 3.12+
- macOS, Linux, or Windows
- Any modern browser

## Quick start

After installation, start the local GUI:

```shell
prl
```

Pretty Lattice starts a local server and opens your browser automatically.

Run once without installing:

```shell
uvx --from pretty-lattice prl
```

Useful launch options:

```shell
prl --no-open     # start the server without opening a browser
prl -p 0          # choose any available port automatically
```

`prl gui` is kept as a compatibility alias for the same GUI launcher.

## Examples

### Material presets

<p align="center">
  <img src="https://github.com/user-attachments/assets/9f7ce8f2-939f-4221-ac1c-087d7d5f2664" alt="SrTiO3 material preset examples" width="75%">
</p>

### Color scheme presets

<p align="center">
  <img src="https://github.com/user-attachments/assets/51f2d5de-b73a-466e-931c-cd0b50b98c32" alt="Ba2Ca2Cu3HgO8 color scheme examples" width="90%">
</p>

## Contributing

This project is still in an early stage, and the main functionality is not complete yet.

For now, development is maintainer-led, and I’m not accepting pull requests. This helps keep the project direction focused while the core experience is still being shaped.

You’re welcome to fork the project or open issues for bug reports, suggestions, or feedback.

## License

Pretty Lattice is released under the [MIT License](LICENSE).
