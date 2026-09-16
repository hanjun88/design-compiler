"use strict";
var RenderPipeline = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // tests/chinese-aesthetic/render/e2e/browser-entry.ts
  var browser_entry_exports = {};
  __export(browser_entry_exports, {
    DegradationLadder: () => DegradationLadder,
    GOLDEN_FRAME_TRIANGLE: () => GOLDEN_FRAME_TRIANGLE,
    GlContextTracker: () => GlContextTracker,
    GlPipeline: () => GlPipeline,
    NDC_DECODE_TOLERANCE: () => NDC_DECODE_TOLERANCE,
    NDC_FRAGMENT_SHADER: () => NDC_FRAGMENT_SHADER,
    NDC_TEST_MESH: () => NDC_TEST_MESH,
    NDC_TEST_VERTICES: () => NDC_TEST_VERTICES,
    NDC_VERTEX_SHADER: () => NDC_VERTEX_SHADER,
    NEAR_CLIP_FULLY_INVISIBLE_TRIANGLE: () => NEAR_CLIP_FULLY_INVISIBLE_TRIANGLE,
    NEAR_CLIP_PARTIAL_TRIANGLE: () => NEAR_CLIP_PARTIAL_TRIANGLE,
    NEAR_CLIP_TEST_ASPECT: () => NEAR_CLIP_TEST_ASPECT,
    NEAR_CLIP_TEST_FAR: () => NEAR_CLIP_TEST_FAR,
    NEAR_CLIP_TEST_FOV_Y_RAD: () => NEAR_CLIP_TEST_FOV_Y_RAD,
    NEAR_CLIP_TEST_NEAR: () => NEAR_CLIP_TEST_NEAR,
    PARTIAL_TRIANGLE_CLIP_SPACE: () => PARTIAL_TRIANGLE_CLIP_SPACE,
    PowerManager: () => PowerManager,
    RAF_DISPATCHER_KEY: () => RAF_DISPATCHER_KEY,
    RafDispatcher: () => RafDispatcher,
    STANDARD_FRAGMENT_SHADER: () => STANDARD_FRAGMENT_SHADER,
    STANDARD_VERTEX_SHADER: () => STANDARD_VERTEX_SHADER,
    TIER_ORDER: () => TIER_ORDER,
    buildIndexBuffer: () => buildIndexBuffer,
    buildInterleavedVertexBuffer: () => buildInterleavedVertexBuffer,
    cameraSpaceToClipSpace: () => cameraSpaceToClipSpace,
    capTierToSession: () => capTierToSession,
    classifyClipVertex: () => classifyClipVertex,
    compileShaderProgram: () => compileShaderProgram,
    decodeByteToNdc: () => decodeByteToNdc,
    decodeRgbaToNdc: () => decodeRgbaToNdc,
    disposeShaderProgram: () => disposeShaderProgram,
    encodeNdcToByte: () => encodeNdcToByte,
    encodeNdcToRgba: () => encodeNdcToRgba,
    evaluateCameraMatrices: () => evaluateCameraMatrices,
    getGlobalDispatcher: () => getGlobalDispatcher,
    installGlobalDispatcher: () => installGlobalDispatcher,
    isNdcWithinTolerance: () => isNdcWithinTolerance
  });

  // chinese-aesthetic/render/degradation-ladder.ts
  var TIER_ORDER = Object.freeze({
    DOM_NEUTRAL: 0,
    STATIC: 1,
    WEBGL1: 2,
    WEBGL2: 3
  });
  var ORDER_TO_TIER = Object.freeze({
    0: "DOM_NEUTRAL",
    1: "STATIC",
    2: "WEBGL1",
    3: "WEBGL2"
  });
  function capTierToSession(hardwareTier, sessionCapTier) {
    const hwIndex = TIER_ORDER[hardwareTier];
    const capIndex = TIER_ORDER[sessionCapTier];
    const targetIndex = Math.min(hwIndex, capIndex);
    const targetTier = ORDER_TO_TIER[targetIndex];
    if (!targetTier) {
      throw new Error(`DEGRADATION_LATTICE_ERROR: Invalid index resolution ${targetIndex}`);
    }
    return targetTier;
  }
  var DegradationLadder = class {
    constructor(initialTier = "WEBGL2") {
      __publicField(this, "_sessionCapTier");
      __publicField(this, "_currentTier");
      this._sessionCapTier = initialTier;
      this._currentTier = initialTier;
    }
    get sessionCapTier() {
      return this._sessionCapTier;
    }
    get currentTier() {
      return this._currentTier;
    }
    /**
     * Monotonically lower the session capability ceiling.
     * Irreversible for the lifespan of the host session.
     */
    degradeSessionCap(newCap) {
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
    reconcileHardware(hardwareTier) {
      this._currentTier = capTierToSession(hardwareTier, this._sessionCapTier);
      return this._currentTier;
    }
  };

  // chinese-aesthetic/render/power-manager.ts
  var FREEZE_SEVERITY_ORDER = Object.freeze({
    MANUAL: 0,
    CONTEXT_LOST: 1,
    FAULT: 2
  });
  var SEVERITY_TO_FREEZE_REASON = Object.freeze({
    0: "MANUAL",
    1: "CONTEXT_LOST",
    2: "FAULT"
  });
  var PowerManager = class {
    constructor(initialTier = "WEBGL2", dispatcher) {
      __publicField(this, "_state", "UNINITIALIZED");
      __publicField(this, "_freezeReason", null);
      __publicField(this, "_pendingFreeze", false);
      __publicField(this, "_tier", "WEBGL2");
      __publicField(this, "_sessionCapTier", "WEBGL2");
      __publicField(this, "_dispatcher");
      __publicField(this, "_telemetry", []);
      this._tier = initialTier;
      this._sessionCapTier = initialTier;
      this._dispatcher = dispatcher;
    }
    get snapshot() {
      return Object.freeze({
        state: this._state,
        freezeReason: this._freezeReason,
        pendingFreeze: this._pendingFreeze,
        tier: this._tier,
        sessionCapTier: this._sessionCapTier
      });
    }
    get state() {
      return this._state;
    }
    get freezeReason() {
      return this._freezeReason;
    }
    get pendingFreeze() {
      return this._pendingFreeze;
    }
    get telemetryHistory() {
      return this._telemetry;
    }
    recordTelemetry(previousState, input, targetState, detail) {
      if (this._telemetry.length >= 64) {
        this._telemetry.shift();
      }
      this._telemetry.push({
        timestamp: typeof performance !== "undefined" ? performance.now() : Date.now(),
        previousState,
        input,
        targetState,
        freezeReason: this._freezeReason,
        detail
      });
    }
    triggerTerminalTeardown() {
      if (this._dispatcher && this._dispatcher.isActive) {
        try {
          this._dispatcher.destroy();
        } catch {
        }
      }
    }
    /**
     * Deterministic 77-cell transition dispatch function.
     * Synchronously rethrows on ILLEGAL transitions while keeping state strictly immutable.
     */
    transition(input) {
      const prevState = this._state;
      switch (this._state) {
        case "UNINITIALIZED":
          return this.handleUninitialized(input, prevState);
        case "ACTIVE":
          return this.handleActive(input, prevState);
        case "THROTTLED":
          return this.handleThrottled(input, prevState);
        case "DORMANT":
          return this.handleDormant(input, prevState);
        case "FROZEN":
          return this.handleFrozen(input, prevState);
        case "RESTORING":
          return this.handleRestoring(input, prevState);
        case "TERMINAL":
          return this.handleTerminal(input, prevState);
      }
    }
    handleUninitialized(input, prevState) {
      switch (input) {
        case "INITIALIZE": {
          const isHidden = typeof document !== "undefined" && document.visibilityState === "hidden";
          this._state = isHidden ? "THROTTLED" : "ACTIVE";
          this.recordTelemetry(prevState, input, this._state, "Guard [0]");
          return this._state;
        }
        case "FAULT_ENCOUNTERED":
        case "DISPOSE": {
          this._state = "TERMINAL";
          this._freezeReason = input === "FAULT_ENCOUNTERED" ? "FAULT" : null;
          this.triggerTerminalTeardown();
          this.recordTelemetry(prevState, input, this._state);
          return this._state;
        }
        default:
          this.throwIllegalTransition(prevState, input);
      }
    }
    handleActive(input, prevState) {
      switch (input) {
        case "INITIALIZE":
        case "VISIBILITY_VISIBLE":
        case "INPUT_WAKE":
          return this._state;
        // IDEMPOTENT
        case "VISIBILITY_HIDE":
          this._state = "THROTTLED";
          this.recordTelemetry(prevState, input, this._state);
          return this._state;
        case "MANUAL_FREEZE":
          this._state = "FROZEN";
          this._freezeReason = "MANUAL";
          this.recordTelemetry(prevState, input, this._state, "Guard [1]");
          return this._state;
        case "CONTEXT_LOST":
          this._state = "FROZEN";
          this._freezeReason = "CONTEXT_LOST";
          this.recordTelemetry(prevState, input, this._state, "Guard [2]");
          return this._state;
        case "FAULT_ENCOUNTERED":
          this._state = "TERMINAL";
          this._freezeReason = "FAULT";
          this.triggerTerminalTeardown();
          this.recordTelemetry(prevState, input, this._state, "TERMINAL_FRAME_FAILURE [3]");
          return this._state;
        case "DISPOSE":
          this._state = "TERMINAL";
          this.triggerTerminalTeardown();
          this.recordTelemetry(prevState, input, this._state);
          return this._state;
        default:
          this.throwIllegalTransition(prevState, input);
      }
    }
    handleThrottled(input, prevState) {
      switch (input) {
        case "INITIALIZE":
        case "VISIBILITY_HIDE":
          return this._state;
        // IDEMPOTENT
        case "VISIBILITY_VISIBLE":
        case "INPUT_WAKE":
          this._state = "ACTIVE";
          this.recordTelemetry(prevState, input, this._state);
          return this._state;
        case "MANUAL_FREEZE":
          this._state = "FROZEN";
          this._freezeReason = "MANUAL";
          this.recordTelemetry(prevState, input, this._state, "Guard [1]");
          return this._state;
        case "CONTEXT_LOST":
          this._state = "FROZEN";
          this._freezeReason = "CONTEXT_LOST";
          this.recordTelemetry(prevState, input, this._state, "Guard [2]");
          return this._state;
        case "FAULT_ENCOUNTERED":
          this._state = "TERMINAL";
          this._freezeReason = "FAULT";
          this.triggerTerminalTeardown();
          this.recordTelemetry(prevState, input, this._state, "Guard [3]");
          return this._state;
        case "DISPOSE":
          this._state = "TERMINAL";
          this.triggerTerminalTeardown();
          this.recordTelemetry(prevState, input, this._state);
          return this._state;
        default:
          this.throwIllegalTransition(prevState, input);
      }
    }
    handleDormant(input, prevState) {
      switch (input) {
        case "INITIALIZE":
        case "VISIBILITY_HIDE":
          return this._state;
        // IDEMPOTENT
        case "VISIBILITY_VISIBLE":
        case "INPUT_WAKE":
          this._state = "ACTIVE";
          this.recordTelemetry(prevState, input, this._state);
          return this._state;
        case "MANUAL_FREEZE":
          this._state = "FROZEN";
          this._freezeReason = "MANUAL";
          this.recordTelemetry(prevState, input, this._state, "Guard [1]");
          return this._state;
        case "CONTEXT_LOST":
          this._state = "FROZEN";
          this._freezeReason = "CONTEXT_LOST";
          this.recordTelemetry(prevState, input, this._state, "Guard [2]");
          return this._state;
        case "FAULT_ENCOUNTERED":
          this._state = "TERMINAL";
          this._freezeReason = "FAULT";
          this.triggerTerminalTeardown();
          this.recordTelemetry(prevState, input, this._state, "Guard [3]");
          return this._state;
        case "DISPOSE":
          this._state = "TERMINAL";
          this.triggerTerminalTeardown();
          this.recordTelemetry(prevState, input, this._state);
          return this._state;
        default:
          this.throwIllegalTransition(prevState, input);
      }
    }
    handleFrozen(input, prevState) {
      switch (input) {
        case "VISIBILITY_HIDE":
        case "VISIBILITY_VISIBLE":
        case "MANUAL_FREEZE":
          return this._state;
        // IDEMPOTENT
        case "INPUT_WAKE":
          this.throwIllegalTransition(prevState, input, "Anti-wake protection locked in FROZEN");
        case "MANUAL_UNFREEZE":
          if (this._freezeReason === "MANUAL") {
            this._state = "DORMANT";
            this._freezeReason = null;
            this.recordTelemetry(prevState, input, this._state, "Guard [5]");
            return this._state;
          }
          this.throwIllegalTransition(prevState, input, "Manual unfreeze rejected: reason is not MANUAL");
        case "CONTEXT_LOST":
          if (this._freezeReason === "MANUAL") {
            this._freezeReason = "CONTEXT_LOST";
            this.recordTelemetry(prevState, input, this._state, "Upgraded reason from MANUAL to CONTEXT_LOST");
            return this._state;
          }
          return this._state;
        // IDEMPOTENT for CONTEXT_LOST or FAULT
        case "RESTORE_BEGIN":
          if (this._freezeReason === "CONTEXT_LOST") {
            this._state = "RESTORING";
            this._pendingFreeze = false;
            this.recordTelemetry(prevState, input, this._state, "Guard [7]");
            return this._state;
          }
          this.throwIllegalTransition(prevState, input, "Restore begin rejected: reason is not CONTEXT_LOST");
        case "FAULT_ENCOUNTERED":
          this._state = "TERMINAL";
          this._freezeReason = "FAULT";
          this.triggerTerminalTeardown();
          this.recordTelemetry(prevState, input, this._state, "FROZEN fault convergence");
          return this._state;
        case "DISPOSE":
          this._state = "TERMINAL";
          this.triggerTerminalTeardown();
          this.recordTelemetry(prevState, input, this._state);
          return this._state;
        default:
          this.throwIllegalTransition(prevState, input);
      }
    }
    handleRestoring(input, prevState) {
      switch (input) {
        case "VISIBILITY_HIDE":
        case "VISIBILITY_VISIBLE":
        case "RESTORE_BEGIN":
          return this._state;
        // IDEMPOTENT [9]
        case "MANUAL_FREEZE":
          this._pendingFreeze = true;
          this.recordTelemetry(prevState, input, this._state, "Guard [10]: Set pendingFreeze := true");
          return this._state;
        case "CONTEXT_LOST":
          this._state = "FROZEN";
          this._pendingFreeze = false;
          this._freezeReason = "CONTEXT_LOST";
          this.recordTelemetry(prevState, input, this._state, "Guard [8]: Rollback to FROZEN");
          return this._state;
        case "RESTORE_COMPLETE": {
          if (this._pendingFreeze) {
            this._state = "FROZEN";
            this._freezeReason = "MANUAL";
            this.recordTelemetry(prevState, input, this._state, "Guard [11A]: Priority pendingFreeze");
          } else {
            const isHidden = typeof document !== "undefined" && document.visibilityState === "hidden";
            this._state = isHidden ? "THROTTLED" : "ACTIVE";
            this._freezeReason = null;
            this.recordTelemetry(prevState, input, this._state, "Guard [11B]: Direct visibility");
          }
          this._pendingFreeze = false;
          this._tier = capTierToSession(this._tier, this._sessionCapTier);
          return this._state;
        }
        case "FAULT_ENCOUNTERED":
          this._state = "TERMINAL";
          this._freezeReason = "FAULT";
          this._pendingFreeze = false;
          this.triggerTerminalTeardown();
          this.recordTelemetry(prevState, input, this._state);
          return this._state;
        case "DISPOSE":
          this._state = "TERMINAL";
          this._pendingFreeze = false;
          this.triggerTerminalTeardown();
          this.recordTelemetry(prevState, input, this._state);
          return this._state;
        default:
          this.throwIllegalTransition(prevState, input);
      }
    }
    handleTerminal(input, prevState) {
      switch (input) {
        case "VISIBILITY_HIDE":
        case "VISIBILITY_VISIBLE":
        case "INPUT_WAKE":
        case "MANUAL_FREEZE":
        case "MANUAL_UNFREEZE":
        case "CONTEXT_LOST":
        case "FAULT_ENCOUNTERED":
        case "DISPOSE":
          return this._state;
        // IDEMPOTENT terminal absorption
        default:
          this.throwIllegalTransition(prevState, input);
      }
    }
    throwIllegalTransition(fromState, input, message) {
      const errorMsg = `POWER_ILLEGAL_TRANSITION: Invalid input [${input}] while in state [${fromState}]${message ? " - " + message : ""}`;
      throw new Error(errorMsg);
    }
  };

  // chinese-aesthetic/render/raf-engine.ts
  var RAF_DISPATCHER_KEY = /* @__PURE__ */ Symbol.for(
    "design_compiler.chinese_aesthetic.raf_dispatcher.v1"
  );
  function installGlobalDispatcher(instance) {
    const target = globalThis;
    if (target[RAF_DISPATCHER_KEY]) {
      throw new Error("DISPATCHER_REALM_COLLISION: Duplicate dispatcher in current realm.");
    }
    Object.defineProperty(globalThis, RAF_DISPATCHER_KEY, {
      value: instance,
      writable: false,
      configurable: false,
      enumerable: false
      // Physics-level defense against Object.keys enumeration probing
    });
  }
  function getGlobalDispatcher() {
    const target = globalThis;
    return target[RAF_DISPATCHER_KEY] ?? null;
  }
  var RafDispatcher = class {
    constructor() {
      __publicField(this, "_isActive", true);
      __publicField(this, "_activeLeaseId", null);
      __publicField(this, "_rafHandle", null);
      __publicField(this, "_lastTimestamp", 0);
      __publicField(this, "_callbacks", /* @__PURE__ */ new Map());
      __publicField(this, "_nextCallbackId", 1);
      this.startLoop();
    }
    get isActive() {
      return this._isActive;
    }
    assertActive() {
      if (!this._isActive) {
        throw new Error("RAF_DISPATCHER_INACTIVE: Operation rejected on destroyed dispatcher.");
      }
    }
    schedule(callback) {
      this.assertActive();
      const id = `cb_${this._nextCallbackId++}_${Date.now()}`;
      this._callbacks.set(id, callback);
      return id;
    }
    cancel(registrationId) {
      this.assertActive();
      this._callbacks.delete(registrationId);
    }
    acquireLease(ownerTag) {
      this.assertActive();
      if (this._activeLeaseId !== null) {
        throw new Error(`RAF_LEASE_CONFLICT: Active lease already held. Requested by [${ownerTag}]`);
      }
      const leaseId = `lease_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      this._activeLeaseId = leaseId;
      let released = false;
      return {
        leaseId,
        acquiredAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
        release: () => {
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
    destroy() {
      if (!this._isActive) return;
      this._isActive = false;
      if (this._rafHandle !== null && typeof cancelAnimationFrame !== "undefined") {
        try {
          cancelAnimationFrame(this._rafHandle);
        } catch {
        }
        this._rafHandle = null;
      }
      this._callbacks.clear();
      this._activeLeaseId = null;
    }
    startLoop() {
      if (typeof requestAnimationFrame === "undefined") return;
      const tick = (timestamp) => {
        if (!this._isActive) return;
        const frameDelta = this._lastTimestamp > 0 ? timestamp - this._lastTimestamp : 16.67;
        this._lastTimestamp = timestamp;
        for (const [id, cb] of Array.from(this._callbacks.entries())) {
          try {
            cb(timestamp, frameDelta);
          } catch {
            this._callbacks.delete(id);
          }
        }
        if (this._isActive) {
          this._rafHandle = requestAnimationFrame(tick);
        }
      };
      this._rafHandle = requestAnimationFrame(tick);
    }
  };

  // chinese-aesthetic/render/camera-evaluator.ts
  var EPSILON = 1e-6;
  function evaluateCameraMatrices(inputs) {
    const { eye, target, up, fovYRad, aspect, near, far, viewportWidth, viewportHeight } = inputs;
    const scalars = [
      eye[0],
      eye[1],
      eye[2],
      target[0],
      target[1],
      target[2],
      up[0],
      up[1],
      up[2],
      fovYRad,
      aspect,
      near,
      far
    ];
    for (let i = 0; i < scalars.length; i++) {
      const val = scalars[i];
      if (val === void 0 || Number.isNaN(val) || !Number.isFinite(val)) {
        throw new Error("CAMERA_NUMERICAL_OVERFLOW: Scalar parameter contains NaN or Infinity.");
      }
    }
    const dx = eye[0] - target[0];
    const dy = eye[1] - target[1];
    const dz = eye[2] - target[2];
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq < EPSILON * EPSILON) {
      throw new Error("CAMERA_DEGENERATE_TARGET: Eye and target positions are coincident.");
    }
    const cx = up[1] * dz - up[2] * dy;
    const cy = up[2] * dx - up[0] * dz;
    const cz = up[0] * dy - up[1] * dx;
    const crossNormSq = cx * cx + cy * cy + cz * cz;
    if (crossNormSq < EPSILON * EPSILON) {
      throw new Error("CAMERA_COLLINEAR_UP: Up vector is collinear with observation ray.");
    }
    if (viewportWidth <= 0 || viewportHeight <= 0) {
      const identity = new Float32Array([
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1
      ]);
      return {
        kind: "ZERO_VIEWPORT",
        viewMatrix: identity,
        projectionMatrix: identity,
        viewProjectionMatrix: identity
      };
    }
    const dist = Math.sqrt(distSq);
    const zx = dx / dist;
    const zy = dy / dist;
    const zz = dz / dist;
    const crossNorm = Math.sqrt(crossNormSq);
    const xx = cx / crossNorm;
    const xy = cy / crossNorm;
    const xz = cz / crossNorm;
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    const tx = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    const ty = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    const tz = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    const viewMatrix = new Float32Array([
      xx,
      yx,
      zx,
      0,
      xy,
      yy,
      zy,
      0,
      xz,
      yz,
      zz,
      0,
      tx,
      ty,
      tz,
      1
    ]);
    const f = 1 / Math.tan(fovYRad / 2);
    const nf = 1 / (near - far);
    const projectionMatrix = new Float32Array([
      /* Col 0 */
      f / aspect,
      0,
      0,
      0,
      /* Col 1 */
      0,
      f,
      0,
      0,
      /* Col 2 */
      0,
      0,
      (far + near) * nf,
      -1,
      /* Col 3 */
      0,
      0,
      2 * far * near * nf,
      0
    ]);
    const viewProjectionMatrix = multiply4x4(projectionMatrix, viewMatrix);
    return {
      kind: "VALID",
      viewMatrix,
      projectionMatrix,
      viewProjectionMatrix
    };
  }
  function multiply4x4(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] = a[0 * 4 + r] * b[c * 4 + 0] + a[1 * 4 + r] * b[c * 4 + 1] + a[2 * 4 + r] * b[c * 4 + 2] + a[3 * 4 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }

  // chinese-aesthetic/render/gl-context-tracker.ts
  var GlContextTracker = class {
    constructor(gl, tier) {
      __publicField(this, "_buffers", /* @__PURE__ */ new Set());
      __publicField(this, "_textures", /* @__PURE__ */ new Set());
      __publicField(this, "_programs", /* @__PURE__ */ new Set());
      __publicField(this, "_gl", null);
      __publicField(this, "_tier", "WEBGL2");
      this._gl = gl;
      this._tier = tier;
    }
    get isClean() {
      return this._buffers.size === 0 && this._textures.size === 0 && this._programs.size === 0;
    }
    get activeBufferCount() {
      return this._buffers.size;
    }
    get activeTextureCount() {
      return this._textures.size;
    }
    get activeProgramCount() {
      return this._programs.size;
    }
    trackBuffer(buf) {
      this._buffers.add(buf);
    }
    trackTexture(tex) {
      this._textures.add(tex);
    }
    trackProgram(prog) {
      this._programs.add(prog);
    }
    /**
     * Applies the normative depth & rasterizer state registers (§7)
     */
    applyDepthAndRasterizerDefaults() {
      const gl = this._gl;
      if (!gl) return;
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.clearDepth(1);
      gl.frontFace(gl.CCW);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
    }
    /**
     * Applies polygon offset for near-coplanar batches (§7.2)
     */
    setPolygonOffsetEnabled(enabled) {
      const gl = this._gl;
      if (!gl) return;
      if (enabled) {
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(1, 1);
      } else {
        gl.disable(gl.POLYGON_OFFSET_FILL);
      }
    }
    /**
     * Unbinds all texture units and dispatch vertex arrays (§4.2)
     */
    unbindAllResources() {
      const gl = this._gl;
      if (!gl) return;
      if (this._tier === "WEBGL2") {
        gl.bindVertexArray(null);
      } else if (this._tier === "WEBGL1") {
        const ext = gl.getExtension("OES_vertex_array_object");
        if (ext) {
          ext.bindVertexArrayOES(null);
        } else {
          gl.bindBuffer(gl.ARRAY_BUFFER, null);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        }
      }
      const rawUnits = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
      const maxUnits = typeof rawUnits === "number" && Number.isFinite(rawUnits) ? Math.max(8, Math.min(rawUnits, 32)) : 8;
      for (let i = 0; i < maxUnits; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
      }
      gl.activeTexture(gl.TEXTURE0);
    }
    disposeAll() {
      const gl = this._gl;
      if (gl) {
        for (const b of this._buffers) {
          try {
            gl.deleteBuffer(b);
          } catch {
          }
        }
        for (const t of this._textures) {
          try {
            gl.deleteTexture(t);
          } catch {
          }
        }
        for (const p of this._programs) {
          try {
            gl.deleteProgram(p);
          } catch {
          }
        }
      }
      this._buffers.clear();
      this._textures.clear();
      this._programs.clear();
      this._gl = null;
    }
  };

  // chinese-aesthetic/render/shader-source.ts
  function encodeNdcToByte(ndc) {
    const clamped = Math.max(-1, Math.min(1, ndc));
    const normalized = (clamped + 1) * 0.5;
    return Math.floor(normalized * 255 + 0.5);
  }
  function decodeByteToNdc(byte) {
    const clamped = Math.max(0, Math.min(255, byte));
    return clamped / 255 * 2 - 1;
  }
  function encodeNdcToRgba(ndcX, ndcY) {
    return [encodeNdcToByte(ndcX), encodeNdcToByte(ndcY), 0, 255];
  }
  function decodeRgbaToNdc(r, g) {
    return [decodeByteToNdc(r), decodeByteToNdc(g)];
  }
  var NDC_DECODE_TOLERANCE = 2 / 255;
  function isNdcWithinTolerance(expected, actual) {
    return Math.abs(expected - actual) <= NDC_DECODE_TOLERANCE;
  }
  var NDC_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;

uniform mat4 uViewProjection;

out vec2 vNdc;

void main() {
  vec4 clip = uViewProjection * vec4(aPosition, 1.0);
  gl_Position = clip;
  gl_PointSize = 5.0;
  vNdc = clip.xy / clip.w;
}
`;
  var NDC_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vNdc;
out vec4 fragColor;

void main() {
  fragColor = vec4((vNdc.x + 1.0) * 0.5, (vNdc.y + 1.0) * 0.5, 0.0, 1.0);
}
`;
  var STANDARD_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aColor;

uniform mat4 uViewProjection;

out vec3 vColor;

void main() {
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
  vColor = aColor;
}
`;
  var STANDARD_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 vColor;
out vec4 fragColor;

void main() {
  fragColor = vec4(vColor, 1.0);
}
`;
  function compileShaderProgram(gl, vertexSource, fragmentSource) {
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    if (!vertexShader) {
      throw new Error("SHADER_CREATE_FAILED: Unable to create vertex shader object");
    }
    gl.shaderSource(vertexShader, vertexSource);
    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(vertexShader) ?? "unknown";
      gl.deleteShader(vertexShader);
      throw new Error(`VERTEX_SHADER_COMPILE_FAILED: ${log}`);
    }
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fragmentShader) {
      gl.deleteShader(vertexShader);
      throw new Error("SHADER_CREATE_FAILED: Unable to create fragment shader object");
    }
    gl.shaderSource(fragmentShader, fragmentSource);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(fragmentShader) ?? "unknown";
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      throw new Error(`FRAGMENT_SHADER_COMPILE_FAILED: ${log}`);
    }
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      throw new Error("PROGRAM_CREATE_FAILED: Unable to create program object");
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const linkStatus = gl.getProgramParameter(program, gl.LINK_STATUS);
    const infoLog = gl.getProgramInfoLog(program) ?? "";
    if (!linkStatus) {
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      throw new Error(`PROGRAM_LINK_FAILED: ${infoLog}`);
    }
    return { program, vertexShader, fragmentShader, linkStatus, infoLog };
  }
  function disposeShaderProgram(gl, result) {
    gl.deleteProgram(result.program);
    gl.deleteShader(result.vertexShader);
    gl.deleteShader(result.fragmentShader);
  }

  // chinese-aesthetic/render/geometry-builder.ts
  var NEAR_CLIP_TEST_FOV_Y_RAD = Math.PI / 2;
  var NEAR_CLIP_TEST_ASPECT = 1;
  var NEAR_CLIP_TEST_NEAR = 1;
  var NEAR_CLIP_TEST_FAR = 10;
  function cameraSpaceToClipSpace(x, y, z, fovYRad = NEAR_CLIP_TEST_FOV_Y_RAD, aspect = NEAR_CLIP_TEST_ASPECT, near = NEAR_CLIP_TEST_NEAR, far = NEAR_CLIP_TEST_FAR) {
    const t = near * Math.tan(fovYRad / 2);
    const r = t * aspect;
    const nOverR = near / r;
    const nOverT = near / t;
    const zScale = -(far + near) / (far - near);
    const zTranslate = -2 * far * near / (far - near);
    const xc = nOverR * x;
    const yc = nOverT * y;
    const zc = zScale * z + zTranslate;
    const wc = -z;
    return [xc, yc, zc, wc];
  }
  function classifyClipVertex(xc, yc, zc, wc) {
    const outside = [];
    if (xc < -wc) outside.push("LEFT");
    if (xc > wc) outside.push("RIGHT");
    if (yc < -wc) outside.push("BOTTOM");
    if (yc > wc) outside.push("TOP");
    if (zc < -wc) outside.push("NEAR");
    if (zc > wc) outside.push("FAR");
    return { visible: outside.length === 0, outsidePlanes: outside };
  }
  var NDC_TEST_VERTICES = [
    { x: 0, y: 0, z: 0, r: 1, g: 0, b: 0 },
    // V1: red
    { x: 1, y: 0, z: 0, r: 0, g: 1, b: 0 },
    // V2: green
    { x: 0, y: 1, z: 0, r: 0, g: 0, b: 1 }
    // V3: blue
  ];
  var NDC_TEST_MESH = {
    id: "ndc-verification-points",
    coordinateSpace: "world",
    vertices: NDC_TEST_VERTICES,
    indices: [],
    // Empty → drawArrays(POINTS); PLAN-02 §1.1 requires point primitives to avoid triangle interpolation masking per-vertex errors
    primitiveType: "points",
    description: "Three world-space vertices rendered as POINTS for NDC per-vertex verification"
  };
  var NEAR_CLIP_PARTIAL_TRIANGLE = {
    id: "near-clip-partial-visible",
    coordinateSpace: "camera",
    vertices: [
      { x: -0.5, y: -0.5, z: -0.5, r: 1, g: 0.3, b: 0.3 },
      // A: culled (near plane)
      { x: 0.5, y: -0.5, z: -2, r: 0.3, g: 1, b: 0.3 },
      // B: visible
      { x: 0, y: 0.5, z: -2, r: 0.3, g: 0.3, b: 1 }
      // C: visible
    ],
    indices: [0, 1, 2],
    primitiveType: "triangles",
    description: "Camera-space triangle crossing near plane: A culled (zc<-wc), B/C visible. Hardware clipping expected."
  };
  var NEAR_CLIP_FULLY_INVISIBLE_TRIANGLE = {
    id: "near-clip-fully-invisible",
    coordinateSpace: "camera",
    vertices: [
      { x: -0.5, y: -0.5, z: 0.5, r: 0.5, g: 0.5, b: 0.5 },
      { x: 0.5, y: -0.5, z: 0.5, r: 0.5, g: 0.5, b: 0.5 },
      { x: 0, y: 0.5, z: 0.5, r: 0.5, g: 0.5, b: 0.5 }
    ],
    indices: [0, 1, 2],
    primitiveType: "triangles",
    description: "Camera-space triangle entirely behind camera (z>0). Expected fully clipped, 0 fragments."
  };
  var GOLDEN_FRAME_TRIANGLE = {
    id: "golden-frame-reference",
    coordinateSpace: "camera",
    vertices: [
      { x: 0, y: 0.8, z: 0, r: 0.9, g: 0.2, b: 0.2 },
      // top: red
      { x: -0.8, y: -0.6, z: 0, r: 0.2, g: 0.8, b: 0.2 },
      // bottom-left: green
      { x: 0.8, y: -0.6, z: 0, r: 0.2, g: 0.2, b: 0.8 }
      // bottom-right: blue
    ],
    indices: [0, 1, 2],
    primitiveType: "triangles",
    description: "Camera-space reference triangle for golden frame. Centered at origin, RGB vertices."
  };
  function buildInterleavedVertexBuffer(mesh) {
    const buffer = new Float32Array(mesh.vertices.length * 6);
    for (let i = 0; i < mesh.vertices.length; i++) {
      const v = mesh.vertices[i];
      if (!v) continue;
      buffer[i * 6 + 0] = v.x;
      buffer[i * 6 + 1] = v.y;
      buffer[i * 6 + 2] = v.z;
      buffer[i * 6 + 3] = v.r;
      buffer[i * 6 + 4] = v.g;
      buffer[i * 6 + 5] = v.b;
    }
    return buffer;
  }
  function buildIndexBuffer(mesh) {
    return new Uint16Array(mesh.indices);
  }
  var PARTIAL_TRIANGLE_CLIP_SPACE = [
    {
      vertex: "A",
      cameraSpace: [-0.5, -0.5, -0.5],
      clipSpace: [-0.5, -0.5, -14.5 / 9, 0.5],
      // zc ≈ -1.611, wc = 0.5
      classification: "CULLED_BY_NEAR_PLANE (zc < -wc: -1.611 < -0.5). NOTE: wc > 0."
    },
    {
      vertex: "B",
      cameraSpace: [0.5, -0.5, -2],
      clipSpace: [0.5, -0.5, 2 / 9, 2],
      // zc ≈ 0.222, wc = 2.0
      classification: "VISIBLE (all |coords| <= wc: 0.5 <= 2.0, 0.222 <= 2.0)"
    },
    {
      vertex: "C",
      cameraSpace: [0, 0.5, -2],
      clipSpace: [0, 0.5, 2 / 9, 2],
      // zc ≈ 0.222, wc = 2.0
      classification: "VISIBLE (all |coords| <= wc: 0.5 <= 2.0, 0.222 <= 2.0)"
    }
  ];

  // chinese-aesthetic/render/gl-pipeline.ts
  var GlPipeline = class {
    constructor(config) {
      __publicField(this, "_canvas");
      __publicField(this, "_ladder");
      __publicField(this, "_power");
      __publicField(this, "_dispatcher");
      __publicField(this, "_contextTracker", null);
      __publicField(this, "_gl", null);
      __publicField(this, "_lastEvaluatedCamera", null);
      __publicField(this, "_isDisposed", false);
      // ─── Shader & Geometry State (PLAN-02 upgrade) ───
      __publicField(this, "_ndcProgram", null);
      __publicField(this, "_standardProgram", null);
      __publicField(this, "_currentRenderMode", "standard");
      __publicField(this, "_currentMesh", null);
      __publicField(this, "_vao", null);
      __publicField(this, "_vbo", null);
      __publicField(this, "_ibo", null);
      __publicField(this, "_meshVertexCount", 0);
      __publicField(this, "_meshIndexCount", 0);
      __publicField(this, "_uViewProjectionLocation", null);
      this._canvas = config.canvas;
      this._ladder = new DegradationLadder(config.initialTier ?? "WEBGL2");
      this._dispatcher = config.dispatcher ?? new RafDispatcher();
      this._power = new PowerManager(this._ladder.currentTier, this._dispatcher);
      this.initializeContext();
    }
    get powerSnapshot() {
      return this._power.snapshot;
    }
    get currentTier() {
      return this._ladder.currentTier;
    }
    get lastEvaluatedCamera() {
      return this._lastEvaluatedCamera;
    }
    get glContext() {
      return this._gl;
    }
    initializeContext() {
      if (this._ladder.currentTier === "DOM_NEUTRAL" || this._ladder.currentTier === "STATIC") {
        return;
      }
      const attrs = {
        alpha: true,
        depth: true,
        stencil: false,
        antialias: false,
        premultipliedAlpha: false
      };
      if (this._ladder.currentTier === "WEBGL2") {
        this._gl = this._canvas.getContext("webgl2", attrs);
        if (!this._gl) {
          this._ladder.degradeSessionCap("WEBGL1");
        }
      }
      if (!this._gl && this._ladder.currentTier === "WEBGL1") {
        this._gl = this._canvas.getContext("webgl", attrs) || this._canvas.getContext("experimental-webgl", attrs);
        if (!this._gl) {
          this._ladder.degradeSessionCap("STATIC");
        }
      }
      if (this._gl) {
        this._contextTracker = new GlContextTracker(this._gl, this._ladder.currentTier);
        this._contextTracker.applyDepthAndRasterizerDefaults();
      }
    }
    dispatchInput(input) {
      this._power.transition(input);
    }
    updateCamera(inputs) {
      const evaluated = evaluateCameraMatrices(inputs);
      this._lastEvaluatedCamera = evaluated;
      return evaluated;
    }
    // ─── PLAN-02: Render Mode & Mesh Configuration ───
    /**
     * Set the shader render mode.
     * 'ndc-encode': outputs NDC coordinates encoded to RGBA (for camera-matrix verification).
     * 'standard': outputs interpolated vertex color (for golden frame & clipping tests).
     */
    setRenderMode(mode) {
      if (this._currentRenderMode !== mode) {
        this._currentRenderMode = mode;
        this._uViewProjectionLocation = null;
      }
    }
    /**
     * Set the mesh to render. Uploads vertex data to GPU (VBO) and creates VAO.
     * Call before renderFrame() to specify what to draw.
     */
    setRenderMesh(mesh) {
      this._currentMesh = mesh;
      this.uploadMeshToGpu(mesh);
    }
    uploadMeshToGpu(mesh) {
      const gl = this._gl;
      if (!gl) return;
      if (!this._vao) {
        this._vao = gl.createVertexArray();
      }
      if (!this._vao) return;
      gl.bindVertexArray(this._vao);
      const vertexData = buildInterleavedVertexBuffer(mesh);
      if (!this._vbo) {
        this._vbo = gl.createBuffer();
      }
      if (!this._vbo) {
        gl.bindVertexArray(null);
        return;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
      gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);
      this._meshVertexCount = mesh.vertices.length;
      const stride = 6 * 4;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);
      if (mesh.indices.length > 0) {
        const indexData = buildIndexBuffer(mesh);
        if (!this._ibo) {
          this._ibo = gl.createBuffer();
        }
        if (this._ibo) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._ibo);
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW);
          this._meshIndexCount = mesh.indices.length;
        }
      } else {
        this._meshIndexCount = 0;
        if (this._ibo) {
          gl.deleteBuffer(this._ibo);
          this._ibo = null;
        }
      }
      gl.bindVertexArray(null);
    }
    ensureShaderProgram() {
      const gl = this._gl;
      if (!gl) return null;
      if (this._currentRenderMode === "ndc-encode") {
        if (!this._ndcProgram) {
          this._ndcProgram = compileShaderProgram(gl, NDC_VERTEX_SHADER, NDC_FRAGMENT_SHADER);
        }
        return this._ndcProgram;
      } else {
        if (!this._standardProgram) {
          this._standardProgram = compileShaderProgram(gl, STANDARD_VERTEX_SHADER, STANDARD_FRAGMENT_SHADER);
        }
        return this._standardProgram;
      }
    }
    // ─── PLAN-02: Upgraded renderFrame with real draw call ───
    renderFrame() {
      if (this._power.state !== "ACTIVE") {
        return;
      }
      const gl = this._gl;
      if (!gl || !this._contextTracker) {
        return;
      }
      const dpr = typeof window !== "undefined" ? Math.min(Math.max(window.devicePixelRatio || 1, 1), 2) : 1;
      const physicalWidth = Math.max(1, Math.round(this._canvas.clientWidth * dpr));
      const physicalHeight = Math.max(1, Math.round(this._canvas.clientHeight * dpr));
      if (this._canvas.width !== physicalWidth || this._canvas.height !== physicalHeight) {
        this._canvas.width = physicalWidth;
        this._canvas.height = physicalHeight;
      }
      gl.viewport(0, 0, physicalWidth, physicalHeight);
      gl.clearColor(0.05, 0.1, 0.15, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!this._currentMesh || !this._vao) {
        this._contextTracker.unbindAllResources();
        return;
      }
      const programResult = this.ensureShaderProgram();
      if (!programResult) {
        this._contextTracker.unbindAllResources();
        return;
      }
      gl.useProgram(programResult.program);
      if (!this._uViewProjectionLocation) {
        this._uViewProjectionLocation = gl.getUniformLocation(programResult.program, "uViewProjection");
      }
      if (this._uViewProjectionLocation && this._lastEvaluatedCamera) {
        gl.uniformMatrix4fv(
          this._uViewProjectionLocation,
          false,
          this._lastEvaluatedCamera.viewProjectionMatrix
        );
      }
      gl.bindVertexArray(this._vao);
      if (this._meshIndexCount > 0) {
        gl.drawElements(gl.TRIANGLES, this._meshIndexCount, gl.UNSIGNED_SHORT, 0);
      } else {
        const primitive = this._currentMesh.primitiveType === "points" ? gl.POINTS : gl.TRIANGLES;
        gl.drawArrays(primitive, 0, this._meshVertexCount);
      }
      gl.bindVertexArray(null);
      this._contextTracker.unbindAllResources();
    }
    /**
     * Read pixels from the current framebuffer.
     * Must be called after renderFrame().
     * Returns RGBA8 pixel data.
     */
    readFramePixels(x = 0, y = 0, width, height) {
      const gl = this._gl;
      if (!gl) return null;
      const w = width ?? this._canvas.width;
      const h = height ?? this._canvas.height;
      const data = new Uint8Array(w * h * 4);
      gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return { data, width: w, height: h };
    }
    // ─── Lifecycle ───
    dispose() {
      if (this._isDisposed) return;
      this._isDisposed = true;
      this._power.transition("DISPOSE");
      const gl = this._gl;
      if (gl) {
        if (this._ndcProgram) {
          disposeShaderProgram(gl, this._ndcProgram);
          this._ndcProgram = null;
        }
        if (this._standardProgram) {
          disposeShaderProgram(gl, this._standardProgram);
          this._standardProgram = null;
        }
        if (this._vao) {
          gl.deleteVertexArray(this._vao);
          this._vao = null;
        }
        if (this._vbo) {
          gl.deleteBuffer(this._vbo);
          this._vbo = null;
        }
        if (this._ibo) {
          gl.deleteBuffer(this._ibo);
          this._ibo = null;
        }
      }
      if (this._contextTracker) {
        this._contextTracker.disposeAll();
        this._contextTracker = null;
      }
      this._gl = null;
    }
  };
  return __toCommonJS(browser_entry_exports);
})();
