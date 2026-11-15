// Headless playtest helper (Playwright + the system Chrome). Usage from any .mjs script:
//   import { launch } from 'file:///C:/Users/media/projects/extradimensional/tools/harness.mjs';
//   const t = await launch({ outDir: 'C:/.../playtest/mylens' });      // opens index.html at 1280x720
//   await t.page.keyboard.down('Space'); await t.wait(500); await t.page.keyboard.up('Space');
//   console.log(await t.state());            // window.__game.state()
//   await t.shot('phase1');                  // -> <outDir>/phase1.png (view it with the Read tool)
//   await t.page.evaluate(() => window.__game.setStage(2));   // any in-page JS, e.g. install a bot
//   console.log(t.errors);                   // uncaught page exceptions + console errors/warnings so far
//   await t.close();
// t.page is a normal Playwright Page (keyboard.down/up/press, evaluate, addScriptTag, setViewportSize, ...).
import { chromium } from './node_modules/playwright-core/index.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function launch({ outDir = path.join(ROOT, 'playtest', 'misc'), width = 1280, height = 720, url, blockImages = false } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('EXCEPTION: ' + (e.stack || e.message)));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`console.${m.type()}: ${m.text()}`); });
  if (blockImages) await page.route(/\.(jpg|jpeg|png)$/i, r => r.abort());
  await page.goto(url || pathToFileURL(path.join(ROOT, 'index.html')).href, { waitUntil: 'load' });
  const wait = ms => page.waitForTimeout(ms);
  return {
    browser, page, errors, wait, outDir,
    state: () => page.evaluate(() => window.__game && window.__game.state()),
    shot: async name => { const p = path.join(outDir, name + '.png'); await page.screenshot({ path: p }); return p; },
    // hold a key for ms then release
    hold: async (key, ms) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key); },
    close: () => browser.close(),
  };
}
