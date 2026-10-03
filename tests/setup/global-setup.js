/**
 * jest globalSetup: emit the sheets of every required context from the real skill generator once
 * per run into a fresh temp directory and publish its location to the workers.
 */
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { emitAll } = require("../support/skill-env");

module.exports = async () => {
  const dir = mkdtempSync(join(tmpdir(), "acs-sheets-"));
  emitAll(dir);
  process.env.ACS_SHEET_DIR = dir;
};
