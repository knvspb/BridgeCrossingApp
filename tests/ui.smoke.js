// Дымовой тест интерфейса: открывает генератор в Chromium, проходит все вкладки и ловит ошибки.
// Запуск: node tests/ui.smoke.js (нужен Playwright с Chromium).
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('dialog', d => d.accept());
  await p.goto('file://' + path.join(__dirname, '..', 'apps', 'generator', 'index.html')); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(600);
  const n = await p.$$eval('nav.tabs button', bs => bs.length);
  for (let k = 1; k <= n; k++) {
    await p.click(`nav.tabs button:nth-child(${k})`); await p.waitForTimeout(300);
    const id = await p.$eval('main section:not(.hide)', s => s.id), kids = await p.$eval('main section:not(.hide)', s => s.childElementCount);
    if (!kids) errs.push(`вкладка ${id} пустая`);
  }
  await b.close();
  if (errs.length) { console.error('ОШИБКИ:\n' + errs.join('\n')); process.exit(1); }
  console.log(`ok: ${n} вкладок без ошибок`);
})();
