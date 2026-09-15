// STEP 7 Phase 2: Patch Audit Inspector (read-only)
import { runDetailed } from "../../tests/golden-cases/GOLDEN_CASE_02/run";

async function main() {
  const r: any = await runDetailed();
  const v = r.pipelineOutput.validatedIR.validated;

  console.log("=== FINAL VALIDATED IR VALUES (after patches) ===");
  console.log("negativeSpaceRatio:", v.composition.negativeSpaceRatio.value,
    "(confidence:", v.composition.negativeSpaceRatio.confidence + ")");
  console.log("roughness:", v.materials[0].roughness.value,
    "(confidence:", v.materials[0].roughness.confidence + ")");
  console.log("metalness:", v.materials[0].metalness.value);
  console.log("wear:", v.materials[0].wear.value);
  console.log("colorTemp:", v.lighting.keyLight.colorTemp.value);
  console.log("temperatureBias:", v.color.temperatureBias.value);
  console.log("symmetry:", v.composition.symmetry.value);
  console.log("keyLight softness:", v.lighting.keyLight.softness?.value);
  console.log("ambientRatio:", v.lighting.ambientRatio.value);

  console.log("\n=== PATCH AUDIT REPORT ===");
  console.log(JSON.stringify(r.pipelineOutput.validatedIR.auditReport, null, 2));

  console.log("\n=== PATCHES APPLIED ===");
  console.log(JSON.stringify(r.pipelineOutput.validatedIR.patches, null, 2));

  console.log("\n=== RAW IR (before patches) ===");
  const raw = r.pipelineOutput.rawIR;
  console.log("negativeSpaceRatio:", raw.composition?.negativeSpaceRatio?.value);
  console.log("roughness:", raw.materials?.[0]?.roughness?.value);
  console.log("colorTemp:", raw.lighting?.keyLight?.colorTemp?.value);
}

main().catch(e => console.error("ERROR:", e.message));
