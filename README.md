<h1 align="center"><img src="web/public/favicon.svg" alt="Pretty Lattice logo" width="30" height="30"> Pretty Lattice</h1>

<p align="center">
  Pretty Lattice is a crystal visualization tool for creating beautiful, publication-ready figures.
</p>

<p align="center">
  <a href="https://github.com/songfeitong/pretty-lattice/actions/workflows/ci.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/songfeitong/pretty-lattice/ci.yml?branch=main&label=build&style=flat-square"></a>
  <img alt="Python 3.12+" src="https://img.shields.io/badge/python-3.12+-3776ab?style=flat-square">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green?style=flat-square">
</p>

- **Pretty**: tasteful defaults for colors, materials, lighting, and depth
- **Simple**: an intuitive browser GUI for loading, viewing, and exporting structures
- **Reliable**: structure parsing and analysis powered by the mature [pymatgen](https://github.com/materialsproject/pymatgen) package
- **Scalable**: smooth interaction with systems up to 10k atoms
- **Customizable**: tune colors, radii, materials, opacity, orientation, and export settings

<p align="center">
  <img src="assets/demo.png" alt="Pretty Lattice interface preview" width="90%">
</p>


## Why

I always find it harder than it should be to make a good-looking crystal figure.

Traditional crystallographic tools such as VESTA are powerful, but their visual defaults often feel outdated: harsh color palettes, low-quality 3D shading, and a lot of manual tweaking before the result looks acceptable. You could import the structure into professional 3D software such as Cinema 4D or Blender, but that feels like overkill and comes with a much steeper learning curve.

Pretty Lattice is my attempt to fill that gap. Built on [Three.js](https://github.com/mrdoob/three.js), it stays (relatively) lightweight without compromising visual quality. It offers a modern, intuitive interface with familiar controls researchers expect, and produces clean, aesthetically pleasing figures out of the box.

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

```shell
prl gui
```

Pretty Lattice starts a local server and opens the browser automatically.

Useful launch options:

```shell
prl gui --no-open     # start the server without opening a browser
prl gui --port 8765   # use a specific port
prl gui -p 0          # choose any free port automatically
```

## Examples

### Material presets

<p align="center">
  <img src="assets/SrTiO3-material-presets.png" alt="SrTiO3 material preset examples" width="75%">
</p>

### Color scheme presets

<p align="center">
  <img src="assets/Ba2Ca2Cu3HgO8-color-schemes.png" alt="Ba2Ca2Cu3HgO8 color scheme examples" width="90%">
</p>

## License

Pretty Lattice is released under the [MIT License](LICENSE).
