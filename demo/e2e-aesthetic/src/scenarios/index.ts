/**
 * scenarios/index.ts — registry of all demo scenarios.
 */

import type { ScenarioDefinition } from "../types";
import { songLoginScenario } from "./song-login";
import { zenPortfolioScenario } from "./zen-portfolio";
import { tangEcommerceScenario } from "./tang-ecommerce";

export const ALL_SCENARIOS: ScenarioDefinition[] = [
  songLoginScenario,
  zenPortfolioScenario,
  tangEcommerceScenario,
];

export { songLoginScenario, zenPortfolioScenario, tangEcommerceScenario };
