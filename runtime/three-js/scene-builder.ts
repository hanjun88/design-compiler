/**
 * SceneBuilder — constructs THREE.Scene, camera, lights, and materials
 * deterministically from a validated ThreeJsSceneContract.
 *
 * No defaults are invented: every value comes from the contract.
 * Geometry meshes are attached later by the asset loader when geometry
 * assets finish loading.
 */

import * as THREE from 'three';
import type { ThreeJsSceneContract } from '../../compiler-core/three-js-scene';
import { RuntimeError } from './errors';

export interface BuiltScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  lights: THREE.Light[];
  materials: Map<string, THREE.MeshStandardMaterial>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(params: Record<string, unknown>, key: string, path: string): number {
  const value = params[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RuntimeError('MISSING_FIELD', path, `Expected finite number at ${path}`);
  }
  return value;
}

function readString(params: Record<string, unknown>, key: string, path: string): string {
  const value = params[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new RuntimeError('MISSING_FIELD', path, `Expected non-empty string at ${path}`);
  }
  return value;
}

function buildCamera(contract: ThreeJsSceneContract): THREE.PerspectiveCamera {
  const cameraDef = contract.scene.camera;
  const params = isRecord(cameraDef.params) ? cameraDef.params : {};
  const fov = readNumber(params, 'fov', '/scene/camera/params/fov');
  const { width, height } = contract.render.resolution;
  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 1000);
  camera.name = cameraDef.type;
  return camera;
}

function buildLights(contract: ThreeJsSceneContract): THREE.Light[] {
  const lights: THREE.Light[] = [];
  for (const lightDef of contract.scene.lights) {
    const params = isRecord(lightDef.parameters) ? lightDef.parameters : {};
    if (lightDef.type === 'KeyLight' || lightDef.type === 'DirectionalLight') {
      const intensity = readNumber(params, 'intensity', `/scene/lights/${lightDef.id}/intensity`);
      const directional = new THREE.DirectionalLight(0xffffff, intensity);
      directional.name = lightDef.id;
      const azimuth = typeof params.azimuth === 'number' ? params.azimuth : 0;
      const elevation = typeof params.elevation === 'number' ? params.elevation : 45;
      const radius = 5;
      directional.position.set(
        radius * Math.cos(elevation * Math.PI / 180) * Math.sin(azimuth * Math.PI / 180),
        radius * Math.sin(elevation * Math.PI / 180),
        radius * Math.cos(elevation * Math.PI / 180) * Math.cos(azimuth * Math.PI / 180),
      );
      lights.push(directional);
    } else if (lightDef.type === 'AmbientLight') {
      const intensity = readNumber(params, 'intensity', `/scene/lights/${lightDef.id}/intensity`);
      const ambient = new THREE.AmbientLight(0xffffff, intensity);
      ambient.name = lightDef.id;
      lights.push(ambient);
    } else {
      throw new RuntimeError('SCHEMA_INVALID', `/scene/lights/${lightDef.id}/type`, `Unsupported light type: ${lightDef.type}`);
    }
  }
  if (lights.length === 0) {
    throw new RuntimeError('MISSING_FIELD', '/scene/lights', 'At least one light is required');
  }
  return lights;
}

function buildMaterials(contract: ThreeJsSceneContract): Map<string, THREE.MeshStandardMaterial> {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  for (const materialDef of contract.scene.materials) {
    const uniforms = isRecord(materialDef.uniforms) ? materialDef.uniforms : {};
    const material = new THREE.MeshStandardMaterial();
    material.name = materialDef.bindingId;
    if (typeof uniforms.roughness === 'number') material.roughness = uniforms.roughness;
    if (typeof uniforms.metalness === 'number') material.metalness = uniforms.metalness;
    if (typeof uniforms.color === 'string') material.color.set(uniforms.color);
    materials.set(materialDef.bindingId, material);
  }
  return materials;
}

function buildEnvironment(contract: ThreeJsSceneContract, scene: THREE.Scene): void {
  const env = contract.scene.environment;
  if (env.background !== null) {
    scene.background = new THREE.Color(env.background);
  }
  const fog = isRecord(env.fog) ? env.fog : {};
  const fogType = typeof fog.type === 'string' ? fog.type : 'none';
  if (fogType === 'linear') {
    const near = typeof fog.near === 'number' ? fog.near : 1;
    const far = typeof fog.far === 'number' ? fog.far : 100;
    const color = typeof fog.color === 'string' ? fog.color : '#ffffff';
    scene.fog = new THREE.Fog(new THREE.Color(color), near, far);
  } else if (fogType === 'exponential') {
    const density = typeof fog.density === 'number' ? fog.density : 0.01;
    const color = typeof fog.color === 'string' ? fog.color : '#ffffff';
    scene.fog = new THREE.FogExp2(new THREE.Color(color), density);
  }
}

export function buildSceneFromContract(contract: ThreeJsSceneContract): BuiltScene {
  const scene = new THREE.Scene();
  scene.name = 'ThreeJsSceneRuntime';

  buildEnvironment(contract, scene);

  const camera = buildCamera(contract);
  const lights = buildLights(contract);
  for (const light of lights) scene.add(light);

  const materials = buildMaterials(contract);

  return { scene, camera, lights, materials };
}
