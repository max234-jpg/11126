// Usage: node tools/shoot.js <page path under docs/> <out prefix>
// Captures desktop + mobile screenshots of a demo site served from docs/.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [page, out] = process.argv.slice(2);
  const url = 'file://' + path.resolve(__dirname, '..', 'docs', page);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const [name, vp, mobile] of [['desktop', { width: 1440, height: 900 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
    const p = await ctx.newPage();
    await p.goto(url, { waitUntil: 'networkidle' });
    await p.evaluate(() => { document.querySelectorAll('.reveal').forEach(e => e.classList.add('on')); document.querySelectorAll('[data-count]').forEach(e => e.textContent = e.dataset.count + (e.dataset.suffix || '')); });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}-${name}.png` });
    await p.screenshot({ path: `${out}-${name}-full.png`, fullPage: true });
    await ctx.close();
  }
  await browser.close();
})();
