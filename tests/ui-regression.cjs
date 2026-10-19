// Run with Node and Playwright available through NODE_PATH.
// Firebase is replaced with local fixtures; no account or remote data is changed.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const root = path.resolve(__dirname, '..');
  const source = await fs.readFile(path.join(root, 'app.js'), 'utf8');
  const imports = [...source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*"[^"]+";/g)]
    .flatMap(match => match[1].split(',').map(name => name.trim()).filter(Boolean));
  const stubs = 'const ' + imports.map(name => `${name} = ${
    name === 'GoogleAuthProvider' ? 'class {}' :
    name === 'onSnapshot' ? '(...args) => { args[1]({empty:true,size:0,forEach(){}}); return () => {}; }' :
    '(...args) => ({})'
  }`).join(',') + ';';
  const instrumented = stubs + source.replace(/import\s*\{[\s\S]*?\}\s*from\s*"[^"]+";/g, '') + `
    window.uiTest = {loadBooks, loadChapters, loadWords, setViewMode, openModal, closeModal,
      seed() { currentUser = {uid:'fixture'}; }, renderCardView};`;
  const browser = await chromium.launch({headless: true,
    executablePath: process.env.UI_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (url.hostname === 'superword.test' && ['index.html', 'style.css', 'logo.png'].includes(file)) {
        return route.fulfill({body: await fs.readFile(path.join(root, file)), contentType:
          file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html'});
      }
      return route.abort();
    });
    await page.goto('http://superword.test');
    await page.addScriptTag({type: 'module', content: instrumented});
    await page.waitForFunction(() => !!window.uiTest);
    assert.equal(await page.locator('#lib-views-container').evaluate(el => !!el.closest('.ios-nav-bar')), false);
    assert.equal(await page.locator('#settings-modal').evaluate(el => el.parentElement.tagName), 'BODY');
    await page.evaluate(() => {
      window.uiTest.seed();
      document.querySelector('#landing-screen')?.classList.add('hidden');
      document.querySelector('#auth-screen')?.classList.add('hidden');
      document.querySelector('#library-content').classList.remove('hidden');
      window.uiTest.loadChapters('book', '영어 단어장');
      window.uiTest.loadWords('book', 'chapter', 'Day 01');
      window.uiTest.renderCardView(Array.from({length: 6}, (_, i) => ({
        front: `example${i}`, back: '📌 뜻\n예시\n\n📖 예문\n• This is an example.', order: i
      })));
    });
    const dialogs = ['settings-modal', 'test-modal', 'history-modal', 'export-modal'];
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({width, height: 900});
      await page.waitForTimeout(450);
      const layout = await page.evaluate(() => ({
        columns: getComputedStyle(document.querySelector('.words-card-grid')).gridTemplateColumns,
        overflow: document.documentElement.scrollWidth > innerWidth
      }));
      assert.equal(layout.overflow, false, `Page overflow at ${width}`);
      if (width >= 960) assert.equal(layout.columns.split(' ').length, 2, 'Desktop has two columns');
      if (process.env.UI_TEST_ARTIFACTS && [1440, 390].includes(width)) {
        await fs.mkdir(process.env.UI_TEST_ARTIFACTS, {recursive: true});
        await page.screenshot({path: path.join(process.env.UI_TEST_ARTIFACTS, `library-${width}.png`)});
      }
      const styles = [];
      for (const id of dialogs) {
        await page.evaluate(id => window.uiTest.openModal(document.getElementById(id)), id);
        await page.waitForTimeout(500);
        const metrics = await page.evaluate(id => {
          const el = document.querySelector(`#${id} .sheet-modal`);
          const box = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {width: box.width, x: box.x, right: box.right, bottom: box.bottom,
            padding: style.paddingLeft, background: style.backgroundColor,
            radius: style.borderRadius, overflow: el.scrollWidth > el.clientWidth,
            header: !!el.querySelector('.sheet-header'), parent: el.parentElement.id,
            barHidden: getComputedStyle(document.querySelector('#hide-toggle-bar')).display === 'none'};
        }, id);
        assert.equal(metrics.parent, id, 'Dialog markup remains correctly nested');
        assert.ok(metrics.x >= -1 && metrics.right <= width + 1 && metrics.bottom <= 901, `${id} fits ${width}`);
        assert.equal(metrics.overflow, false, `${id} has no horizontal overflow at ${width}`);
        assert.ok(metrics.header && metrics.barHidden);
        styles.push([metrics.width, metrics.padding, metrics.background, metrics.radius]);
        if (process.env.UI_TEST_ARTIFACTS && id === 'settings-modal' && [1440, 390].includes(width)) {
          await page.screenshot({path: path.join(process.env.UI_TEST_ARTIFACTS, `settings-${width}.png`)});
        }
        await page.keyboard.press('Escape');
        await page.waitForTimeout(450);
        assert.equal(await page.locator('body').evaluate(el => el.classList.contains('modal-open')), false);
      }
      styles.forEach(style => assert.deepEqual(style, styles[0], `Dialog consistency at ${width}`));
      console.log(`PASS ${width}px: layout, four dialogs, Escape and scroll lock`);
    }
    // The original regression: words -> chapters, including browser Back and Shorts.
    await page.evaluate(() => {
      window.uiTest.setViewMode('swipe');
      window.uiTest.loadChapters('book', '영어 단어장');
    });
    assert.equal(await page.locator('#hide-toggle-bar').isVisible(), false);
    assert.equal(await page.locator('body').evaluate(el => el.classList.contains('shorts-mode-active')), false);
    await page.evaluate(() => window.uiTest.loadWords('book', 'chapter', 'Day 01'));
    assert.equal(await page.locator('#hide-toggle-bar').isVisible(), true);
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => document.body.dataset.libraryLevel === '1');
    assert.equal(await page.locator('#hide-toggle-bar').isVisible(), false);
    await page.evaluate(() => window.uiTest.loadBooks());
    assert.equal(await page.locator('#hide-toggle-bar').isVisible(), false);
    console.log('PASS navigation: words, chapters, books, browser Back, Shorts cleanup');
    await page.evaluate(() => {
      const modal = document.querySelector('#settings-modal');
      window.uiTest.openModal(modal);
      window.uiTest.closeModal(modal);
      window.uiTest.openModal(modal);
    });
    await page.waitForTimeout(550);
    assert.equal(await page.locator('#settings-modal').evaluate(el => el.classList.contains('show') && !el.classList.contains('hidden')), true);
    assert.deepEqual(errors, [], 'No JavaScript runtime errors');
    console.log('PASS rapid dialog reopen; no runtime errors');
    await page.evaluate(() => window.setTheme('light'));
    const light = await page.locator('#settings-modal .sheet-modal').evaluate(el => ({
      background: getComputedStyle(el).backgroundColor,
      icon: getComputedStyle(el.querySelector('.sheet-close-btn svg')).stroke
    }));
    assert.equal(light.background, 'rgb(255, 255, 255)');
    assert.notEqual(light.icon, 'rgb(235, 235, 245)');
    await page.evaluate(() => {
      window.uiTest.closeModal(document.querySelector('#settings-modal'));
      window.uiTest.openModal(document.querySelector('#test-modal'));
      document.body.classList.add('test-open');
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => history.back());
    await page.waitForTimeout(500);
    assert.equal(await page.locator('body').evaluate(el => el.classList.contains('modal-open') || el.classList.contains('test-open')), false);
    console.log('PASS light theme and browser Back dialog cleanup');
    if (process.env.UI_TEST_SCREENSHOT) await page.screenshot({path: process.env.UI_TEST_SCREENSHOT});
  } finally {
    await browser.close();
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
