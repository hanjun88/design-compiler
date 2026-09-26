/**
 * html-generator.ts
 *
 * Assembles a fully self-contained HTML document (inlined <style> + <script>)
 * for one scenario, driven by compiler-approved ThemeTokens.
 *
 * Layouts are scenario-specific (login form / asymmetric gallery / symmetric
 * carousel), but every color, whitespace ratio and layout axis comes from the
 * validated pipeline output — never from hard-coded aesthetics.
 */

import type { ScenarioDefinition, ThemeTokens } from "../types";
import { baseCss } from "./css-generator";
import { songLoginJs, zenPortfolioJs, tangShopJs } from "./js-generator";

// ---------------------------------------------------------------------------
// Document shell
// ---------------------------------------------------------------------------

function docShell(
  title: string,
  headExtra: string,
  style: string,
  body: string,
  script: string,
): string {
  return [
    "<!DOCTYPE html>",
    '<html lang="zh-Hant">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${title}</title>`,
    headExtra,
    "<style>",
    style,
    "</style>",
    "</head>",
    "<body>",
    body,
    "<script>",
    script,
    "</script>",
    "</body>",
    "</html>",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Scenario 1 — Song-elegant login
// ---------------------------------------------------------------------------

function songLoginBody(theme: ThemeTokens, d: {
  heading: string; subheading: string; accountLabel: string;
  passwordLabel: string; submitText: string; footerNote: string;
}): { body: string; style: string; script: string; headExtra: string } {
  const style = `
.login-wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding-top:14vh}
.hairline{width:64px;height:1px;background:var(--accent);margin:18px 0}
.song-title{font-family:"Ma Shan Zheng","STKaiti","KaiTi",serif;font-weight:400;letter-spacing:.3em;font-size:44px}
.sub{font-size:13px;letter-spacing:.5em;color:var(--accent);margin:14px 0 6vh}
form{width:300px}
.field{margin-bottom:28px;text-align:left}
label{display:block;font-size:12px;letter-spacing:.3em;color:var(--accent);margin-bottom:6px}
input{width:100%;background:transparent;border:none;border-bottom:1px solid var(--ink);padding:8px 2px;font:inherit;font-size:15px;color:var(--ink)}
input:focus{outline:none;border-bottom-color:var(--accent)}
.field.error input{border-bottom-color:var(--accent)}
.submit{margin-top:10px;background:transparent;border:1px solid var(--accent);color:var(--ink);padding:10px 42px;letter-spacing:.4em;font-size:14px;transition:opacity .6s ease}
.submit:hover{opacity:.7}
.msg{margin-top:18px;font-size:12px;color:var(--accent);min-height:1.6em;letter-spacing:.1em}
footer{margin-top:auto;padding-bottom:4vh;font-size:11px;letter-spacing:.3em;color:var(--accent)}
`.trim();

  const body = `
<main class="login-wrap">
  <div class="hairline"></div>
  <h1 class="song-title">${d.heading}</h1>
  <p class="sub">${d.subheading}</p>
  <form id="login-form" novalidate>
    <div class="field">
      <label for="f-account">${d.accountLabel}</label>
      <input id="f-account" type="text" autocomplete="off">
    </div>
    <div class="field">
      <label for="f-pass">${d.passwordLabel}</label>
      <input id="f-pass" type="password">
    </div>
    <button type="submit" class="submit">${d.submitText}</button>
    <p id="form-msg" class="msg"></p>
  </form>
  <div class="hairline"></div>
  <footer>${d.footerNote}</footer>
</main>`.trim();

  // Google Fonts (CDN exception) for a calligraphic heading face, with local
  // KaiTi fallbacks so the page still renders correctly offline.
  const headExtra =
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link href="https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&display=swap" rel="stylesheet">';

  return { body, style, script: songLoginJs(), headExtra };
}

// ---------------------------------------------------------------------------
// Scenario 2 — Chan-zen portfolio (asymmetric)
// ---------------------------------------------------------------------------

function zenPortfolioBody(theme: ThemeTokens, d: {
  author: string; nav: string[]; blurb: string;
  filters: string[]; works: { title: string; category: string; year: string }[];
}): { body: string; style: string; script: string; headExtra: string } {
  const navHtml = d.nav.map((n) => `<a href="#">${n}</a>`).join("\n      ");
  const filterHtml = d.filters
    .map((f, i) => `<button type="button" class="filter-btn${i === 0 ? " active" : ""}" data-filter="${f}">${f}</button>`)
    .join("\n      ");
  const worksHtml = d.works
    .map(
      (w) => `
        <li class="work-row" data-category="${w.category}">
          <h3>${w.title}</h3>
          <span class="meta">${w.category} · ${w.year}</span>
        </li>`,
    )
    .join("");

  const style = `
.zen-shell{display:grid;grid-template-columns:220px 1fr;min-height:100vh}
.side{padding:48px 32px;border-right:1px solid var(--accent)}
.brand{font-family:"Ma Shan Zheng","STKaiti","KaiTi",serif;font-size:20px;letter-spacing:.3em;margin-bottom:44px}
.side nav a{display:block;font-size:13px;letter-spacing:.25em;padding:8px 0;color:var(--accent)}
.content{position:relative;padding:8vh 10vw}
.wash{position:absolute;top:6vh;right:8vw;width:380px;height:380px;border-radius:50%;
  background:radial-gradient(circle at 38% 35%, rgba(22,22,20,.5), rgba(22,22,20,.15) 45%, rgba(22,22,20,0) 70%);
  pointer-events:none}
.hero{max-width:420px;margin-left:6vw}
.blurb{font-size:15px;line-height:2.2;letter-spacing:.1em}
.gallery{margin-top:8vh;max-width:640px;position:relative}
.filters{margin-bottom:24px}
.filter-btn{background:none;border:none;font-size:13px;letter-spacing:.2em;color:var(--accent);margin-right:22px;padding:4px 0;border-bottom:1px solid transparent}
.filter-btn.active{color:var(--ink);border-bottom-color:var(--ink)}
.work-row{display:flex;align-items:baseline;gap:18px;padding:16px 0;border-bottom:1px solid rgba(140,136,128,.4);transition:opacity .8s ease}
.work-row.hidden{opacity:0;visibility:hidden;height:0;padding:0;overflow:hidden}
.work-row h3{font-size:17px;font-weight:400;letter-spacing:.15em;min-width:140px}
.meta{font-size:12px;color:var(--accent);letter-spacing:.2em}
`.trim();

  const body = `
<div class="zen-shell">
  <aside class="side">
    <h1 class="brand">${d.author}</h1>
    <nav>
      ${navHtml}
    </nav>
  </aside>
  <main class="content">
    <div class="wash" aria-hidden="true"></div>
    <section class="hero">
      <p class="blurb">${d.blurb}</p>
    </section>
    <section class="gallery">
      <div class="filters">
      ${filterHtml}
      </div>
      <ul>${worksHtml}
      </ul>
    </section>
  </main>
</div>`.trim();

  return {
    body,
    style,
    script: zenPortfolioJs(),
    headExtra:
      '<link href="https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&display=swap" rel="stylesheet">',
  };
}

// ---------------------------------------------------------------------------
// Scenario 3 — Tang-tang ecommerce (symmetric, ornate)
// ---------------------------------------------------------------------------

function tangShopBody(theme: ThemeTokens, d: {
  brand: string; nav: string[]; heroTitle: string; heroSub: string;
  cta: string; products: { name: string; price: string; tag: string }[];
}): { body: string; style: string; script: string; headExtra: string } {
  const navHtml = d.nav.map((n) => `<a href="#">${n}</a>`).join("");
  const cards = d.products
    .map(
      (p) => `
        <div class="card">
          <span class="tag">${p.tag}</span>
          <h3>${p.name}</h3>
          <p class="price">${p.price}</p>
        </div>`,
    )
    .join("");

  const style = `
.topbar{display:flex;justify-content:center;padding:22px;border-bottom:1px solid rgba(201,162,75,.35)}
.topbar nav a{color:var(--ink);margin:0 20px;font-size:13px;letter-spacing:.3em;opacity:.9}
.hero{display:flex;justify-content:center;padding:7vh 4vw}
.frame{border:1px solid var(--accent);outline:1px solid var(--accent);outline-offset:8px;padding:60px 90px;text-align:center;max-width:640px}
.brand{color:var(--accent);letter-spacing:.4em;font-size:14px;margin-bottom:24px}
.hero h1{font-size:36px;font-weight:400;letter-spacing:.18em;color:var(--ink)}
.hero .sub{margin:18px 0 30px;font-size:13px;letter-spacing:.2em;color:var(--ink);opacity:.85}
.cta{background:transparent;border:1px solid var(--accent);color:var(--accent);padding:12px 40px;letter-spacing:.4em;font-size:14px;transition:opacity .5s ease}
.cta:hover{opacity:.7}
.shop{padding:0 8vw 10vh}
.carousel{display:flex;align-items:center;gap:18px;max-width:900px;margin:0 auto}
.viewport{overflow:hidden;flex:1}
#carousel-track{display:flex;transition:transform .7s ease}
.card{flex:0 0 100%;background:var(--ink);color:var(--shadow);padding:56px 40px;text-align:center}
.card .tag{display:inline-block;border:1px solid var(--shadow);font-size:12px;padding:2px 14px;letter-spacing:.3em;margin-bottom:18px}
.card h3{font-weight:400;font-size:22px;letter-spacing:.2em;margin-bottom:10px}
.price{color:var(--bg);letter-spacing:.1em}
#prev,#next{background:none;border:1px solid var(--accent);color:var(--accent);width:42px;height:42px;font-size:18px}
footer{text-align:center;padding:28px;font-size:12px;letter-spacing:.3em;color:var(--accent)}
`.trim();

  const body = `
<header class="topbar">
  <nav>${navHtml}</nav>
</header>
<section class="hero">
  <div class="frame">
    <div class="brand">${d.brand}</div>
    <h1>${d.heroTitle}</h1>
    <p class="sub">${d.heroSub}</p>
    <button type="button" class="cta">${d.cta}</button>
  </div>
</section>
<section class="shop">
  <div class="carousel">
    <button type="button" id="prev" aria-label="prev">‹</button>
    <div class="viewport">
      <div id="carousel-track">${cards}
      </div>
    </div>
    <button type="button" id="next" aria-label="next">›</button>
  </div>
</section>
<footer>© 大唐東市 · 金縷鋪</footer>`.trim();

  return { body, style, script: tangShopJs(), headExtra: "" };
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Generate a self-contained HTML document for the scenario.
 */
export function generateHtml(scenario: ScenarioDefinition, theme: ThemeTokens): string {
  const base = baseCss(theme);
  let chunk: { body: string; style: string; script: string; headExtra: string };

  switch (scenario.content.kind) {
    case "song-login":
      chunk = songLoginBody(theme, scenario.content.data);
      break;
    case "zen-portfolio":
      chunk = zenPortfolioBody(theme, scenario.content.data);
      break;
    case "tang-shop":
      chunk = tangShopBody(theme, scenario.content.data);
      break;
  }

  return docShell(
    scenario.title,
    chunk.headExtra,
    base + "\n" + chunk.style,
    chunk.body,
    chunk.script,
  );
}
