// serve-and-shot.js — zero-dep static server on public/ + headless screenshot.
// Serves public/, opens index.html in system Chromium (SwiftShader), waits for
// the WebGL frame + fetch of real bindings, then screenshots the stage.
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('/home/user/.npm-global/lib/node_modules/puppeteer-core');

const PUB = path.join(__dirname, 'public');
const PORT = 8713;
const SHOT = path.join(__dirname, 'out', 'page-shot.png');

const MIME = { '.html':'text/html', '.json':'application/json', '.js':'text/javascript', '.css':'text/css' };

const server = http.createServer((req, res) => {
  let p = path.join(PUB, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({
    executablePath: '/usr/local/bin/chromium',
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--use-angle=swiftshader','--use-gl=angle',
           '--enable-unsafe-swiftshader','--window-size=1400,800'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 800 });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__rendered === true', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: SHOT });
  console.log('SHOT', SHOT, fs.statSync(SHOT).size, 'bytes');
  const canvas = await page.$('#gl');
  const HERO = path.join(__dirname, 'out', 'hero-canvas.png');
  await canvas.screenshot({ path: HERO });
  console.log('HERO', HERO, fs.statSync(HERO).size, 'bytes');
  await browser.close();
  server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
