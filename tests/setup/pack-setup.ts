/**
 * jest setupFiles: install the real-skill DecisionPacks as the process-wide default of the test
 * environment (library code never does this). Packs are built lazily, only for the periods a test
 * file actually touches. A period-less lookup resolves to the SONG pack: global thresholds are
 * identical across contexts, so which context answers them is immaterial.
 */
import { setDefaultDecisionPackProvider } from "../../skill-bridge/active-pack";
import { defaultPackFor } from "../support/skill-packs";

if (process.env.ACS_SHEET_DIR) {
  setDefaultDecisionPackProvider((period) => {
    if (period === undefined) return defaultPackFor("SONG");
    if (period === "TANG" || period === "SONG" || period === "MING") return defaultPackFor(period);
    return undefined;
  });
}
