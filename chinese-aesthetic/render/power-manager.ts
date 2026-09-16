/**
 * Phase 5 Step 5.2 - PowerManager State Machine
 * Implements 7 States x 11 Inputs = 77-Cell Total Function State Machine.
 * Conforms strictly to CHINESE-AESTHETIC-P5-S5.2-CONTRACT-01-REV-07 §3
 */

import { CapabilityTier, capTierToSession } from './degradation-ladder';
import { IRafDispatcher } from './raf-engine';

export type PowerState =
  | 'UNINITIALIZED'
  | 'ACTIVE'
  | 'THROTTLED'
  | 'DORMANT'
  | 'FROZEN'
  | 'RESTORING'
  | 'TERMINAL';

export type PowerInput =
  | 'INITIALIZE'
  | 'VISIBILITY_HIDE'
  | 'VISIBILITY_VISIBLE'
  | 'INPUT_WAKE'
  | 'MANUAL_FREEZE'
  | 'MANUAL_UNFREEZE'
  | 'CONTEXT_LOST'
  | 'RESTORE_BEGIN'
  | 'RESTORE_COMPLETE'
  | 'FAULT_ENCOUNTERED'
  | 'DISPOSE';

export type FreezeReason = 'CONTEXT_LOST' | 'MANUAL' | 'FAULT';

export const FREEZE_SEVERITY_ORDER: Readonly<Record<FreezeReason, number>> = Object.freeze({
  MANUAL: 0,
  CONTEXT_LOST: 1,
  FAULT: 2
});

export const SEVERITY_TO_FREEZE_REASON: Readonly<Record<number, FreezeReason>> = Object.freeze({
  0: 'MANUAL',
  1: 'CONTEXT_LOST',
  2: 'FAULT'
});

export function mapEventToSeverity(input: PowerInput): FreezeReason | null {
  switch (input) {
    case 'MANUAL_FREEZE':
      return 'MANUAL';
    case 'CONTEXT_LOST':
      return 'CONTEXT_LOST';
    case 'FAULT_ENCOUNTERED':
      return 'FAULT';
    default:
      return null;
  }
}

export function joinFreezeSeverity(
  current: FreezeReason | null,
  incoming: FreezeReason
): FreezeReason {
  if (current === null) {
    return incoming;
  }
  const currentIndex = FREEZE_SEVERITY_ORDER[current];
  const incomingIndex = FREEZE_SEVERITY_ORDER[incoming];
  const joinedIndex = Math.max(currentIndex, incomingIndex);
  return SEVERITY_TO_FREEZE_REASON[joinedIndex] ?? incoming;
}

export interface PowerStatusSnapshot {
  readonly state: PowerState;
  readonly freezeReason: FreezeReason | null;
  readonly pendingFreeze: boolean;
  readonly tier: CapabilityTier;
  readonly sessionCapTier: CapabilityTier;
}

export interface PowerManagerTelemetryEntry {
  readonly timestamp: number;
  readonly previousState: PowerState;
  readonly input: PowerInput;
  readonly targetState: PowerState;
  readonly freezeReason: FreezeReason | null;
  readonly detail?: string;
}

export class PowerManager {
  private _state: PowerState = 'UNINITIALIZED';
  private _freezeReason: FreezeReason | null = null;
  private _pendingFreeze: boolean = false;
  private _tier: CapabilityTier = 'WEBGL2';
  private _sessionCapTier: CapabilityTier = 'WEBGL2';
  private readonly _dispatcher?: IRafDispatcher;
  private readonly _telemetry: PowerManagerTelemetryEntry[] = [];

  constructor(
    initialTier: CapabilityTier = 'WEBGL2',
    dispatcher?: IRafDispatcher
  ) {
    this._tier = initialTier;
    this._sessionCapTier = initialTier;
    this._dispatcher = dispatcher;
  }

  public get snapshot(): PowerStatusSnapshot {
    return Object.freeze({
      state: this._state,
      freezeReason: this._freezeReason,
      pendingFreeze: this._pendingFreeze,
      tier: this._tier,
      sessionCapTier: this._sessionCapTier
    });
  }

  public get state(): PowerState {
    return this._state;
  }

  public get freezeReason(): FreezeReason | null {
    return this._freezeReason;
  }

  public get pendingFreeze(): boolean {
    return this._pendingFreeze;
  }

  public get telemetryHistory(): readonly PowerManagerTelemetryEntry[] {
    return this._telemetry;
  }

  private recordTelemetry(
    previousState: PowerState,
    input: PowerInput,
    targetState: PowerState,
    detail?: string
  ): void {
    if (this._telemetry.length >= 64) {
      this._telemetry.shift();
    }
    this._telemetry.push({
      timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      previousState,
      input,
      targetState,
      freezeReason: this._freezeReason,
      detail
    });
  }

  private triggerTerminalTeardown(): void {
    if (this._dispatcher && this._dispatcher.isActive) {
      try {
        this._dispatcher.destroy();
      } catch {
        // Safe absorption to prevent secondary failures during terminal teardown
      }
    }
  }

  /**
   * Deterministic 77-cell transition dispatch function.
   * Synchronously rethrows on ILLEGAL transitions while keeping state strictly immutable.
   */
  public transition(input: PowerInput): PowerState {
    const prevState = this._state;

    switch (this._state) {
      case 'UNINITIALIZED':
        return this.handleUninitialized(input, prevState);

      case 'ACTIVE':
        return this.handleActive(input, prevState);

      case 'THROTTLED':
        return this.handleThrottled(input, prevState);

      case 'DORMANT':
        return this.handleDormant(input, prevState);

      case 'FROZEN':
        return this.handleFrozen(input, prevState);

      case 'RESTORING':
        return this.handleRestoring(input, prevState);

      case 'TERMINAL':
        return this.handleTerminal(input, prevState);
    }
  }

  private handleUninitialized(input: PowerInput, prevState: PowerState): PowerState {
    switch (input) {
      case 'INITIALIZE': {
        const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
        this._state = isHidden ? 'THROTTLED' : 'ACTIVE';
        this.recordTelemetry(prevState, input, this._state, 'Guard [0]');
        return this._state;
      }
      case 'FAULT_ENCOUNTERED':
      case 'DISPOSE': {
        this._state = 'TERMINAL';
        this._freezeReason = input === 'FAULT_ENCOUNTERED' ? 'FAULT' : null;
        this.triggerTerminalTeardown();
        this.recordTelemetry(prevState, input, this._state);
        return this._state;
      }
      default:
        this.throwIllegalTransition(prevState, input);
    }
  }

  private handleActive(input: PowerInput, prevState: PowerState): PowerState {
    switch (input) {
      case 'INITIALIZE':
      case 'VISIBILITY_VISIBLE':
      case 'INPUT_WAKE':
        return this._state; // IDEMPOTENT

      case 'VISIBILITY_HIDE':
        this._state = 'THROTTLED';
        this.recordTelemetry(prevState, input, this._state);
        return this._state;

      case 'MANUAL_FREEZE':
        this._state = 'FROZEN';
        this._freezeReason = 'MANUAL';
        this.recordTelemetry(prevState, input, this._state, 'Guard [1]');
        return this._state;

      case 'CONTEXT_LOST':
        this._state = 'FROZEN';
        this._freezeReason = 'CONTEXT_LOST';
        this.recordTelemetry(prevState, input, this._state, 'Guard [2]');
        return this._state;

      case 'FAULT_ENCOUNTERED':
        this._state = 'TERMINAL';
        this._freezeReason = 'FAULT';
        this.triggerTerminalTeardown();
        this.recordTelemetry(prevState, input, this._state, 'TERMINAL_FRAME_FAILURE [3]');
        return this._state;

      case 'DISPOSE':
        this._state = 'TERMINAL';
        this.triggerTerminalTeardown();
        this.recordTelemetry(prevState, input, this._state);
        return this._state;

      default:
        this.throwIllegalTransition(prevState, input);
    }
  }

  private handleThrottled(input: PowerInput, prevState: PowerState): PowerState {
    switch (input) {
      case 'INITIALIZE':
      case 'VISIBILITY_HIDE':
        return this._state; // IDEMPOTENT

      case 'VISIBILITY_VISIBLE':
      case 'INPUT_WAKE':
        this._state = 'ACTIVE';
        this.recordTelemetry(prevState, input, this._state);
        return this._state;

      case 'MANUAL_FREEZE':
        this._state = 'FROZEN';
        this._freezeReason = 'MANUAL';
        this.recordTelemetry(prevState, input, this._state, 'Guard [1]');
        return this._state;

      case 'CONTEXT_LOST':
        this._state = 'FROZEN';
        this._freezeReason = 'CONTEXT_LOST';
        this.recordTelemetry(prevState, input, this._state, 'Guard [2]');
        return this._state;

      case 'FAULT_ENCOUNTERED':
        this._state = 'TERMINAL';
        this._freezeReason = 'FAULT';
        this.triggerTerminalTeardown();
        this.recordTelemetry(prevState, input, this._state, 'Guard [3]');
        return this._state;

      case 'DISPOSE':
        this._state = 'TERMINAL';
        this.triggerTerminalTeardown();
        this.recordTelemetry(prevState, input, this._state);
        return this._state;

      default:
        this.throwIllegalTransition(prevState, input);
    }
  }

  private handleDormant(input: PowerInput, prevState: PowerState): PowerState {
    switch (input) {
      case 'INITIALIZE':
      case 'VISIBILITY_HIDE':
        return this._state; // IDEMPOTENT

      case 'VISIBILITY_VISIBLE':
      case 'INPUT_WAKE':
        this._state = 'ACTIVE';
        this.recordTelemetry(prevState, input, this._state);
        return this._state;

      case 'MANUAL_FREEZE':
        this._state = 'FROZEN';
        this._freezeReason = 'MANUAL';
        this.recordTelemetry(prevState, input, this._state, 'Guard [1]');
        return this._state;

      case 'CONTEXT_LOST':
        this._state = 'FROZEN';
        this._freezeReason = 'CONTEXT_LOST';
        this.recordTelemetry(prevState, input, this._state, 'Guard [2]');
        return this._state;

      case 'FAULT_ENCOUNTERED':
        this._state = 'TERMINAL';
        this._freezeReason = 'FAULT';
        this.triggerTerminalTeardown();
        this.recordTelemetry(prevState, input, this._state, 'Guard [3]');
        return this._state;

      case 'DISPOSE':
        this._state = 'TERMINAL';
        this.triggerTerminalTeardown();
        this.recordTelemetry(prevState, input, this._state);
        return this._state;

      default:
        this.throwIllegalTransition(prevState, input);
    }
  }

  private handleFrozen(input: PowerInput, prevState: PowerState): PowerState {
    switch (input) {
      case 'VISIBILITY_HIDE':
      case 'VISIBILITY_VISIBLE':
      case 'MANUAL_FREEZE':
        return this._state; // IDEMPOTENT

      case 'INPUT_WAKE':
        // Guard [4]: Anti-accidental wake guard
        this.throwIllegalTransition(prevState, input, 'Anti-wake protection locked in FROZEN');

      case 'MANUAL_UNFREEZE':
        // Guard [5]: Only valid if freezeReason === 'MANUAL'
        if (this._freezeReason === 'MANUAL') {
          this._state = 'DORMANT';
          this._freezeReason = null;
          this.recordTelemetry(prevState, input, this._state, 'Guard [5]');
          return this._state;
        }
        this.throwIllegalTransition(prevState, input, 'Manual unfreeze rejected: reason is not MANUAL');

      case 'CONTEXT_LOST':
        // Guard [6]: Conditional upgrade transition
        if (this._freezeReason === 'MANUAL') {
          this._freezeReason = 'CONTEXT_LOST';
          this.recordTelemetry(prevState, input, this._state, 'Upgraded reason from MANUAL to CONTEXT_LOST');
          return this._state; // VALID transition within FROZEN
        }
        return this._state; // IDEMPOTENT for CONTEXT_LOST or FAULT

      case 'RESTORE_BEGIN':
        // Guard [7]: Only valid if freezeReason === 'CONTEXT_LOST'
        if (this._freezeReason === 'CONTEXT_LOST') {
          this._state = 'RESTORING';
          this._pendingFreeze = false; // Atomic initialization to false
          this.recordTelemetry(prevState, input, this._state, 'Guard [7]');
          return this._state;
        }
        this.throwIllegalTransition(prevState, input, 'Restore begin rejected: reason is not CONTEXT_LOST');

      case 'FAULT_ENCOUNTERED':
        // Intentional convergence to TERMINAL; does not become IDEMPOTENT even if already FAULT
        this._state = 'TERMINAL';
        this._freezeReason = 'FAULT';
        this.triggerTerminalTeardown();
        this.recordTelemetry(prevState, input, this._state, 'FROZEN fault convergence');
        return this._state;

      case 'DISPOSE':
        this._state = 'TERMINAL';
        this.triggerTerminalTeardown();
        this.recordTelemetry(prevState, input, this._state);
        return this._state;

      default:
        this.throwIllegalTransition(prevState, input);
    }
  }

  private handleRestoring(input: PowerInput, prevState: PowerState): PowerState {
    switch (input) {
      case 'VISIBILITY_HIDE':
      case 'VISIBILITY_VISIBLE':
      case 'RESTORE_BEGIN':
        return this._state; // IDEMPOTENT [9]

      case 'MANUAL_FREEZE':
        // Guard [10] (P1-01 Clclosed): Self-loop transition with side effect
        this._pendingFreeze = true;
        this.recordTelemetry(prevState, input, this._state, 'Guard [10]: Set pendingFreeze := true');
        return this._state;

      case 'CONTEXT_LOST':
        // Guard [8]: Secondary context loss rollback
        this._state = 'FROZEN';
        this._pendingFreeze = false;
        this._freezeReason = 'CONTEXT_LOST';
        this.recordTelemetry(prevState, input, this._state, 'Guard [8]: Rollback to FROZEN');
        return this._state;

      case 'RESTORE_COMPLETE': {
        // Guard [11]: Resolution guard
        if (this._pendingFreeze) {
          // Priority Branch A: Explicit user intention
          this._state = 'FROZEN';
          this._freezeReason = 'MANUAL';
          this.recordTelemetry(prevState, input, this._state, 'Guard [11A]: Priority pendingFreeze');
        } else {
          // Priority Branch B: Real-time visibility
          const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
          this._state = isHidden ? 'THROTTLED' : 'ACTIVE';
          this._freezeReason = null;
          this.recordTelemetry(prevState, input, this._state, 'Guard [11B]: Direct visibility');
        }
        this._pendingFreeze = false; // Atomic reset
        this._tier = capTierToSession(this._tier, this._sessionCapTier);
        return this._state;
      }

      case 'FAULT_ENCOUNTERED':
        this._state = 'TERMINAL';
        this._freezeReason = 'FAULT';
        this._pendingFreeze = false;
        this.triggerTerminalTeardown();
        this.recordTelemetry(prevState, input, this._state);
        return this._state;

      case 'DISPOSE':
        this._state = 'TERMINAL';
        this._pendingFreeze = false;
        this.triggerTerminalTeardown();
        this.recordTelemetry(prevState, input, this._state);
        return this._state;

      default:
        this.throwIllegalTransition(prevState, input);
    }
  }

  private handleTerminal(input: PowerInput, prevState: PowerState): PowerState {
    switch (input) {
      case 'VISIBILITY_HIDE':
      case 'VISIBILITY_VISIBLE':
      case 'INPUT_WAKE':
      case 'MANUAL_FREEZE':
      case 'MANUAL_UNFREEZE':
      case 'CONTEXT_LOST':
      case 'FAULT_ENCOUNTERED':
      case 'DISPOSE':
        return this._state; // IDEMPOTENT terminal absorption

      default:
        this.throwIllegalTransition(prevState, input);
    }
  }

  private throwIllegalTransition(fromState: PowerState, input: PowerInput, message?: string): never {
    const errorMsg = `POWER_ILLEGAL_TRANSITION: Invalid input [${input}] while in state [${fromState}]${
      message ? ' - ' + message : ''
    }`;
    throw new Error(errorMsg);
  }
}