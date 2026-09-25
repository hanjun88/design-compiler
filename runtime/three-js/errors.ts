/**
 * RuntimeError — fail-closed error entity for ThreeJsSceneRuntime.
 * All runtime failures converge here; no silent fallbacks or defaults.
 */

export type RuntimeErrorCode =
  | 'SCHEMA_INVALID'
  | 'MISSING_FIELD'
  | 'HASH_CHAIN_BROKEN'
  | 'RUNTIME_DISPOSED'
  | 'ASSET_NOT_FOUND'
  | 'ASSET_LOAD_FAILED'
  | 'RENDERER_UNAVAILABLE'
  | 'MOUNT_FAILED'
  | 'UNSUPPORTED_RENDERER';

export class RuntimeError extends Error {
  constructor(
    public readonly code: RuntimeErrorCode,
    public readonly path: string,
    message: string,
  ) {
    super(`[${code}] ${path}: ${message}`);
    this.name = 'RuntimeError';
  }
}
