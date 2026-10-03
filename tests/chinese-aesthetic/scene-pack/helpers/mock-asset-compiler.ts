/**
 * Test double for the asset-compilation COORDINATION mechanics (dispatch, ledger, determinism).
 *
 * It lives in tests/ on purpose: production code has no default or fallback compiler, and a pack built
 * with this double is never a real scene pack. Real compilation is StandardAssetCompiler.
 */
import type { AssetPlanEntry } from "../../../../chinese-aesthetic/scene-pack/types";
import type { IAssetCompiler, AssetCompilationContext } from "../../../../chinese-aesthetic/scene-pack/asset-compiler";

export class MockAssetCompiler implements IAssetCompiler {
  readonly compilerId = "mock-asset-compiler";
  readonly supportedCategories = ["*"];
  readonly supportedStrategies: AssetPlanEntry["compilationStrategy"][] = ["COPY_SOURCE", "COMPUTE_DERIVED", "GENERATE_SYNTHETIC"];

  async compile(
    entry: AssetPlanEntry,
    context: AssetCompilationContext,
  ): Promise<{ bytes: Uint8Array; metadata?: Record<string, unknown> }> {
    const seed = `${entry.assetId}:${context.sceneId}:${context.targetWidth}x${context.targetHeight}`;
    return { bytes: this.deterministicBytes(seed, entry.mimeType), metadata: { mock: true, seed, generatedBy: this.compilerId } };
  }

  private deterministicBytes(seed: string, mimeType: string): Uint8Array {
    if (mimeType === "application/json") {
      return new TextEncoder().encode(JSON.stringify({ mock: true, seed, generatedBy: "mock-asset-compiler" }));
    }
    const seedBytes = new TextEncoder().encode(seed);
    const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const result = new Uint8Array(header.length + seedBytes.length);
    result.set(header, 0);
    result.set(seedBytes, header.length);
    return result;
  }
}
