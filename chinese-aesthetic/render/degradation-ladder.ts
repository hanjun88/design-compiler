/**
 * Phase 5 Step 5.2 - Degradation Ladder and Poset Capping
 * Implements formal poset algebra and monotonic session capping.
 * Conforms strictly to CHINESE-AESTHETIC-P5-S5.2-CONTRACT-01-REV-07 §2
 */

export type CapabilityTier = 'WEBGL2' | 'WEBGL1' | 'STATIC' | 'DOM_NEUTRAL';

export const TIER_ORDER: Readonly<Record<CapabilityTier, number>> = Object.freeze({
  DOM_NEUTRAL: 0,
  STATIC: 1,
  WEBGL1: 2,
  WEBGL2: 3
});

export const ORDER_TO_TIER: Readonly<Record<number, CapabilityTier>> = Object.freeze({
  0: 'DOM_NEUTRAL',
  1: 'STATIC',
  2: 'WEBGL1',
  3: 'WEBGL2'
});

/**
 * Meet operator: Returns inf(hardwareTier, sessionCapTier)
 * Guarantees monotonic irreversibility across host window document session.
 */
export function capTierToSession(
  hardwareTier: CapabilityTier,
  sessionCapTier: CapabilityTier
): CapabilityTier {
  const hwIndex = TIER_ORDER[hardwareTier];
  const capIndex = TIER_ORDER[sessionCapTier];
  const targetIndex = Math.min(hwIndex, capIndex);
  const targetTier = ORDER_TO_TIER[targetIndex];
  if (!targetTier) {
    throw new Error(`DEGRADATION_LATTICE_ERROR: Invalid index resolution ${targetIndex}`);
  }
  return targetTier;
}

export class DegradationLadder {
  private _sessionCapTier: CapabilityTier;
  private _currentTier: CapabilityTier;

  constructor(initialTier: CapabilityTier = 'WEBGL2') {
    this._sessionCapTier = initialTier;
    this._currentTier = initialTier;
  }

  public get sessionCapTier(): CapabilityTier {
    return this._sessionCapTier;
  }

  public get currentTier(): CapabilityTier {
    return this._currentTier;
  }

  /**
   * Monotonically lower the session capability ceiling.
   * Irreversible for the lifespan of the host session.
   */
  public degradeSessionCap(newCap: CapabilityTier): CapabilityTier {
    const currentIndex = TIER_ORDER[this._sessionCapTier];
    const newIndex = TIER_ORDER[newCap];

    if (newIndex > currentIndex) {
      throw new Error(
        `SESSION_TIER_VIOLATION: Attempted to escalate session tier from ${this._sessionCapTier} to ${newCap}`
      );
    }

    this._sessionCapTier = newCap;
    this._currentTier = capTierToSession(this._currentTier, this._sessionCapTier);
    return this._currentTier;
  }

  /**
   * Re-evaluates active tier based on hardware capabilities while respecting session cap.
   */
  public reconcileHardware(hardwareTier: CapabilityTier): CapabilityTier {
    this._currentTier = capTierToSession(hardwareTier, this._sessionCapTier);
    return this._currentTier;
  }
}