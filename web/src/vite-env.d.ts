/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRETTY_LATTICE_VERSION: string;
  readonly VITE_PRETTY_LATTICE_STATIC_SCENE?: string;
  readonly VITE_PRETTY_LATTICE_STATIC_SCENE_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
