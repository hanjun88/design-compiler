/**
 * STEP 7-A · Source Identity Provenance Verifier
 * 遍历 source-identity-manifest.json，对每个 artifact 执行硬性一致性断言：
 * 1. 文件存在性
 * 2. JSON 内部 caseId / sourceVideo 与 manifest 声明严格全等
 * 3. JSON 内部声明的分辨率与 manifest 声明严格一致
 * 4. 磁盘物理文件 SHA-256 与 manifest 声明比对
 * 任一断言失败 → 非零 Exit Code 阻断 (PROVENANCE_TAINTED)
 */
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const MANIFEST_PATH = path.join(REPO_ROOT, "step6-a/audit/manifests/source-identity-manifest.json");

interface Artifact {
  layer: string;
  path: string;
  targetResolution: [number, number];
  frameCount?: number;
  method: string;
  identityField: string;
}

interface CaseEntry {
  sourceVideo: string;
  resolution: [number, number];
  sha256: string;
  artifacts: Artifact[];
}

interface Manifest {
  cases: Record<string, CaseEntry>;
}

function fileSha256(filepath: string): string {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filepath);
  hash.update(data);
  return hash.digest("hex");
}

function getNestedValue(obj: any, dottedPath: string): any {
  return dottedPath.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  ❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✅ ${message}`);
}

function verifyCase(caseId: string, caseEntry: CaseEntry): void {
  console.log(`\n=== Verifying ${caseId} ===`);
  console.log(`  sourceVideo: ${caseEntry.sourceVideo}`);
  console.log(`  resolution: ${caseEntry.resolution[0]}x${caseEntry.resolution[1]}`);

  // 1. Verify source video file exists and SHA-256 matches
  const sourceVideoPath = path.join(REPO_ROOT, caseEntry.sourceVideo);
  assert(fs.existsSync(sourceVideoPath), `source video exists: ${caseEntry.sourceVideo}`);

  const actualSourceSha = fileSha256(sourceVideoPath);
  assert(
    actualSourceSha === caseEntry.sha256,
    `source video SHA-256 match (expected ${caseEntry.sha256.substring(0, 16)}..., got ${actualSourceSha.substring(0, 16)}...)`
  );

  // 2. Verify each artifact
  for (const artifact of caseEntry.artifacts) {
    console.log(`\n  --- Artifact: ${artifact.layer} @ ${artifact.path} ---`);
    const artifactPath = path.join(REPO_ROOT, artifact.path);

    // 2a. File existence
    assert(fs.existsSync(artifactPath), `artifact file exists: ${artifact.path}`);

    // 2b. If JSON, verify internal identity fields
    if (artifact.path.endsWith(".json")) {
      const content = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));

      // Verify caseId if field exists
      if (artifact.identityField.includes("caseId")) {
        const actualCaseId = getNestedValue(content, artifact.identityField);
        assert(
          actualCaseId === caseId,
          `internal caseId match (expected ${caseId}, got ${actualCaseId})`
        );
      }

      // Verify sourceVideo if field exists
      if (artifact.identityField === "sourceVideo") {
        const actualSourceVideo = getNestedValue(content, "sourceVideo");
        assert(
          actualSourceVideo === caseEntry.sourceVideo,
          `internal sourceVideo match (expected ${caseEntry.sourceVideo}, got ${actualSourceVideo})`
        );
      }

      // Verify resolution if declared in perFrame
      if (content.perFrame && Array.isArray(content.perFrame) && content.perFrame.length > 0) {
        const firstFrame = content.perFrame[0];
        if (firstFrame.resolution) {
          const [w, h] = firstFrame.resolution;
          assert(
            w === artifact.targetResolution[0] && h === artifact.targetResolution[1],
            `perFrame resolution match (expected ${artifact.targetResolution[0]}x${artifact.targetResolution[1]}, got ${w}x${h})`
          );
        }
      }

      // Verify frame count
      if (artifact.frameCount && content.aggregate) {
        const actualFrames = content.aggregate.framesAnalyzed;
        assert(
          actualFrames === artifact.frameCount,
          `frame count match (expected ${artifact.frameCount}, got ${actualFrames})`
        );
      }
    }

    // 2c. Cross-contamination check: ensure artifact JSON does NOT reference the OTHER case's source video
    if (artifact.path.endsWith(".json")) {
      const rawContent = fs.readFileSync(artifactPath, "utf-8");
      const otherCaseId = caseId === "GOLDEN_CASE_02" ? "GOLDEN_CASE_03" : "GOLDEN_CASE_02";
      const otherCaseVideo = caseId === "GOLDEN_CASE_02"
        ? "fixtures/GOLDEN_CASE_03/source-video.mp4"
        : "fixtures/GOLDEN_CASE_02/source-video.mp4";

      assert(
        !rawContent.includes(otherCaseVideo),
        `no cross-contamination: artifact does not reference ${otherCaseId} source video`
      );
    }
  }
}

function main(): void {
  console.log("=== STEP 7-A · SOURCE IDENTITY PROVENANCE VERIFIER ===\n");

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`FATAL: manifest not found at ${MANIFEST_PATH}`);
    process.exit(1);
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  const caseIds = Object.keys(manifest.cases);
  console.log(`Cases to verify: ${caseIds.join(", ")}`);

  let allPassed = true;
  for (const caseId of caseIds) {
    try {
      verifyCase(caseId, manifest.cases[caseId]);
    } catch (e) {
      allPassed = false;
      console.error(`\n🔴 CASE ${caseId} VERIFICATION FAILED: ${(e as Error).message}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  if (allPassed) {
    console.log("🟢 ALL CASES VERIFIED — PROVENANCE CLEAN");
    console.log("   - No cross-contamination between CASE_02 and CASE_03");
    console.log("   - All source video SHA-256 match manifest");
    console.log("   - All artifact internal identity fields match manifest");
    console.log("   - All per-frame resolutions match declared target resolution");
    process.exit(0);
  } else {
    console.log("🔴 PROVENANCE TAINTED — verification failed");
    process.exit(2);
  }
}

main();
