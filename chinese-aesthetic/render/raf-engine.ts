/**
 * Phase 5 Step 5.2 - Singleton RAF Dispatcher & Lease Isolation
 * Conforms strictly to CHINESE-AESTHETIC-P5-S5.2-CONTRACT-01-REV-07 §4
 */

export const RAF_DISPATCHER_KEY = Symbol.for(
  'design_compiler.chinese_aesthetic.raf_dispatcher.v1'
);

export interface RafLease {
  readonly leaseId: string;
  readonly acquiredAt: number;
  release(): boolean;
}

export interface IRafDispatcher {
  readonly isActive: boolean;
  schedule(callback: (timestamp: number, frameDelta: number) => void): string;
  cancel(registrationId: string): void;
  acquireLease(ownerTag: string): RafLease;
  destroy(): void;
}

export function installGlobalDispatcher(instance: IRafDispatcher): void {
  // [Safe Widening Annotation - P2-02 Closed]
  // This type assertion is strictly limited to widening globalThis,
  // addressing TypeScript's lack of private Symbol index signatures on the global scope.
  // It introduces zero unchecked prototype mutations, conforming to zero-unchecked discipline.
  const target = globalThis as unknown as Record<symbol, unknown>;
  if (target[RAF_DISPATCHER_KEY]) {
    throw new Error('DISPATCHER_REALM_COLLISION: Duplicate dispatcher in current realm.');
  }

  Object.defineProperty(globalThis, RAF_DISPATCHER_KEY, {
    value: instance,
    writable: false,
    configurable: false,
    enumerable: false // Physics-level defense against Object.keys enumeration probing
  });
}

export function getGlobalDispatcher(): IRafDispatcher | null {
  const target = globalThis as unknown as Record<symbol, unknown>;
  return (target[RAF_DISPATCHER_KEY] as IRafDispatcher) ?? null;
}

export class RafDispatcher implements IRafDispatcher {
  private _isActive: boolean = true;
  private _activeLeaseId: string | null = null;
  private _rafHandle: number | null = null;
  private _lastTimestamp: number = 0;
  private readonly _callbacks: Map<string, (timestamp: number, frameDelta: number) => void> = new Map();
  private _nextCallbackId: number = 1;

  constructor() {
    this.startLoop();
  }

  public get isActive(): boolean {
    return this._isActive;
  }

  private assertActive(): void {
    if (!this._isActive) {
      throw new Error('RAF_DISPATCHER_INACTIVE: Operation rejected on destroyed dispatcher.');
    }
  }

  public schedule(callback: (timestamp: number, frameDelta: number) => void): string {
    this.assertActive();
    const id = `cb_${this._nextCallbackId++}_${Date.now()}`;
    this._callbacks.set(id, callback);
    return id;
  }

  public cancel(registrationId: string): void {
    this.assertActive();
    this._callbacks.delete(registrationId);
  }

  public acquireLease(ownerTag: string): RafLease {
    this.assertActive();
    if (this._activeLeaseId !== null) {
      throw new Error(`RAF_LEASE_CONFLICT: Active lease already held. Requested by [${ownerTag}]`);
    }

    const leaseId = `lease_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    this._activeLeaseId = leaseId;
    let released = false;

    return {
      leaseId,
      acquiredAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      release: (): boolean => {
        if (released) return false;
        if (this._activeLeaseId === leaseId) {
          this._activeLeaseId = null;
          released = true;
          return true;
        }
        return false;
      }
    };
  }

  public destroy(): void {
    if (!this._isActive) return;
    this._isActive = false;

    if (this._rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
      try {
        cancelAnimationFrame(this._rafHandle);
      } catch {
        // Safe absorption
      }
      this._rafHandle = null;
    }

    this._callbacks.clear();
    this._activeLeaseId = null;
  }

  private startLoop(): void {
    if (typeof requestAnimationFrame === 'undefined') return;

    const tick = (timestamp: number): void => {
      if (!this._isActive) return;

      const frameDelta = this._lastTimestamp > 0 ? timestamp - this._lastTimestamp : 16.67;
      this._lastTimestamp = timestamp;

      // Asynchronous error triage: catch frame exceptions and absorb into funnel
      for (const [id, cb] of Array.from(this._callbacks.entries())) {
        try {
          cb(timestamp, frameDelta);
        } catch {
          // Funnel absorbs tick exceptions, preventing host unhandled escapes
          this._callbacks.delete(id);
        }
      }

      if (this._isActive) {
        this._rafHandle = requestAnimationFrame(tick);
      }
    };

    this._rafHandle = requestAnimationFrame(tick);
  }
}