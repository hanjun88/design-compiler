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
    GlContextTracker: () => GlContextTracker,
    PowerManager: () => PowerManager,
    RAF_DISPATCHER_KEY: () => RAF_DISPATCHER_KEY,
    RafDispatcher: () => RafDispatcher,
    TIER_ORDER: () => TIER_ORDER,
    capTierToSession: () => capTierToSession,
    evaluateCameraMatrices: () => evaluateCameraMatrices,
    getGlobalDispatcher: () => getGlobalDispatcher,
    installGlobalDispatcher: () => installGlobalDispatcher
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
  return __toCommonJS(browser_entry_exports);
})();
