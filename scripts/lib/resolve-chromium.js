'use strict';
/**
 * resolve-chromium.js — one place that decides which Chromium the WebGL probes and e2e
 * scripts launch. Replaces hard-coded absolute paths (`/usr/local/bin/chromium`,
 * `~/.cache/ms-playwright/chromium-1234/...`) that only existed on one machine.
 *
 * Resolution order (first hit wins):
 *   1. environment override: CHROMIUM_EXECUTABLE_PATH, PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
 *      CHROME_PATH, CHROMIUM_PATH. An override that points at a missing file is an ERROR —
 *      it never silently falls through to something else.
 *   2. executable discovery: PATH lookup (chromium, chromium-browser, google-chrome[-stable]),
 *      well-known locations, $PLAYWRIGHT_BROWSERS_PATH/chromium-* and ~/.cache/ms-playwright/chromium-*.
 *   3. Playwright fallback: Playwright's own managed Chromium (executablePath left undefined so
 *      `chromium.launch()` uses it), when `playwright` can provide one that exists on disk.
 * Otherwise `source` is "unresolved" and callers must report BLOCKED_ENV with `tried`.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ENV_VARS = ['CHROMIUM_EXECUTABLE_PATH', 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH', 'CHROME_PATH', 'CHROMIUM_PATH'];
const BIN_NAMES = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];
const WELL_KNOWN = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/local/bin/chromium', '/snap/bin/chromium'];

function isExecutableFile(p) {
  try {
    const st = fs.statSync(p); // follows symlinks
    if (!st.isFile()) return false;
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch { return false; }
}

function playwrightBundles() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(os.homedir(), '.cache', 'ms-playwright'), '/opt/pw-browsers'].filter(Boolean);
  const found = [];
  for (const root of roots) {
    let entries = [];
    try { entries = fs.readdirSync(root); } catch { continue; }
    for (const e of entries.filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
      for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) found.push(path.join(root, e, sub));
    }
    found.push(path.join(root, 'chromium')); // symlink layout used by some images
  }
  return found;
}

function resolveChromium() {
  const tried = [];
  for (const v of ENV_VARS) {
    const val = process.env[v];
    if (!val) continue;
    if (isExecutableFile(val)) return { executablePath: val, source: `env:${v}`, tried: [val] };
    throw new Error(`${v}=${val} is set but is not an executable file (an explicit override is never ignored)`);
  }
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const candidates = [
    ...pathDirs.flatMap((d) => BIN_NAMES.map((n) => path.join(d, n))),
    ...WELL_KNOWN,
    ...playwrightBundles(),
  ];
  for (const c of candidates) {
    tried.push(c);
    if (isExecutableFile(c)) return { executablePath: c, source: 'discovery', tried };
  }
  try {
    const pw = require('playwright');
    const managed = pw.chromium.executablePath();
    tried.push(`playwright:${managed}`);
    if (managed && isExecutableFile(managed)) return { executablePath: undefined, source: 'playwright-managed', managedPath: managed, tried };
  } catch (e) {
    tried.push(`playwright:unavailable(${e.code || e.message})`);
  }
  return { executablePath: undefined, source: 'unresolved', tried };
}

/** Launch option fragment: `{ executablePath }` only when a concrete binary was resolved. */
function chromiumLaunchOptions() {
  const r = resolveChromium();
  return r.executablePath ? { executablePath: r.executablePath } : {};
}

/** Headed under a virtual display (DISPLAY set, e.g. xvfb-run); headless otherwise. FORCE_HEADLESS=1 wins. */
function headlessFlag() {
  if (process.env.FORCE_HEADLESS === '1') return true;
  return !process.env.DISPLAY;
}

module.exports = { resolveChromium, chromiumLaunchOptions, headlessFlag, isExecutableFile };
