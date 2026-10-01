// Headless WebGL2 probe via system Chromium + puppeteer-core (global).
const puppeteer = require('/home/user/.npm-global/lib/node_modules/puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME = '/usr/local/bin/chromium';
const HTML = path.join(__dirname, 'gl-probe.html');
const SHOT = path.join(__dirname, 'gl-probe-shot.png');

const args = [
  '--no-sandbox', '--disable-setuid-sandbox',
  '--use-angle=swiftshader', '--use-gl=angle',
  '--enable-unsafe-swiftshader',
  '--disable-gpu-sandbox',
  '--window-size=480,270',
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args,
  });
  const page = await browser.newPage();
  page.on('console', m => console.log('[console]', m.text()));
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto('file://' + HTML, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 300));
  const info = await page.evaluate(() => window.__probe);
  console.log('PROBE_RESULT', JSON.stringify(info));
  await page.screenshot({ path: SHOT });
  console.log('SHOT_BYTES', fs.statSync(SHOT).size);
  await browser.close();
})().catch(e => { console.error('PROBE_FAIL', e.message); process.exit(1); });
