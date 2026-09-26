/**
 * js-generator.ts
 *
 * Emits the per-scenario interaction script as an inline string.
 *
 * Anti-cliché note: motion vocabulary is restricted by the sheet
 * (motion.hardFail = ["bounce","particle"]); these scripts deliberately use
 * quiet fade / slide transitions only.
 */

/** Scenario 1 — login form validation (quiet inline errors, no toast explosions). */
export function songLoginJs(): string {
  return `
(function(){
  var form = document.getElementById('login-form');
  var msg  = document.getElementById('form-msg');
  form.addEventListener('submit', function(e){
    e.preventDefault();
    var account = document.getElementById('f-account');
    var pass    = document.getElementById('f-pass');
    var bad = false;
    [account, pass].forEach(function(f){
      f.parentElement.classList.remove('error');
      if(!f.value.trim()){ f.parentElement.classList.add('error'); bad = true; }
    });
    if(bad){ msg.textContent = '兩處皆需填妥，方可入院。'; return; }
    msg.textContent = '已入院 · 歡迎，' + account.value.trim();
  });
})();
`.trim();
}

/** Scenario 2 — portfolio work filter (opacity dissolve, no pop). */
export function zenPortfolioJs(): string {
  return `
(function(){
  var buttons = document.querySelectorAll('.filter-btn');
  var works   = document.querySelectorAll('.work-row');
  buttons.forEach(function(btn){
    btn.addEventListener('click', function(){
      buttons.forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      var cat = btn.getAttribute('data-filter');
      works.forEach(function(w){
        var match = (cat === '全部') || (w.getAttribute('data-category') === cat);
        w.classList.toggle('hidden', !match);
      });
    });
  });
})();
`.trim();
}

/** Scenario 3 — product carousel (quiet horizontal slide, wraps around). */
export function tangShopJs(): string {
  return `
(function(){
  var track = document.getElementById('carousel-track');
  var cards = track.children.length;
  var idx = 0;
  function render(){ track.style.transform = 'translateX(-' + (idx * 100) + '%)'; }
  document.getElementById('prev').addEventListener('click', function(){
    idx = (idx - 1 + cards) % cards; render();
  });
  document.getElementById('next').addEventListener('click', function(){
    idx = (idx + 1) % cards; render();
  });
})();
`.trim();
}
