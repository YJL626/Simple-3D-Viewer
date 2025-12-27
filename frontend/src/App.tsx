
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Bounds,
  Center,
  ContactShadows,
  Float,
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  PresentationControls,
  Stage,
  Stats,
  useAnimations,
  useBounds,
} from "@react-three/drei";
import { Leva, useControls } from "leva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { USDZLoader } from "three/examples/jsm/loaders/USDZLoader.js";
import "./App.css";

type Language = "zh" | "en";
type ViewerMode = "orbit" | "presentation" | "stage";
type LightPreset = "threePoint" | "front" | "rim" | "top";

type ModelStats = {
  triangles: number;
  vertices: number;
  meshes: number;
  materials: number;
  size: { x: number; y: number; z: number };
};

type ModelState = {
  object: THREE.Object3D;
  animations: THREE.AnimationClip[];
  name: string;
  format: string;
  stats: ModelStats;
  source: "local" | "example";
};

type PerformanceStats = {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
};

type MorphBinding = {
  mesh: THREE.Mesh;
  index: number;
};

type MorphTargetInfo = {
  name: string;
  bindings: MorphBinding[];
};

type ControlsState = {
  language: Language;
  viewerMode: ViewerMode;
  showAxes: boolean;
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

const SUPPORTED_FORMATS = ["drc", "glb", "gltf", "obj", "ply", "stl", "usd", "usdz"];

const I18N = {
  zh: {
    title: "Simple 3D Viewer",
    subtitle: "模型快速查看器",
    offlineReady: "离线可用",
    online: "在线",
    offline: "离线",
    loadTitle: "加载模型",
    dropTitle: "拖拽模型到右侧画布",
    dropHint: "支持 DRC / GLB / GLTF / OBJ / PLY / STL / USD",
    chooseFile: "选择文件",
    loadExample: "加载 fox.glb（动画测试）",
    loadMorphExample: "加载 suzanna.glb（形态键测试）",
    clearModel: "清空模型",
    supportedFormats: "支持格式",
    viewerTitle: "展示器",
    viewerMode: "模式",
    viewerModes: {
      orbit: "轨道",
      presentation: "演示",
      stage: "舞台",
    },
    lightingTitle: "灯光视角",
    lightPresets: {
      threePoint: "三点布光",
      front: "正面光",
      rim: "轮廓光",
      top: "顶光",
    },
    togglesTitle: "显示",
    axes: "轴向",
    grid: "网格",
    gizmo: "方向仪",
    stats: "帧率/时间",
    autoRotate: "自动旋转",
    modelInfo: "模型信息",
    fileName: "文件",
    format: "格式",
    triangles: "面数",
    vertices: "顶点",
    meshes: "网格",
    materials: "材质",
    size: "尺寸",
    animations: "动画",
    animationNone: "无动画",
    animationPlay: "播放",
    animationPause: "暂停",
    animationSpeed: "播放速度",
    performance: "性能建议",
    perfLight: "面数较轻量，适合移动端/网页展示。",
    perfMedium: "面数适中：移动端建议 <100k，中端设备 <300k。",
    perfHeavy: "面数偏高：建议控制在 100k~300k，必要时做减面/LOD。",
    perfExtreme: "面数很高：移动端 <100k，中端 <300k，高端展示 <1M。",
    noModel: "尚未加载模型",
    loading: "加载中…",
    errorUnsupported: "未识别的格式，请选择支持的模型文件。",
    errorLoad: "模型加载失败，请检查文件完整性。",
    perfFps: "FPS",
    perfFrame: "帧时间",
    reframe: "重新对焦",
    morphTargets: "形态键",
    morphNone: "无形态键",
    morphQuick: "快速切换",
    morphStrength: "强度",
  },
  en: {
    title: "Simple 3D Viewer",
    subtitle: "Offline-ready model explorer",
    offlineReady: "Offline ready",
    online: "Online",
    offline: "Offline",
    loadTitle: "Load Model",
    dropTitle: "Drop a model on the canvas",
    dropHint: "Supports DRC / GLB / GLTF / OBJ / PLY / STL / USD",
    chooseFile: "Choose file",
    loadExample: "Load fox.glb (animation test)",
    loadMorphExample: "Load suzanna.glb (morph test)",
    clearModel: "Clear model",
    supportedFormats: "Supported formats",
    viewerTitle: "Viewer",
    viewerMode: "Mode",
    viewerModes: {
      orbit: "Orbit",
      presentation: "Presentation",
      stage: "Stage",
    },
    lightingTitle: "Lighting",
    lightPresets: {
      threePoint: "Three-point",
      front: "Front",
      rim: "Rim",
      top: "Top",
    },
    togglesTitle: "Overlays",
    axes: "Axes",
    grid: "Grid",
    gizmo: "Gizmo",
    stats: "FPS/Time",
    autoRotate: "Auto rotate",
    modelInfo: "Model info",
    fileName: "File",
    format: "Format",
    triangles: "Triangles",
    vertices: "Vertices",
    meshes: "Meshes",
    materials: "Materials",
    size: "Size",
    animations: "Animations",
    animationNone: "No animations",
    animationPlay: "Play",
    animationPause: "Pause",
    animationSpeed: "Speed",
    performance: "Performance",
    perfLight: "Light poly count, OK for mobile/web.",
    perfMedium: "Medium poly count: mobile <100k, mid devices <300k.",
    perfHeavy: "High poly count: target 100k~300k, consider LOD/decimation.",
    perfExtreme: "Very high: mobile <100k, mid <300k, high-end <1M.",
    noModel: "No model loaded",
    loading: "Loading…",
    errorUnsupported: "Unsupported format. Please choose a supported file.",
    errorLoad: "Failed to load model. Check the file integrity.",
    perfFps: "FPS",
    perfFrame: "Frame",
    reframe: "Reframe",
    morphTargets: "Morph Targets",
    morphNone: "No morph targets",
    morphQuick: "Quick switch",
    morphStrength: "Strength",
  },
} as const;
const LIGHT_PRESETS: { id: LightPreset; labelKey: keyof (typeof I18N)["zh"]["lightPresets"] }[] = [
  { id: "threePoint", labelKey: "threePoint" },
  { id: "front", labelKey: "front" },
  { id: "rim", labelKey: "rim" },
  { id: "top", labelKey: "top" },
];

const VIEWER_MODES: { id: ViewerMode; labelKey: keyof (typeof I18N)["zh"]["viewerModes"] }[] = [
  { id: "orbit", labelKey: "orbit" },
  { id: "presentation", labelKey: "presentation" },
  { id: "stage", labelKey: "stage" },
];

const FORMAT_PRIORITY = ["gltf", "glb", "usdz", "usd", "drc", "obj", "ply", "stl"];

function getExtension(filename: string) {
  const parts = filename.split(".");
  if (parts.length < 2) return "";
  return parts.at(-1)?.toLowerCase() ?? "";
}

function pickMainFile(files: File[]) {
  const sorted = [...files].sort((a, b) => {
    const extA = getExtension(a.name);
    const extB = getExtension(b.name);
    const scoreA = FORMAT_PRIORITY.indexOf(extA);
    const scoreB = FORMAT_PRIORITY.indexOf(extB);
    return (scoreA === -1 ? 999 : scoreA) - (scoreB === -1 ? 999 : scoreB);
  });
  return sorted.find((file) => SUPPORTED_FORMATS.includes(getExtension(file.name)));
}

function loadAsync<T>(
  loader: {
    load: (
      url: string,
      onLoad: (data: T) => void,
      onProgress?: (event: unknown) => void,
      onError?: (event: unknown) => void
    ) => void;
  },
  url: string
) {
  return new Promise<T>((resolve, reject) => {
    loader.load(url, (data) => resolve(data), undefined, (error) => reject(error));
  });
}
function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) {
        material.forEach((item) => item.dispose());
      } else {
        material?.dispose();
      }
    }
  });
}

function prepareMeshMaterial(mesh: THREE.Mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material) => {
    if (!material) return;
    if ("metalness" in material) {
      (material as THREE.MeshStandardMaterial).metalness ??= 0.1;
    }
    if ("roughness" in material) {
      (material as THREE.MeshStandardMaterial).roughness ??= 0.6;
    }
    material.side = THREE.DoubleSide;
  });
}

function getModelStats(object: THREE.Object3D): ModelStats {
  let triangles = 0;
  let vertices = 0;
  let meshes = 0;
  let materials = 0;

  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      meshes += 1;
      const mesh = child as THREE.Mesh;
      const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
      if (geometry) {
        const position = geometry.getAttribute("position");
        if (position) {
          vertices += position.count;
          if (geometry.index) {
            triangles += geometry.index.count / 3;
          } else {
            triangles += position.count / 3;
          }
        }
      }
      const material = mesh.material;
      if (Array.isArray(material)) {
        materials += material.length;
      } else if (material) {
        materials += 1;
      }
    }
  });

  const bounds = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  bounds.getSize(size);

  return {
    triangles: Math.round(triangles),
    vertices,
    meshes,
    materials,
    size: { x: size.x, y: size.y, z: size.z },
  };
}

function getPerformanceHint(triangles: number, language: Language) {
  const copy = I18N[language];
  if (!triangles) {
    return { level: "info", message: copy.perfLight };
  }
  if (triangles < 50_000) {
    return { level: "good", message: copy.perfLight };
  }
  if (triangles < 200_000) {
    return { level: "medium", message: copy.perfMedium };
  }
  if (triangles < 500_000) {
    return { level: "high", message: copy.perfHeavy };
  }
  return { level: "extreme", message: copy.perfExtreme };
}

function collectMorphTargets(object: THREE.Object3D) {
  const map = new Map<string, MorphBinding[]>();

  object.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    if (!mesh.morphTargetInfluences) {
      mesh.updateMorphTargets?.();
    }
    if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

    Object.entries(mesh.morphTargetDictionary).forEach(([name, index]) => {
      if (!map.has(name)) {
        map.set(name, []);
      }
      map.get(name)?.push({ mesh, index });
    });
  });

  return Array.from(map.entries()).map(([name, bindings]) => ({ name, bindings }));
}
function PerformanceProbe({ enabled, onUpdate }: { enabled: boolean; onUpdate: (stats: PerformanceStats) => void }) {
  const frameCount = useRef(0);
  const timeAccum = useRef(0);
  const lastUpdate = useRef(performance.now());
  const { gl } = useThree();

  useFrame((_state, delta) => {
    if (!enabled) return;
    frameCount.current += 1;
    timeAccum.current += delta;

    const now = performance.now();
    if (now - lastUpdate.current < 500) return;

    const avgDelta = timeAccum.current / Math.max(frameCount.current, 1);
    const fps = avgDelta > 0 ? 1 / avgDelta : 0;

    onUpdate({
      fps,
      frameMs: avgDelta * 1000,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
    });

    frameCount.current = 0;
    timeAccum.current = 0;
    lastUpdate.current = now;
  });

  return null;
}

function FitToBounds({ object, signal }: { object: THREE.Object3D | null; signal: number }) {
  const bounds = useBounds();
  useEffect(() => {
    if (!object) return;
    bounds.refresh(object).clip().fit();
  }, [bounds, object, signal]);
  return null;
}

function AnimatedModel({
  object,
  animations,
  activeClip,
  playing,
  speed,
}: {
  object: THREE.Object3D;
  animations: THREE.AnimationClip[];
  activeClip: string;
  playing: boolean;
  speed: number;
}) {
  const group = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    if (!actions) return;
    const actionList = Object.values(actions).filter((action): action is THREE.AnimationAction => Boolean(action));
    actionList.forEach((action) => {
      action.stop();
      action.reset();
    });

    if (!playing) {
      actionList.forEach((action) => {
        action.paused = true;
      });
    }

    if (activeClip === "__all__") {
      actionList.forEach((action) => {
        action.timeScale = speed;
        action.paused = !playing;
        action.play();
      });
      return;
    }

    const selected = actions[activeClip];
    if (selected) {
      selected.timeScale = speed;
      selected.paused = !playing;
      selected.play();
    }

    return () => {
      actionList.forEach((action) => action.stop());
    };
  }, [actions, activeClip, playing, speed]);

  useEffect(() => {
    if (!actions) return;
    Object.values(actions).forEach((action) => {
      if (!action) return;
      action.timeScale = speed;
      action.paused = !playing;
    });
  }, [actions, playing, speed]);

  return (
    <group ref={group}>
      <primitive object={object} />
    </group>
  );
}
function LightRig({ preset, intensity }: { preset: LightPreset; intensity: number }) {
  const soft = 0.35 * intensity;
  const main = 1.2 * intensity;
  const accent = 0.6 * intensity;

  switch (preset) {
    case "front":
      return (
        <group>
          <ambientLight intensity={soft} />
          <directionalLight position={[0, 4, 6]} intensity={main} />
          <directionalLight position={[0, -3, -4]} intensity={accent * 0.4} />
        </group>
      );
    case "rim":
      return (
        <group>
          <ambientLight intensity={soft * 0.8} />
          <directionalLight position={[4, 4, 2]} intensity={main * 0.7} />
          <directionalLight position={[-4, 1, -5]} intensity={accent} />
          <directionalLight position={[0, 3, -6]} intensity={accent * 0.9} />
        </group>
      );
    case "top":
      return (
        <group>
          <ambientLight intensity={soft} />
          <directionalLight position={[0, 6, 0]} intensity={main} />
          <directionalLight position={[4, -2, 4]} intensity={accent * 0.5} />
        </group>
      );
    case "threePoint":
    default:
      return (
        <group>
          <ambientLight intensity={soft} />
          <directionalLight position={[6, 6, 4]} intensity={main} />
          <directionalLight position={[-6, 2, 6]} intensity={accent} />
          <directionalLight position={[-2, -4, -6]} intensity={accent * 0.6} />
        </group>
      );
  }
}

function Placeholder() {
  return (
    <Float floatIntensity={1.2} rotationIntensity={0.6} speed={1.5}>
      <mesh>
        <torusKnotGeometry args={[0.6, 0.18, 220, 24]} />
        <meshStandardMaterial color="#e07a5f" roughness={0.35} metalness={0.15} />
      </mesh>
    </Float>
  );
}
function App() {
  const [model, setModel] = useState<ModelState | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [perfStats, setPerfStats] = useState<PerformanceStats>({ fps: 0, frameMs: 0, drawCalls: 0, triangles: 0 });
  const [fitSignal, setFitSignal] = useState(0);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [morphTargets, setMorphTargets] = useState<MorphTargetInfo[]>([]);
  const [morphValues, setMorphValues] = useState<Record<string, number>>({});
  const [levaPosition, setLevaPosition] = useState({ x: 24, y: 24 });

  const animationOptions = useMemo(() => {
    const options: Record<string, string> = {
      None: "none",
    };
    model?.animations.forEach((clip) => {
      if (clip.name) {
        options[clip.name] = clip.name;
      }
    });
    return options;
  }, [model?.animations]);

  const [controls, setControls] = useControls(
    () => ({
      language: { value: "zh", options: { 中文: "zh", English: "en" } },
      viewerMode: { value: "orbit", options: { Orbit: "orbit", Presentation: "presentation", Stage: "stage" } },
      showAxes: { value: true },
      showGrid: { value: true },
      showGizmo: { value: true },
      showStats: { value: true },
      autoRotate: { value: false },
      lightPreset: { value: "threePoint", options: { ThreePoint: "threePoint", Front: "front", Rim: "rim", Top: "top" } },
      lightIntensity: { value: 1.2, min: 0.2, max: 3, step: 0.1 },
      background: { value: "#0c1016" },
      animationClip: { value: "none", options: animationOptions },
      animationPlay: { value: true },
      animationSpeed: { value: 1, min: 0.2, max: 2.5, step: 0.1 },
    }),
    [animationOptions]
  ) as unknown as [ControlsState, (values: Partial<ControlsState>) => void];

  const language = controls.language;
  const copy = I18N[language];

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const update = () => {
      const panelWidth = 280;
      const panelHeight = 320;
      setLevaPosition({
        x: Math.max(24, window.innerWidth - panelWidth - 24),
        y: Math.max(24, window.innerHeight - panelHeight - 24),
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!model) return;
    if (controls.animationClip === "none") return;
    if (controls.animationClip === "__all__") return;
    const names = model.animations.map((clip) => clip.name);
    if (!names.includes(controls.animationClip)) {
      setControls({ animationClip: "none" });
    }
  }, [controls.animationClip, model, setControls]);

  useEffect(() => {
    if (!model) {
      setMorphTargets([]);
      setMorphValues({});
      return;
    }
    const targets = collectMorphTargets(model.object);
    setMorphTargets(targets);
    const initialValues: Record<string, number> = {};
    targets.forEach((target) => {
      const firstBinding = target.bindings[0];
      const value = firstBinding?.mesh.morphTargetInfluences?.[firstBinding.index] ?? 0;
      initialValues[target.name] = Number.isFinite(value) ? value : 0;
    });
    setMorphValues(initialValues);
  }, [model]);

  const formatNumber = useMemo(() => new Intl.NumberFormat(language), [language]);
  const performanceHint = getPerformanceHint(model?.stats.triangles ?? 0, language);

  const dracoLoader = useMemo(() => {
    const loader = new DRACOLoader();
    loader.setDecoderPath("/draco/");
    loader.setDecoderConfig({ type: "wasm" });
    return loader;
  }, []);

  const loadFiles = useCallback(
    async (files: File[], source: ModelState["source"]) => {
      if (!files.length) return;
      const mainFile = pickMainFile(files);
      if (!mainFile) {
        setError(copy.errorUnsupported);
        return;
      }

      const fileMap = new Map(files.map((file) => [file.name, file]));
      setLoading(true);
      setError(null);

      try {
        if (model) {
          disposeObject(model.object);
        }

        const extension = getExtension(mainFile.name);
        const cache = new Map<string, string>();
        const manager = new THREE.LoadingManager();

        const getUrl = (file: File) => {
          if (!cache.has(file.name)) {
            cache.set(file.name, URL.createObjectURL(file));
          }
          return cache.get(file.name)!;
        };

        const revokeAll = () => {
          cache.forEach((url) => URL.revokeObjectURL(url));
          cache.clear();
        };

        manager.setURLModifier((url) => {
          const clean = decodeURIComponent(url.split("?")[0]);
          const filename = clean.split("/").pop() ?? clean;
          const match = fileMap.get(filename);
          return match ? getUrl(match) : url;
        });

        let loadedObject: THREE.Object3D;
        let animations: THREE.AnimationClip[] = [];
        if (extension === "glb" || extension === "gltf") {
          const loader = new GLTFLoader(manager);
          loader.setDRACOLoader(dracoLoader);
          const gltf = await loadAsync(loader, getUrl(mainFile));
          loadedObject = gltf.scene;
          animations = gltf.animations ?? [];
          revokeAll();
        } else if (extension === "obj") {
          const loader = new OBJLoader(manager);
          loadedObject = await loadAsync(loader, getUrl(mainFile));
          revokeAll();
        } else if (extension === "ply") {
          const loader = new PLYLoader(manager);
          const geometry = await loadAsync(loader, getUrl(mainFile));
          geometry.computeVertexNormals();
          const material = new THREE.MeshStandardMaterial({
            color: "#c7d0d9",
            roughness: 0.5,
            metalness: 0.1,
            vertexColors: Boolean(geometry.getAttribute("color")),
          });
          loadedObject = new THREE.Mesh(geometry, material);
          revokeAll();
        } else if (extension === "stl") {
          const loader = new STLLoader(manager);
          const geometry = await loadAsync(loader, getUrl(mainFile));
          geometry.computeVertexNormals();
          const material = new THREE.MeshStandardMaterial({ color: "#c7d0d9", roughness: 0.55, metalness: 0.05 });
          loadedObject = new THREE.Mesh(geometry, material);
          revokeAll();
        } else if (extension === "drc") {
          const geometry = await loadAsync(dracoLoader, getUrl(mainFile));
          geometry.computeVertexNormals();
          const material = new THREE.MeshStandardMaterial({ color: "#c7d0d9", roughness: 0.55, metalness: 0.05 });
          loadedObject = new THREE.Mesh(geometry, material);
          revokeAll();
        } else if (extension === "usd" || extension === "usdz") {
          const loader = new USDZLoader();
          const data = await mainFile.arrayBuffer();
          loadedObject = loader.parse(data);
        } else {
          throw new Error("unsupported");
        }

        loadedObject.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            prepareMeshMaterial(mesh);
            mesh.updateMorphTargets?.();
          }
        });

        const stats = getModelStats(loadedObject);
        setModel({
          object: loadedObject,
          animations,
          name: mainFile.name,
          format: extension,
          stats,
          source,
        });
        setFitSignal((prev) => prev + 1);
      } catch (err) {
        setError(copy.errorLoad);
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [copy.errorLoad, copy.errorUnsupported, dracoLoader, model]
  );
  const handleInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await loadFiles(files, "local");
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    await loadFiles(files, "local");
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes("Files")) {
      setDragging(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
  };

  const handleExample = async () => {
    const response = await fetch("/fox.glb");
    const blob = await response.blob();
    const file = new File([blob], "fox.glb", { type: "model/gltf-binary" });
    await loadFiles([file], "example");
  };

  const handleMorphExample = async () => {
    const response = await fetch("/suzanna.glb");
    const blob = await response.blob();
    const file = new File([blob], "suzanna.glb", { type: "model/gltf-binary" });
    await loadFiles([file], "example");
  };

  const handleClear = () => {
    if (model) {
      disposeObject(model.object);
    }
    setModel(null);
    setError(null);
    setFitSignal((prev) => prev + 1);
  };

  const applyMorphValue = useCallback(
    (name: string, value: number, exclusive = false) => {
      morphTargets.forEach((target) => {
        target.bindings.forEach(({ mesh, index }) => {
          if (!mesh.morphTargetInfluences) return;
          if (exclusive && target.name !== name) {
            mesh.morphTargetInfluences[index] = 0;
          } else if (target.name === name) {
            mesh.morphTargetInfluences[index] = value;
          }
        });
      });

      setMorphValues((prev) => {
        const next = { ...prev };
        if (exclusive) {
          morphTargets.forEach((target) => {
            next[target.name] = target.name === name ? value : 0;
          });
        } else {
          next[name] = value;
        }
        return next;
      });
    },
    [morphTargets]
  );

  const resetMorphTargets = useCallback(() => {
    morphTargets.forEach((target) => {
      target.bindings.forEach(({ mesh, index }) => {
        if (!mesh.morphTargetInfluences) return;
        mesh.morphTargetInfluences[index] = 0;
      });
    });
    setMorphValues((prev) => {
      const next = { ...prev };
      morphTargets.forEach((target) => {
        next[target.name] = 0;
      });
      return next;
    });
  }, [morphTargets]);

  const modelSizeLabel = model
    ? `${formatNumber.format(model.stats.size.x)} × ${formatNumber.format(model.stats.size.y)} × ${formatNumber.format(model.stats.size.z)}`
    : "--";

  const animationList = model?.animations ?? [];
  const animationOptionsList = animationList.map((clip) => clip.name).filter(Boolean);
  const hasMorphTargets = morphTargets.length > 0;
  const isMorphEmpty = morphTargets.every((target) => (morphValues[target.name] ?? 0) <= 0.001);

  const content = model ? (
    <AnimatedModel
      key={model.name}
      object={model.object}
      animations={model.animations}
      activeClip={controls.animationClip === "none" ? "" : controls.animationClip}
      playing={controls.animationPlay}
      speed={controls.animationSpeed}
    />
  ) : (
    <Placeholder />
  );

  const groundOffset = model ? -Math.max(model.stats.size.y / 2, 0.5) : -1;
  return (
    <div
      className={`app-shell${dragging ? " is-dragging" : ""}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      <Leva
        collapsed
        oneLineLabels
        hideCopyButton
        titleBar={{ position: levaPosition, drag: true, filter: false }}
      />
      <aside className="side-panel">
        <div className="panel-card">
          <div className="brand">
            <div>
              <h1>{copy.title}</h1>
              <p>{copy.subtitle}</p>
            </div>
            <span className={`status-pill ${isOnline ? "online" : "offline"}`}>
              {copy.offlineReady} · {isOnline ? copy.online : copy.offline}
            </span>
          </div>
        </div>

        <div className="panel-card">
          <h2>{copy.loadTitle}</h2>
          <p className="muted">{copy.dropTitle}</p>
          <p className="muted">{copy.dropHint}</p>
          <div className="button-row">
            <label className="button button--primary">
              {copy.chooseFile}
              <input
                className="file-input"
                type="file"
                accept=".drc,.glb,.gltf,.obj,.ply,.stl,.usd,.usdz"
                multiple
                onChange={handleInput}
              />
            </label>
            <button className="button" type="button" onClick={handleExample}>
              {copy.loadExample}
            </button>
            <button className="button" type="button" onClick={handleMorphExample}>
              {copy.loadMorphExample}
            </button>
          </div>
          <div className="button-row">
            <button className="button button--ghost" type="button" onClick={handleClear}>
              {copy.clearModel}
            </button>
          </div>
          <div className="format-list">
            <span className="format-label">{copy.supportedFormats}</span>
            <span className="format-value">DRC · GLB · GLTF · OBJ · PLY · STL · USD</span>
          </div>
          {loading && <div className="loading-chip">{copy.loading}</div>}
          {error && <div className="error-chip">{error}</div>}
        </div>

        <div className="panel-card">
          <h2>{copy.viewerTitle}</h2>
          <div className="segmented">
            {VIEWER_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`segmented__btn${controls.viewerMode === mode.id ? " active" : ""}`}
                onClick={() => setControls({ viewerMode: mode.id })}
              >
                {copy.viewerModes[mode.labelKey]}
              </button>
            ))}
          </div>
          <div className="toggle-grid">
            <label>
              <input type="checkbox" checked={controls.showAxes} onChange={(event) => setControls({ showAxes: event.target.checked })} />
              {copy.axes}
            </label>
            <label>
              <input type="checkbox" checked={controls.showGrid} onChange={(event) => setControls({ showGrid: event.target.checked })} />
              {copy.grid}
            </label>
            <label>
              <input type="checkbox" checked={controls.showGizmo} onChange={(event) => setControls({ showGizmo: event.target.checked })} />
              {copy.gizmo}
            </label>
            <label>
              <input type="checkbox" checked={controls.showStats} onChange={(event) => setControls({ showStats: event.target.checked })} />
              {copy.stats}
            </label>
            <label>
              <input type="checkbox" checked={controls.autoRotate} onChange={(event) => setControls({ autoRotate: event.target.checked })} />
              {copy.autoRotate}
            </label>
          </div>
          <div className="section-sep" />
          <h3>{copy.lightingTitle}</h3>
          <div className="segmented">
            {LIGHT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`segmented__btn${controls.lightPreset === preset.id ? " active" : ""}`}
                onClick={() => setControls({ lightPreset: preset.id })}
              >
                {copy.lightPresets[preset.labelKey]}
              </button>
            ))}
          </div>
        </div>

        <div className="panel-card">
          <h2>{copy.animations}</h2>
          {animationList.length === 0 ? (
            <p className="muted">{copy.animationNone}</p>
          ) : (
            <div className="animation-panel">
              <div className="animation-list">
                {animationOptionsList.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={`chip${controls.animationClip === name ? " active" : ""}`}
                    onClick={() => setControls({ animationClip: name })}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="animation-controls">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setControls({ animationPlay: !controls.animationPlay })}
                >
                  {controls.animationPlay ? copy.animationPause : copy.animationPlay}
                </button>
                <label className="range">
                  <span>{copy.animationSpeed}</span>
                  <input
                    type="range"
                    min={0.2}
                    max={2.5}
                    step={0.1}
                    value={controls.animationSpeed}
                    onChange={(event) => setControls({ animationSpeed: Number(event.target.value) })}
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="panel-card">
          <h2>{copy.morphTargets}</h2>
          {!hasMorphTargets ? (
            <p className="muted">{copy.morphNone}</p>
          ) : (
            <>
              <p className="muted">{copy.morphQuick}</p>
              <div className="chip-group">
                <button type="button" className={`chip${isMorphEmpty ? " active" : ""}`} onClick={resetMorphTargets}>
                  {copy.morphNone}
                </button>
                {morphTargets.map((target) => (
                  <button
                    key={target.name}
                    type="button"
                    className={`chip${(morphValues[target.name] ?? 0) >= 0.5 ? " active" : ""}`}
                    onClick={() => applyMorphValue(target.name, 1, true)}
                  >
                    {target.name}
                  </button>
                ))}
              </div>
              <div className="morph-list">
                {morphTargets.map((target) => (
                  <div key={target.name} className="morph-row">
                    <label>
                      {target.name}
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={morphValues[target.name] ?? 0}
                        onChange={(event) => applyMorphValue(target.name, Number(event.target.value))}
                      />
                    </label>
                    <span className="morph-value">
                      {copy.morphStrength}: {(morphValues[target.name] ?? 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="panel-card">
          <h2>{copy.modelInfo}</h2>
          <div className="stats-grid">
            <div>
              <span>{copy.fileName}</span>
              <strong>{model?.name ?? copy.noModel}</strong>
            </div>
            <div>
              <span>{copy.format}</span>
              <strong>{model?.format?.toUpperCase() ?? "--"}</strong>
            </div>
            <div>
              <span>{copy.triangles}</span>
              <strong>{model ? formatNumber.format(model.stats.triangles) : "--"}</strong>
            </div>
            <div>
              <span>{copy.vertices}</span>
              <strong>{model ? formatNumber.format(model.stats.vertices) : "--"}</strong>
            </div>
            <div>
              <span>{copy.meshes}</span>
              <strong>{model ? formatNumber.format(model.stats.meshes) : "--"}</strong>
            </div>
            <div>
              <span>{copy.materials}</span>
              <strong>{model ? formatNumber.format(model.stats.materials) : "--"}</strong>
            </div>
            <div>
              <span>{copy.size}</span>
              <strong>{modelSizeLabel}</strong>
            </div>
          </div>
          <div className={`performance-hint ${performanceHint.level}`}>{performanceHint.message}</div>
        </div>
      </aside>
      <main className="viewer-panel">
        <div className="viewer-header">
          <div>
            <h2>{copy.viewerTitle}</h2>
            <p className="muted">
              {copy.perfFps}: {formatNumber.format(perfStats.fps)} · {copy.perfFrame}: {formatNumber.format(perfStats.frameMs)} ms
            </p>
          </div>
          <div className="viewer-actions">
            <button className="button" type="button" onClick={() => setFitSignal((prev) => prev + 1)}>
              {copy.reframe}
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => setControls({ language: language === "zh" ? "en" : "zh" })}
            >
              {language === "zh" ? "EN" : "中文"}
            </button>
          </div>
        </div>
        <div className="scene-frame">
          <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0, 8], fov: 45 }}>
            <color attach="background" args={[controls.background]} />
            {controls.showStats && false && <Stats className="stats-overlay" />}
            <PerformanceProbe enabled={controls.showStats} onUpdate={setPerfStats} />

            {controls.viewerMode === "stage" ? (
              <Bounds fit clip margin={1.2}>
                <FitToBounds object={model?.object ?? null} signal={fitSignal} />
                <Stage
                  key={model?.name ?? "empty"}
                  environment={null}
                  intensity={controls.lightIntensity}
                  shadows={{ type: "contact", opacity: 0.6, blur: 2, far: 12 }}
                  adjustCamera={false}
                  center={{ cacheKey: model?.name ?? "empty" }}
                >
                  {content}
                </Stage>
              </Bounds>
            ) : (
              <>
                <LightRig preset={controls.lightPreset} intensity={controls.lightIntensity} />
                <Bounds fit clip margin={1.2}>
                  <FitToBounds object={model?.object ?? null} signal={fitSignal} />
                  <Center>
                    {controls.viewerMode === "presentation" ? (
                      <PresentationControls global snap rotation={[0, 0, 0]} polar={[-0.8, 0.8]} azimuth={[-1.2, 1.2]}>
                        {content}
                      </PresentationControls>
                    ) : (
                      content
                    )}
                  </Center>
                </Bounds>
                <ContactShadows position={[0, groundOffset, 0]} opacity={0.55} scale={12} blur={2.4} far={12} />
              </>
            )}

            {controls.showGrid && (
              <Grid
                position={[0, groundOffset, 0]}
                infiniteGrid
                cellSize={0.5}
                cellThickness={0.8}
                sectionSize={3}
                sectionThickness={1.3}
                cellColor="#77848b"
                sectionColor="#9db0b8"
                fadeDistance={20}
                fadeStrength={2}
              />
            )}
            {controls.showAxes && <axesHelper args={[1.6]} />}
            {controls.showGizmo && (
              <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
                <GizmoViewport axisColors={["#e07a5f", "#3d7d7d", "#f2cc8f"]} labelColor="#1f2a2e" />
              </GizmoHelper>
            )}
            {controls.viewerMode !== "presentation" && <OrbitControls makeDefault enableDamping autoRotate={controls.autoRotate} />}
          </Canvas>
        </div>
        <div className="drop-overlay">
          <div>
            <h3>{copy.dropTitle}</h3>
            <p>{copy.dropHint}</p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
