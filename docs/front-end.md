# Front-End Design

## Tech Stack

### Runtime and Build

- Bun: package management and script running.
- Vite: development server and frontend build.
- TypeScript + React: application UI.

### Interface System

- Tailwind CSS: styling and design tokens.
- shadcn/ui: source-level components for application controls.
- Radix UI primitives: accessible behavior for tooltips, separators, popovers, dialogs, and related controls.
- lucide-react: line icons.

### Visualization

- Three.js + React Three Fiber: crystal preview rendering and pre-export visualization.

Use shadcn/ui for panels, buttons, inputs, overlays, and other application controls. Keep crystal aesthetics, materials, camera behavior, and export-facing rendering in the Three.js layer.

## Design Style

Follow the Vercel-inspired neutral theme in [vercel_design.md](notes/vercel_design.md) and build controls with shadcn/ui. Support light, dark, and system theme preferences through semantic color tokens rather than component-local color overrides.

The interface should be quiet, high-contrast, and mostly neutral. Use color sparingly for state, focus, and scientific meaning, not decoration.

Keep UI theme colors separate from scientific colors and export settings. In dark mode, the preview background and fog use independent UI theme colors, while the unit-cell boundary and orientation-gizmo labels reuse the established black-background export contrast. Atom colors, material presets, and explicit export backgrounds remain unchanged.

## Workspace Layout

The crystal preview is the main workspace. The Three.js canvas should fill the window without a visible frame, card, or preview container.

Controls should sit as overlays around the preview while preserving stable safe areas. Opening or closing a drawer should not cause the scene or primary controls to jump.

Keep high-frequency structure facts and actions close to the main preview. Put lower-frequency display and export settings in a secondary side area. Side panels should feel like tool storage, not modal interruptions.

Text, controls, and legends must remain readable over the scene. Use opacity or blur only when it does not weaken contrast.
