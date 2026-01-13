import type * as THREE from "three";

export type Language = "zh" | "en";
export type ViewerMode = "orbit" | "presentation" | "stage";
export type LightPreset = "none" | "threePoint" | "front" | "rim" | "top";

export type ModelStats = {
  triangles: number;
  vertices: number;
  meshes: number;
  materials: number;
  size: { x: number; y: number; z: number };
};

export type CustomPropertySectionId =
  | "asset"
  | "root"
  | "scene"
  | "nodes"
  | "materials";

export type CustomPropertySection = {
  id: CustomPropertySectionId;
  value: unknown;
};

export type ModelState = {
  object: THREE.Object3D;
  animations: THREE.AnimationClip[];
  name: string;
  format: string;
  stats: ModelStats;
  customProperties: CustomPropertySection[];
  source: "local" | "example";
};

export type PerformanceStats = {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
};

export type PerformanceHint = {
  level: "info" | "good" | "medium" | "high" | "extreme";
  message: string;
};

export type MorphBinding = {
  mesh: THREE.Mesh;
  index: number;
};

export type MorphTargetInfo = {
  name: string;
  bindings: MorphBinding[];
};

export type NamedCustomData = {
  name: string;
  data: unknown;
};

export type ControlsState = {
  language: Language;
  viewerMode: ViewerMode;
  showAxes: boolean;
  axesSize: number;
  showGrid: boolean;
  showGizmo: boolean;
  showStats: boolean;
  autoRotate: boolean;
  lightPreset: LightPreset;
  lightIntensity: number;
  background: string;
  animationClip: string;
  animationPlay: boolean;
  animationSpeed: number;
};
