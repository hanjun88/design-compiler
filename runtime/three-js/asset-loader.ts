/**
 * AssetLoader — loads textures, geometries, and environment maps
 * according to each asset's loadingStrategy.
 *
 * eager:    loaded during mount(), required failures throw
 * lazy:     loaded asynchronously after mount() returns
 * on-demand: loaded only via explicit loadAsset() call
 *
 * Geometry uses GLTFLoader (dynamic import to keep core bundle lean).
 * Textures use THREE.TextureLoader. Environment maps use TextureLoader
 * + PMREMGenerator for prefiltered irradiance.
 */

import * as THREE from 'three';
import type { ThreeJsSceneAsset } from '../../compiler-core/three-js-scene';
import { RuntimeError } from './errors';
import type { LoadedAsset, LoadedAssetObject } from './types';

export class AssetLoader {
  private textureLoader: THREE.TextureLoader;
  private loaded = new Map<string, LoadedAsset>();
  private pending = new Map<string, Promise<LoadedAssetObject>>();

  constructor() {
    this.textureLoader = new THREE.TextureLoader();
  }

  has(assetId: string): boolean {
    return this.loaded.has(assetId);
  }

  get(assetId: string): LoadedAsset | undefined {
    return this.loaded.get(assetId);
  }

  getAll(): LoadedAsset[] {
    return Array.from(this.loaded.values());
  }

  async load(asset: ThreeJsSceneAsset): Promise<LoadedAssetObject> {
    if (this.loaded.has(asset.assetId)) {
      return this.loaded.get(asset.assetId)!.object;
    }
    if (this.pending.has(asset.assetId)) {
      return this.pending.get(asset.assetId)!;
    }
    const promise = this.loadInternal(asset)
      .then((object) => {
        this.loaded.set(asset.assetId, { asset, object });
        this.pending.delete(asset.assetId);
        return object;
      })
      .catch((error) => {
        this.pending.delete(asset.assetId);
        throw error;
      });
    this.pending.set(asset.assetId, promise);
    return promise;
  }

  dispose(): void {
    for (const { object } of this.loaded.values()) {
      this.disposeObject(object);
    }
    this.loaded.clear();
    this.pending.clear();
  }

  private disposeObject(object: LoadedAssetObject): void {
    if (object instanceof THREE.Texture) {
      object.dispose();
    } else if (object instanceof THREE.BufferGeometry) {
      object.dispose();
    } else if (object instanceof THREE.Group || object instanceof THREE.Mesh) {
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          const mat = child.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        }
      });
    }
  }

  private async loadInternal(asset: ThreeJsSceneAsset): Promise<LoadedAssetObject> {
    switch (asset.type) {
      case 'texture':
        return this.loadTexture(asset);
      case 'geometry':
        return this.loadGeometry(asset);
      case 'environmentMap':
        return this.loadEnvironmentMap(asset);
      default:
        throw new RuntimeError(
          'SCHEMA_INVALID',
          `/assets/${asset.assetId}/type`,
          `Unsupported asset type for runtime loading: ${asset.type}`,
        );
    }
  }

  private loadTexture(asset: ThreeJsSceneAsset): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        asset.uri,
        (texture) => {
          texture.name = asset.assetId;
          texture.colorSpace = THREE.SRGBColorSpace;
          resolve(texture);
        },
        undefined,
        () => reject(new RuntimeError('ASSET_LOAD_FAILED', `/assets/${asset.assetId}`, `Failed to load texture: ${asset.uri}`)),
      );
    });
  }

  private async loadGeometry(asset: ThreeJsSceneAsset): Promise<THREE.Group> {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
      loader.load(
        asset.uri,
        (gltf) => {
          gltf.scene.name = asset.assetId;
          resolve(gltf.scene);
        },
        undefined,
        () => reject(new RuntimeError('ASSET_LOAD_FAILED', `/assets/${asset.assetId}`, `Failed to load geometry: ${asset.uri}`)),
      );
    });
  }

  private async loadEnvironmentMap(asset: ThreeJsSceneAsset): Promise<THREE.Texture> {
    const texture = await this.loadTexture(asset);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    return texture;
  }
}
