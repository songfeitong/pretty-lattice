# Specs

Lightweight product and interaction specs for planned Pretty Lattice UI
surfaces. These specs are not OpenSpec change packages; they capture settled
design decisions before implementation.

## UI Specs

- [原子对象与场景交互](object-styles-panel.md)：`Objects > Atoms` 的元素容器、
  selected atom workspace、hidden atom recovery 与原子信息卡片联动。
- [Bond Objects 与场景交互](bond-objects-and-interaction.md)：Objects > Bonds、
  单根 bond 的只读检查与场景交互、family visibility，以及已有 family 的
  custom maximum length。
- [结构尺寸与 Connectivity 按需加载](structure-size-and-connectivity-loading.md)：
  统一 256/1024 尺寸等级、4 MiB 上传限制，以及大结构的 bond、polyhedra 和
  one-hop bonded atoms 按需计算与低调加载反馈。
