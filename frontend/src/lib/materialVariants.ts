import type * as THREE from "three";
import type { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type {
  MaterialVariantBinding,
  MaterialVariantInfo,
} from "./viewerTypes";

export const DEFAULT_MATERIAL_VARIANT_ID = "default";
export const KHR_MATERIALS_VARIANTS = "KHR_materials_variants";

type GltfMaterialVariantDef = {
  name?: unknown;
};

type GltfMaterialVariantMapping = {
  material?: unknown;
  variants?: unknown;
};

type GltfPrimitiveDef = {
  extensions?: {
    [KHR_MATERIALS_VARIANTS]?: {
      mappings?: unknown;
    };
  };
};

type GltfMeshDef = {
  primitives?: GltfPrimitiveDef[];
};

type GltfJson = {
  extensions?: {
    [KHR_MATERIALS_VARIANTS]?: {
      variants?: unknown;
    };
  };
  meshes?: GltfMeshDef[];
};

type GltfAssociation = {
  meshes?: number;
  primitives?: number;
};

type GltfParserWithJson = GLTF["parser"] & {
  json: GltfJson;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIndex(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return (object as THREE.Mesh).isMesh === true;
}

function getVariantName(value: unknown, index: number) {
  if (isRecord(value) && typeof value.name === "string" && value.name.trim()) {
    return value.name.trim();
  }
  return `Variant ${index + 1}`;
}

function addMaterial(
  materials: Set<THREE.Material>,
  material: THREE.Material | THREE.Material[] | null | undefined
) {
  if (!material) return;
  if (Array.isArray(material)) {
    material.forEach((item) => addMaterial(materials, item));
    return;
  }
  materials.add(material);
}

function markMaterialForUpdate(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((item) => markMaterialForUpdate(item));
    return;
  }
  material.needsUpdate = true;
}

async function resolveVariantMappings(
  parser: GltfParserWithJson,
  mappings: unknown[],
  variants: MaterialVariantInfo[],
  binding: MaterialVariantBinding,
  prepareMaterial?: (material: THREE.Material) => void
) {
  const touchedVariants = new Set<MaterialVariantInfo>();

  await Promise.all(
    mappings.map(async (mapping) => {
      if (!isRecord(mapping)) return;
      const materialIndex = mapping.material;
      if (!isIndex(materialIndex)) return;
      if (!Array.isArray(mapping.variants)) return;

      let material: THREE.Material;
      try {
        material = (await parser.getDependency("material", materialIndex)) as THREE.Material;
      } catch (error) {
        console.warn("Failed to load KHR_materials_variants material", error);
        return;
      }

      prepareMaterial?.(material);
      mapping.variants.forEach((variantIndex) => {
        if (!isIndex(variantIndex)) return;
        const variant = variants[variantIndex];
        if (!variant) return;
        binding.variantMaterials[variant.id] = material;
        touchedVariants.add(variant);
      });
    })
  );

  touchedVariants.forEach((variant) => {
    variant.bindings.push(binding);
  });
}

export function registerMaterialVariantsExtension(loader: GLTFLoader) {
  loader.register(() => ({ name: KHR_MATERIALS_VARIANTS }));
}

export async function collectGltfMaterialVariants(
  gltf: GLTF,
  prepareMaterial?: (material: THREE.Material) => void
) {
  const parser = gltf.parser as GltfParserWithJson;
  const json = parser.json;
  const variantDefs = json.extensions?.[KHR_MATERIALS_VARIANTS]?.variants;
  if (!Array.isArray(variantDefs)) return [];

  const variants: MaterialVariantInfo[] = variantDefs.map(
    (variant: GltfMaterialVariantDef, index: number) => ({
      id: String(index),
      name: getVariantName(variant, index),
      bindings: [],
    })
  );

  const pending: Promise<void>[] = [];
  gltf.scene.traverse((child) => {
    if (!isMesh(child)) return;

    const association = parser.associations.get(child) as GltfAssociation | undefined;
    if (!isIndex(association?.meshes) || !isIndex(association?.primitives)) return;

    const primitive =
      json.meshes?.[association.meshes]?.primitives?.[association.primitives];
    const mappings = primitive?.extensions?.[KHR_MATERIALS_VARIANTS]?.mappings;
    if (!Array.isArray(mappings)) return;

    const binding: MaterialVariantBinding = {
      mesh: child,
      originalMaterial: child.material,
      variantMaterials: {},
    };

    pending.push(
      resolveVariantMappings(parser, mappings as GltfMaterialVariantMapping[], variants, binding, prepareMaterial)
    );
  });

  await Promise.all(pending);
  return variants.filter((variant) => variant.bindings.length > 0);
}

export function applyMaterialVariant(
  materialVariants: MaterialVariantInfo[],
  activeVariantId: string
) {
  const bindings = new Set<MaterialVariantBinding>();
  materialVariants.forEach((variant) => {
    variant.bindings.forEach((binding) => bindings.add(binding));
  });

  bindings.forEach((binding) => {
    binding.mesh.material = binding.originalMaterial;
    markMaterialForUpdate(binding.originalMaterial);
  });

  if (activeVariantId === DEFAULT_MATERIAL_VARIANT_ID) return;

  const activeVariant = materialVariants.find((variant) => variant.id === activeVariantId);
  activeVariant?.bindings.forEach((binding) => {
    const material = binding.variantMaterials[activeVariantId];
    if (!material) return;
    binding.mesh.material = material;
    markMaterialForUpdate(material);
  });
}

export function collectMaterialVariantMaterials(materialVariants: MaterialVariantInfo[]) {
  const materials = new Set<THREE.Material>();
  materialVariants.forEach((variant) => {
    variant.bindings.forEach((binding) => {
      addMaterial(materials, binding.originalMaterial);
      Object.values(binding.variantMaterials).forEach((material) => {
        addMaterial(materials, material);
      });
    });
  });
  return Array.from(materials);
}
