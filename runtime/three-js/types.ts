/**
 * Public types for ThreeJsSceneRuntime.
 */

import type * as THREE from 'three';
import type { ThreeJsSceneAsset } from '../../compiler-core/three-js-scene';

export interface MountResult {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer | null;
  mountedAt: string;
  eagerAssetsLoaded: number;
  eagerAssetsSkipped: number;
}

export type RuntimeEventName = 'assetLoaded' | 'frame' | 'error';

export interface AssetLoadedEvent {
  assetId: string;
  type: string;
  uri: string;
}

export interface FrameEvent {
  delta: number;
  elapsed: number;
}

export interface RuntimeErrorEvent {
  code: string;
  message: string;
  path?: string;
}

export type RuntimeEventPayload = AssetLoadedEvent | FrameEvent | RuntimeErrorEvent;

export type RuntimeEventListener = (event: RuntimeEventPayload) => void;

export type LoadedAssetObject =
  | THREE.Texture
  | THREE.BufferGeometry
  | THREE.Mesh
  | THREE.Group;

export interface LoadedAsset {
  asset: ThreeJsSceneAsset;
  object: LoadedAssetObject;
}
