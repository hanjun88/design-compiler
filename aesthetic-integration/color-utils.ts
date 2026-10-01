/**
 * color-utils.ts
 *
 * Tiny dependency-free color math for the G2.5 anti-cliche gate.
 * Converts the hex swatches found in `ValidatedSceneGraph.color` into HSL so
 * saturation / hue cliches (pure-red + pure-green, neon over-saturation) can be
 * detected. No external color library — kept deterministic and side-effect free.
 *
 * @module aesthetic-integration/color-utils
 */

export interface RGB {
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
}

export interface HSL {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

/**
 * Parse a #RRGGBB (or shorthand #RGB) hex string into RGB channels.
 * Accepts leading "#" and is case-insensitive. Returns null on malformed input.
 */
export function hexToRgb(hex: string): RGB | null {
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace(/^#/, "");
  // Shorthand #RGB → #RRGGBB
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const num = parseInt(h, 16);
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

/**
 * Convert RGB (0..255 channels) to HSL.
 * h in [0,360), s/l in [0,1].
 */
export function rgbToHsl(r: number, g: number, b: number): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h, s, l };
}

/** Convenience: hex → HSL. Returns null when the hex is unparseable. */
export function hexToHsl(hex: string): HSL | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

/** Normalize a hex to lowercase #rrggbb for exact forbidden-set comparison. */
export function normalizeHex(hex: string): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const to2 = (v: number) => v.toString(16).padStart(2, "0");
  return `#${to2(rgb.r)}${to2(rgb.g)}${to2(rgb.b)}`;
}

/** Circular angular distance between two hues on the 0..360 color wheel. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Is this color a "near-pure" reference color at a target hue?
 * Requires high saturation and a mid-lightness body (so we exclude dark maroon,
 * pastel pink, and near-grays).
 */
export function isNearPureHue(
  hsl: HSL,
  targetHue: number,
  opts: { hueTolerance?: number; minSaturation?: number; lightnessRange?: [number, number] } = {},
): boolean {
  const { hueTolerance = 12, minSaturation = 0.85, lightnessRange = [0.3, 0.62] } = opts;
  if (hsl.s < minSaturation) return false;
  if (hsl.l < lightnessRange[0] || hsl.l > lightnessRange[1]) return false;
  return hueDistance(hsl.h, targetHue) <= hueTolerance;
}
