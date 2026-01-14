
import { Leva, useControls } from "leva";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { USDZLoader } from "three/examples/jsm/loaders/USDZLoader.js";
import { SidePanel } from "./components/SidePanel";
import { ViewerPanel } from "./components/ViewerPanel";
import { I18N } from "./i18n/copy";
import type {
  ControlsState,
  CustomPropertySection,
  Language,
  LightPreset,
  ModelState,
  MorphBinding,
  MorphTargetInfo,
  NamedCustomData,
  PerformanceHint,
  PerformanceStats,
  ViewerMode,
} from "./lib/viewerTypes";
import "./App.css";

const SUPPORTED_FORMATS = ["drc", "glb", "gltf", "obj", "ply", "stl", "usd", "usdz"];
const SUPPORTED_FORMAT_LABEL =
  "DRC \u00b7 GLB \u00b7 GLTF \u00b7 OBJ \u00b7 PLY \u00b7 STL \u00b7 USD";


const LIGHT_PRESETS: { id: LightPreset; labelKey: keyof (typeof I18N)["zh"]["lightPresets"] }[] = [
  { id: "none", labelKey: "none" },
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

function getSystemLanguage(): Language {
  if (typeof navigator === "undefined") return "en";
  const primary = (navigator.language || navigator.languages?.[0] || "").toLowerCase();
  return primary.startsWith("zh") ? "zh" : "en";
}

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

function getModelStats(object: THREE.Object3D): ModelState["stats"] {
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

function getPerformanceHint(triangles: number, language: Language): PerformanceHint {
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

type GltfJson = {
  extras?: unknown;
  asset?: { extras?: unknown };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stripGltfExtensions(value: unknown) {
  if (!isRecord(value)) return value;
  const { gltfExtensions, ...rest } = value;
  return rest;
}

function hasCustomValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

function collectGltfCustomSections(gltf: GLTF) {
  const sections: CustomPropertySection[] = [];
  const json = (gltf as GLTF & { parser?: { json?: GltfJson } }).parser?.json;

  const assetExtras =
    (gltf.asset as { extras?: unknown } | undefined)?.extras ??
    json?.asset?.extras;
  if (hasCustomValue(assetExtras)) {
    sections.push({ id: "asset", value: assetExtras });
  }

  const rootExtras = json?.extras;
  if (hasCustomValue(rootExtras)) {
    sections.push({ id: "root", value: rootExtras });
  }

  const sceneExtras = stripGltfExtensions(gltf.scene?.userData);
  if (hasCustomValue(sceneExtras)) {
    sections.push({ id: "scene", value: sceneExtras });
  }

  const nodeEntries: NamedCustomData[] = [];
  gltf.scene?.traverse((child) => {
    if (child === gltf.scene) return;
    const data = stripGltfExtensions(child.userData);
    if (!hasCustomValue(data)) return;
    nodeEntries.push({ name: child.name || child.uuid, data });
  });
  if (nodeEntries.length) {
    sections.push({ id: "nodes", value: nodeEntries });
  }

  const materialEntries: NamedCustomData[] = [];
  const seenMaterials = new Set<string>();
  gltf.scene?.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      if (!material) return;
      const data = stripGltfExtensions(material.userData);
      if (!hasCustomValue(data)) return;
      if (seenMaterials.has(material.uuid)) return;
      seenMaterials.add(material.uuid);
      materialEntries.push({ name: material.name || material.uuid, data });
    });
  });
  if (materialEntries.length) {
    sections.push({ id: "materials", value: materialEntries });
  }

  return sections;
}

function App() {
  const [model, setModel] = useState<ModelState | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [perfStats, setPerfStats] = useState<PerformanceStats>({
    fps: 0,
    frameMs: 0,
    gpuMs: null,
    drawCalls: 0,
    triangles: 0,
  });
  const [fitSignal, setFitSignal] = useState(0);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [morphTargets, setMorphTargets] = useState<MorphTargetInfo[]>([]);
  const [morphValues, setMorphValues] = useState<Record<string, number>>({});
  const [levaPosition, setLevaPosition] = useState({ x: 24, y: 24 });
  const defaultLanguage = useMemo(() => getSystemLanguage(), []);

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
      language: { value: defaultLanguage, options: { 中文: "zh", English: "en" } },
      viewerMode: { value: "orbit", options: { Orbit: "orbit", Presentation: "presentation", Stage: "stage" } },
      showAxes: { value: true },
      axesSize: { value: 1.6, min: 0.4, max: 6, step: 0.1 },
      showGrid: { value: true },
      showGizmo: { value: true },
      showStats: { value: true },
      autoRotate: { value: false },
      lightPreset: {
        value: "threePoint",
        options: {
          "No light": "none",
          ThreePoint: "threePoint",
          Front: "front",
          Rim: "rim",
          Top: "top",
        },
      },
      lightIntensity: { value: 1.2, min: 0.2, max: 3, step: 0.1 },
      background: { value: "#0c1016" },
      animationClip: { value: "none", options: animationOptions },
      animationPlay: { value: true },
      animationSpeed: { value: 1, min: 0.2, max: 2.5, step: 0.1 },
    }),
    [animationOptions, defaultLanguage]
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
        let customProperties: CustomPropertySection[] = [];
        if (extension === "glb" || extension === "gltf") {
          const loader = new GLTFLoader(manager);
          loader.setDRACOLoader(dracoLoader);
          const gltf = await loadAsync(loader, getUrl(mainFile));
          loadedObject = gltf.scene;
          animations = gltf.animations ?? [];
          customProperties = collectGltfCustomSections(gltf);
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
          customProperties,
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
    const response = await fetch("/RobotExpressive.glb");
    const blob = await response.blob();
    const file = new File([blob], "RobotExpressive.glb", { type: "model/gltf-binary" });
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

  const languageToggleLabel = language === "zh" ? "EN" : "中文";
  const handleReframe = () => setFitSignal((prev) => prev + 1);
  const handleToggleLanguage = () => {
    setControls({ language: language === "zh" ? "en" : "zh" });
  };

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
      <SidePanel
        copy={copy}
        isOnline={isOnline}
        loading={loading}
        error={error}
        controls={controls}
        onSetControls={setControls}
        viewerModes={VIEWER_MODES}
        lightPresets={LIGHT_PRESETS}
        onChooseFile={handleInput}
        onLoadExample={handleExample}
        onLoadMorphExample={handleMorphExample}
        onClear={handleClear}
        model={model}
        modelSizeLabel={modelSizeLabel}
        formatNumber={formatNumber}
        performanceHint={performanceHint}
        morphTargets={morphTargets}
        morphValues={morphValues}
        onMorphChange={applyMorphValue}
        onMorphReset={resetMorphTargets}
        supportedFormatsLabel={SUPPORTED_FORMAT_LABEL}
      />
      <ViewerPanel
        copy={copy}
        controls={controls}
        perfStats={perfStats}
        formatNumber={formatNumber}
        model={model}
        fitSignal={fitSignal}
        onPerfUpdate={setPerfStats}
        onReframe={handleReframe}
        onToggleLanguage={handleToggleLanguage}
        languageToggleLabel={languageToggleLabel}
      />
    </div>
  );
}

export default App;
