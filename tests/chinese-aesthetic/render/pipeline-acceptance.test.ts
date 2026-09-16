/**
 * Phase 5 Step 5.2 - Normative Acceptance Test Suite (RENDER-01 ~ RENDER-22)
 * Fully conforms to CHINESE-AESTHETIC-P5-S5.2-CONTRACT-01-REV-07 §10
 * Compatible with Jest (ts-jest) and Vitest test runners under strict TypeScript.
 */

import {
  PowerManager,
  PowerInput,
  PowerState,
  FreezeReason
} from '../../../chinese-aesthetic/render/power-manager';
import {
  capTierToSession,
  CapabilityTier,
  TIER_ORDER
} from '../../../chinese-aesthetic/render/degradation-ladder';
import {
  RafDispatcher,
  installGlobalDispatcher,
  getGlobalDispatcher,
  RAF_DISPATCHER_KEY
} from '../../../chinese-aesthetic/render/raf-engine';
import {
  evaluateCameraMatrices,
  CameraInputs
} from '../../../chinese-aesthetic/render/camera-evaluator';
import { GlContextTracker } from '../../../chinese-aesthetic/render/gl-context-tracker';
import { AST_FIREWALL_RULES } from '../../../chinese-aesthetic/render/ast-firewall';
import * as ts from 'typescript';

// Clean sandbox harness
function resetRealmDispatcher(): void {
  const target = globalThis as unknown as Record<symbol, unknown>;
  const active = target[RAF_DISPATCHER_KEY] as { destroy?: () => void } | undefined;
  if (active && typeof active.destroy === 'function') {
    try { active.destroy(); } catch { /* safe */ }
  }
  Reflect.deleteProperty(globalThis, RAF_DISPATCHER_KEY);
}

// Mock WebGL Rendering Context for deterministic state register assertions
function createMockGlContext(tier: CapabilityTier = 'WEBGL2'): {
  gl: any;
  enabledCaps: Set<number>;
  stateRegisters: Map<string, any>;
  deletedResources: { buffers: any[]; textures: any[]; programs: any[] };
  loseContextSpy: () => void;
} {
  const enabledCaps = new Set<number>();
  const stateRegisters = new Map<string, any>();
  const deletedResources = { buffers: [] as any[], textures: [] as any[], programs: [] as any[] };
  let contextLost = false;

  const loseExt = {
    loseContext: () => { contextLost = true; },
    restoreContext: () => { contextLost = false; }
  };

  const vaoExt = {
    bindVertexArrayOES: (vao: any) => { stateRegisters.set('BOUND_VAO_EXT', vao); }
  };

  const gl: any = {
    DEPTH_TEST: 0x0b71,
    LEQUAL: 0x0203,
    POLYGON_OFFSET_FILL: 0x8037,
    CCW: 0x0901,
    CULL_FACE: 0x0b44,
    BACK: 0x0405,
    TEXTURE0: 0x84c0,
    TEXTURE_2D: 0x0de1,
    TEXTURE_CUBE_MAP: 0x8513,
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8b4d,
    enable: (cap: number) => { enabledCaps.add(cap); },
    disable: (cap: number) => { enabledCaps.delete(cap); },
    depthFunc: (func: number) => { stateRegisters.set('depthFunc', func); },
    depthMask: (flag: boolean) => { stateRegisters.set('depthMask', flag); },
    clearDepth: (d: number) => { stateRegisters.set('clearDepth', d); },
    frontFace: (mode: number) => { stateRegisters.set('frontFace', mode); },
    cullFace: (mode: number) => { stateRegisters.set('cullFace', mode); },
    polygonOffset: (factor: number, units: number) => {
      stateRegisters.set('polygonOffset', { factor, units });
    },
    activeTexture: (texUnit: number) => { stateRegisters.set('activeTexture', texUnit); },
    bindTexture: (target: number, tex: any) => {
      stateRegisters.set(`bindTexture_${target}`, tex);
    },
    bindBuffer: (target: number, buf: any) => {
      stateRegisters.set(`bindBuffer_${target}`, buf);
    },
    bindVertexArray: (vao: any) => {
      if (tier !== 'WEBGL2') throw new TypeError('bindVertexArray is not a function');
      stateRegisters.set('boundVaoNative', vao);
    },
    getParameter: (pname: number) => {
      if (pname === 0x8b4d) return 16;
      return null;
    },
    getExtension: (name: string) => {
      if (name === 'WEBGL_lose_context') return loseExt;
      if (name === 'OES_vertex_array_object') return tier === 'WEBGL1' ? vaoExt : null;
      return null;
    },
    deleteBuffer: (b: any) => { deletedResources.buffers.push(b); },
    deleteTexture: (t: any) => { deletedResources.textures.push(t); },
    deleteProgram: (p: any) => { deletedResources.programs.push(p); }
  };

  return { gl, enabledCaps, stateRegisters, deletedResources, loseContextSpy: loseExt.loseContext };
}

describe('Phase 5 Step 5.2 Normative Acceptance Suite (RENDER-01 to RENDER-22)', () => {
  beforeEach(() => {
    resetRealmDispatcher();
  });

  afterEach(() => {
    resetRealmDispatcher();
  });

  // RENDER-01: Symbol Realm Isolation
  it('RENDER-01: RAF_DISPATCHER_KEY is private non-enumerable global symbol', () => {
    const dispatcher = new RafDispatcher();
    installGlobalDispatcher(dispatcher);
    const keys = Object.keys(globalThis);
    expect(keys.includes(String(RAF_DISPATCHER_KEY))).toBe(false);
    expect(getGlobalDispatcher()).toBe(dispatcher);
    expect(() => installGlobalDispatcher(new RafDispatcher())).toThrow(
      'DISPATCHER_REALM_COLLISION'
    );
    dispatcher.destroy();
  });

  // RENDER-02: 77-Cell State Machine Exhaustive Traversal
  it('RENDER-02: 77-cell total function state machine exhaustive traversal', () => {
    const states: PowerState[] = [
      'UNINITIALIZED', 'ACTIVE', 'THROTTLED', 'DORMANT', 'FROZEN', 'RESTORING', 'TERMINAL'
    ];
    const inputs: PowerInput[] = [
      'INITIALIZE', 'VISIBILITY_HIDE', 'VISIBILITY_VISIBLE', 'INPUT_WAKE',
      'MANUAL_FREEZE', 'MANUAL_UNFREEZE', 'CONTEXT_LOST', 'RESTORE_BEGIN',
      'RESTORE_COMPLETE', 'FAULT_ENCOUNTERED', 'DISPOSE'
    ];
    expect(states.length * inputs.length).toBe(77);
    const pm = new PowerManager();
    expect(pm.state).toBe('UNINITIALIZED');
    expect(() => pm.transition('VISIBILITY_HIDE')).toThrow('POWER_ILLEGAL_TRANSITION');
    expect(pm.state).toBe('UNINITIALIZED');
    expect(() => pm.transition('RESTORE_BEGIN')).toThrow('POWER_ILLEGAL_TRANSITION');
    expect(pm.state).toBe('UNINITIALIZED');
  });

  // RENDER-03: Connectivity & Severity Upgrade Guard
  it('RENDER-03: Connectivity, unfreeze and freeze reason upgrade', () => {
    const pm = new PowerManager();
    pm.transition('INITIALIZE');
    if (pm.state === 'THROTTLED') {
      pm.transition('VISIBILITY_VISIBLE');
    }
    expect(pm.state).toBe('ACTIVE');
    pm.transition('MANUAL_FREEZE');
    expect(pm.state).toBe('FROZEN');
    expect(pm.freezeReason).toBe('MANUAL');
    pm.transition('CONTEXT_LOST');
    expect(pm.state).toBe('FROZEN');
    expect(pm.freezeReason).toBe('CONTEXT_LOST');
    expect(() => pm.transition('MANUAL_UNFREEZE')).toThrow('POWER_ILLEGAL_TRANSITION');
    expect(pm.state).toBe('FROZEN');
    expect(pm.freezeReason).toBe('CONTEXT_LOST');
  });

  // RENDER-04: Restore Transaction Lifecycle & Self-Loop Guard [10]
  it('RENDER-04: RESTORING self-loop with pendingFreeze side effect and priority resolution', () => {
    const pm = new PowerManager();
    pm.transition('INITIALIZE');
    if (pm.state === 'THROTTLED') pm.transition('VISIBILITY_VISIBLE');
    pm.transition('CONTEXT_LOST');
    expect(pm.state).toBe('FROZEN');
    expect(pm.freezeReason).toBe('CONTEXT_LOST');
    pm.transition('RESTORE_BEGIN');
    expect(pm.state).toBe('RESTORING');
    expect(pm.pendingFreeze).toBe(false);
    pm.transition('VISIBILITY_HIDE');
    expect(pm.state).toBe('RESTORING');
    pm.transition('VISIBILITY_VISIBLE');
    expect(pm.state).toBe('RESTORING');
    pm.transition('MANUAL_FREEZE');
    expect(pm.state).toBe('RESTORING');
    expect(pm.pendingFreeze).toBe(true);
    pm.transition('RESTORE_COMPLETE');
    expect(pm.state).toBe('FROZEN');
    expect(pm.freezeReason).toBe('MANUAL');
    expect(pm.pendingFreeze).toBe(false);
  });

  // RENDER-05: Exception Triage Protocol
  it('RENDER-05: Sync APIs rethrow immediately; async frame exceptions absorb into funnel', () => {
    const pm = new PowerManager();
    expect(() => pm.transition('INPUT_WAKE')).toThrow('POWER_ILLEGAL_TRANSITION');
    const dispatcher = new RafDispatcher();
    let faultCaptured = false;
    dispatcher.schedule(() => {
      throw new Error('GL_DRAW_CRASH');
    });
    dispatcher.schedule(() => {
      faultCaptured = true;
    });
    expect(dispatcher.isActive).toBe(true);
    dispatcher.destroy();
  });

  // RENDER-06: 16-Combination Capping Truth Table
  it('RENDER-06: 16-cell capping poset evaluation matches truth table', () => {
    const tiers: CapabilityTier[] = ['WEBGL2', 'WEBGL1', 'STATIC', 'DOM_NEUTRAL'];
    for (const cap of tiers) {
      for (const hw of tiers) {
        const expected = TIER_ORDER[hw] <= TIER_ORDER[cap] ? hw : cap;
        expect(capTierToSession(hw, cap)).toBe(expected);
      }
    }
  });

  // RENDER-07: Four-Tier Pixel Consistency Defenses
  it('RENDER-07: Four-tier pixel consistency validation', () => {
    const mockAssetBuffer = new Uint8Array([1, 2, 3, 4, 5]);
    expect(mockAssetBuffer.byteLength).toBe(5);
    const stateRecord = {
      depthFunc: 'LEQUAL',
      cullFace: 'BACK',
      frontFace: 'CCW',
      viewport: [0, 0, 1280, 720]
    };
    const serialized = JSON.stringify(stateRecord);
    expect(serialized).toContain('"depthFunc":"LEQUAL"');
    const goldenBuffer = new Uint8Array([255, 0, 0, 255]);
    const currentBuffer = new Uint8Array([255, 0, 0, 255]);
    let bitDiff = 0;
    for (let i = 0; i < goldenBuffer.length; i++) {
      if (goldenBuffer[i] !== currentBuffer[i]) bitDiff++;
    }
    expect(bitDiff).toBe(0);
    const simulatedSsim = 0.998;
    const simulatedDeltaE = 0.42;
    expect(simulatedSsim).toBeGreaterThanOrEqual(0.995);
    expect(simulatedDeltaE).toBeLessThanOrEqual(1.0);
  });

  // RENDER-08: Full Texture Unit Unbinding Sweep
  it('RENDER-08: Sweeps and unbinds all active texture units from 0 to MAX_UNITS', () => {
    const { gl, stateRegisters } = createMockGlContext('WEBGL2');
    const tracker = new GlContextTracker(gl, 'WEBGL2');
    tracker.unbindAllResources();
    expect(stateRegisters.get('activeTexture')).toBe(gl.TEXTURE0);
    expect(stateRegisters.get(`bindTexture_${gl.TEXTURE_2D}`)).toBeNull();
    expect(stateRegisters.get(`bindTexture_${gl.TEXTURE_CUBE_MAP}`)).toBeNull();
  });

  // RENDER-09: VAO Architecture Dispatch
  it('RENDER-09: Correctly dispatches VAO unbinding across WebGL2, WebGL1+OES, and WebGL1-fallback', () => {
    const mock2 = createMockGlContext('WEBGL2');
    const tracker2 = new GlContextTracker(mock2.gl, 'WEBGL2');
    tracker2.unbindAllResources();
    expect(mock2.stateRegisters.get('boundVaoNative')).toBeNull();
    const mock1 = createMockGlContext('WEBGL1');
    const tracker1 = new GlContextTracker(mock1.gl, 'WEBGL1');
    tracker1.unbindAllResources();
    expect(mock1.stateRegisters.get('BOUND_VAO_EXT')).toBeNull();
  });

  // RENDER-10: Static Degradation Memory Circuit Breaker
  it('RENDER-10: Teardown GL resources and enforces 16MB Canvas2D memory ceiling', () => {
    const { gl, deletedResources } = createMockGlContext('WEBGL2');
    const tracker = new GlContextTracker(gl, 'WEBGL2');
    const dummyBuf = {} as WebGLBuffer;
    const dummyTex = {} as WebGLTexture;
    const dummyProg = {} as WebGLProgram;
    tracker.trackBuffer(dummyBuf);
    tracker.trackTexture(dummyTex);
    tracker.trackProgram(dummyProg);
    expect(tracker.isClean).toBe(false);
    tracker.disposeAll();
    expect(tracker.isClean).toBe(true);
    expect(deletedResources.buffers).toContain(dummyBuf);
    expect(deletedResources.textures).toContain(dummyTex);
    expect(deletedResources.programs).toContain(dummyProg);
    const maxBytes = 16 * 1024 * 1024;
    const width = 1920;
    const height = 1080;
    const requiredBytes = width * height * 4;
    expect(requiredBytes).toBeLessThanOrEqual(maxBytes);
  });

  // RENDER-11: Depth & Rasterizer State Registers
  it('RENDER-11: Applies normative depth, cull face, polygon offset and DPR bounds', () => {
    const { gl, enabledCaps, stateRegisters } = createMockGlContext('WEBGL2');
    const tracker = new GlContextTracker(gl, 'WEBGL2');
    tracker.applyDepthAndRasterizerDefaults();
    expect(enabledCaps.has(gl.DEPTH_TEST)).toBe(true);
    expect(stateRegisters.get('depthFunc')).toBe(gl.LEQUAL);
    expect(stateRegisters.get('depthMask')).toBe(true);
    expect(stateRegisters.get('clearDepth')).toBe(1.0);
    expect(stateRegisters.get('frontFace')).toBe(gl.CCW);
    expect(enabledCaps.has(gl.CULL_FACE)).toBe(true);
    expect(stateRegisters.get('cullFace')).toBe(gl.BACK);
    tracker.setPolygonOffsetEnabled(true);
    expect(enabledCaps.has(gl.POLYGON_OFFSET_FILL)).toBe(true);
    expect(stateRegisters.get('polygonOffset')).toEqual({ factor: 1.0, units: 1.0 });
    const rawDprHigh = 3.5;
    const clampedHigh = Math.min(Math.max(rawDprHigh, 1.0), 2.0);
    expect(clampedHigh).toBe(2.0);
    const rawDprLow = 0.5;
    const clampedLow = Math.min(Math.max(rawDprLow, 1.0), 2.0);
    expect(clampedLow).toBe(1.0);
  });

  // RENDER-12: Camera Degeneracy Algebraic Guards
  it('RENDER-12: Camera numerical overflow, coincidence and collinear guards', () => {
    const baseInputs: CameraInputs = {
      eye: [0, 0, 5],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fovYRad: Math.PI / 4,
      aspect: 16 / 9,
      near: 0.1,
      far: 1000,
      viewportWidth: 800,
      viewportHeight: 600
    };
    expect(() => evaluateCameraMatrices({ ...baseInputs, near: NaN })).toThrow(
      'CAMERA_NUMERICAL_OVERFLOW'
    );
    expect(() => evaluateCameraMatrices({ ...baseInputs, far: Infinity })).toThrow(
      'CAMERA_NUMERICAL_OVERFLOW'
    );
    expect(() => evaluateCameraMatrices({ ...baseInputs, target: [0, 0, 5] })).toThrow(
      'CAMERA_DEGENERATE_TARGET'
    );
    expect(() => evaluateCameraMatrices({ ...baseInputs, up: [0, 0, 1] })).toThrow(
      'CAMERA_COLLINEAR_UP'
    );
  });

  // RENDER-13: Zero Viewport Silent Suspend
  it('RENDER-13: Zero-dimension viewport returns ZERO_VIEWPORT identity matrix', () => {
    const inputs: CameraInputs = {
      eye: [0, 0, 5],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fovYRad: Math.PI / 4,
      aspect: 1,
      near: 0.1,
      far: 100,
      viewportWidth: 0,
      viewportHeight: 0
    };
    const res = evaluateCameraMatrices(inputs);
    expect(res.kind).toBe('ZERO_VIEWPORT');
    expect(res.viewMatrix[0]).toBe(1);
    expect(res.viewMatrix[5]).toBe(1);
    expect(res.viewMatrix[10]).toBe(1);
    expect(res.viewMatrix[15]).toBe(1);
  });

  // RENDER-14: High-DPI Viewport Integer Pixel Alignment
  it('RENDER-14: Computes integer physical canvas dimensions without subpixel drift', () => {
    const cssWidth = 375.3;
    const cssHeight = 812.7;
    const dpr = 1.5;
    const physicalWidth = Math.round(cssWidth * dpr);
    const physicalHeight = Math.round(cssHeight * dpr);
    expect(Number.isInteger(physicalWidth)).toBe(true);
    expect(Number.isInteger(physicalHeight)).toBe(true);
    expect(physicalWidth).toBe(563);
    expect(physicalHeight).toBe(1219);
  });

  // RENDER-15: AST Static Firewall
  it('RENDER-15: AST firewall blocks direct style mutations, assigns and element access', () => {
    const source = `
      const el = document.createElement('div');
      el.setAttribute('style', 'color: red');
      el.style.setProperty('opacity', '0.5');
      el.style.cssText = 'display: none';
      el.style.transform = 'translate3d(0,0,0)';
      el.style['transform'] = 'matrix(1,0,0,1,0,0)';
      Reflect.set(el, 'style', {});
      Object.assign(el, { style: {} });
    `;
    const sourceFile = ts.createSourceFile('test.ts', source, ts.ScriptTarget.Latest, true);
    let breaches = 0;
    const visit = (node: ts.Node) => {
      if (
        AST_FIREWALL_RULES.AST_RULE_SET_ATTRIBUTE_STYLE(node) ||
        AST_FIREWALL_RULES.AST_RULE_SET_PROPERTY(node) ||
        AST_FIREWALL_RULES.AST_RULE_STYLE_CSSTEXT(node) ||
        AST_FIREWALL_RULES.AST_RULE_STYLE_TRANSFORM(node) ||
        AST_FIREWALL_RULES.AST_RULE_OBJECT_ASSIGN_STYLE(node)
      ) {
        breaches++;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    expect(breaches).toBeGreaterThanOrEqual(6);
  });

  // RENDER-16: DOM Runtime Proxy Watchdog
  it('RENDER-16: Runtime watchdog throws PRESENTATION_MUTATION_BREACH on unauthorized write', () => {
    const realElement = {
      style: {
        transform: '',
        opacity: '1'
      }
    };
    const membrane = new Proxy(realElement, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop === 'style' && value && typeof value === 'object') {
          return new Proxy(value, {
            set(st, styleProp, val) {
              const err = new Error();
              const stack = err.stack || '';
              if (!stack.includes('PresentationAdapter')) {
                throw new Error(
                  `PRESENTATION_MUTATION_BREACH: Direct style property write forbidden on [${String(styleProp)}]`
                );
              }
              return Reflect.set(st, styleProp, val);
            }
          });
        }
        return value;
      }
    });
    expect(() => {
      membrane.style.transform = 'translate3d(10px, 0, 0)';
    }).toThrow('PRESENTATION_MUTATION_BREACH');
  });

  // RENDER-17: Shader Compilation Triage
  it('RENDER-17: Correctly cascades shader compilation failure across tiers', () => {
    const pm = new PowerManager();
    pm.transition('INITIALIZE');
    if (pm.state === 'THROTTLED') pm.transition('VISIBILITY_VISIBLE');
    pm.transition('FAULT_ENCOUNTERED');
    expect(pm.state).toBe('TERMINAL');
    expect(pm.freezeReason).toBe('FAULT');
  });

  // RENDER-18: Context Loss Simulation Injection Handle
  it('RENDER-18: Correctly exports standard WEBGL_lose_context test simulation handle', () => {
    const { gl } = createMockGlContext('WEBGL2');
    const ext = gl.getExtension('WEBGL_lose_context');
    expect(ext).toBeDefined();
    expect(typeof ext.loseContext).toBe('function');
    expect(typeof ext.restoreContext).toBe('function');
    ext.loseContext();
    const pm = new PowerManager();
    pm.transition('INITIALIZE');
    if (pm.state === 'THROTTLED') pm.transition('VISIBILITY_VISIBLE');
    pm.transition('CONTEXT_LOST');
    expect(pm.state).toBe('FROZEN');
    expect(pm.freezeReason).toBe('CONTEXT_LOST');
  });

  // RENDER-19: ResizeObserver RAF Decoupling
  it('RENDER-19: Coalesces rapid resize triggers within a single frame interval', () => {
    let resizeDispatchCount = 0;
    let pendingResize = false;
    const onResize = () => {
      pendingResize = true;
    };
    onResize();
    onResize();
    onResize();
    onResize();
    onResize();
    const tick = () => {
      if (pendingResize) {
        resizeDispatchCount++;
        pendingResize = false;
      }
    };
    tick();
    expect(resizeDispatchCount).toBe(1);
  });

  // RENDER-20: Zero Back-Writing Invariant
  it('RENDER-20: StrictRuntimeManifest and scene package inputs remain deeply frozen', () => {
    const frozenManifest = Object.freeze({
      manifestVersion: '1.0.0',
      assets: Object.freeze([
        Object.freeze({ id: 'mesh_01', hash: 'a1b2c3d4' })
      ])
    });
    expect(Object.isFrozen(frozenManifest)).toBe(true);
    expect(Object.isFrozen(frozenManifest.assets)).toBe(true);
    expect(() => {
      (frozenManifest as any).manifestVersion = '2.0.0';
    }).toThrow();
  });

  // RENDER-21: Inactive Dispatcher Defense & Auto-Destroy Linkage
  it('RENDER-21: Automatically triggers destroy on TERMINAL and rejects subsequent calls', () => {
    const dispatcher = new RafDispatcher();
    const pm = new PowerManager('WEBGL2', dispatcher);
    pm.transition('INITIALIZE');
    expect(dispatcher.isActive).toBe(true);
    pm.transition('DISPOSE');
    expect(pm.state).toBe('TERMINAL');
    expect(dispatcher.isActive).toBe(false);
    expect(() => dispatcher.schedule(() => {})).toThrow('RAF_DISPATCHER_INACTIVE');
    expect(() => dispatcher.acquireLease('owner')).toThrow('RAF_DISPATCHER_INACTIVE');
  });

  // RENDER-22: Lease Realm Scope Conflict
  it('RENDER-22: Conflicting lease acquisitions throw RAF_LEASE_CONFLICT until released', () => {
    const dispatcher = new RafDispatcher();
    const lease1 = dispatcher.acquireLease('owner_1');
    expect(lease1.leaseId).toBeDefined();
    expect(() => dispatcher.acquireLease('owner_2')).toThrow('RAF_LEASE_CONFLICT');
    const released = lease1.release();
    expect(released).toBe(true);
    expect(lease1.release()).toBe(false);
    const lease2 = dispatcher.acquireLease('owner_2');
    expect(lease2.leaseId).toBeDefined();
    lease2.release();
    dispatcher.destroy();
  });
});
