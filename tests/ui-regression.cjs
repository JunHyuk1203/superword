// Run with Node and Playwright available through NODE_PATH.
// Firebase is replaced with local fixtures; no account or remote data is changed.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');

async function main() {
  const root = path.resolve(__dirname, '..');
  const source = await fs.readFile(path.join(root, 'app.js'), 'utf8');
  const imports = [...source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*"[^"]+";/g)]
    .flatMap(match => match[1].split(',').map(name => name.trim()).filter(Boolean));
  const stubs = 'const ' + imports.map(name => `${name} = ${
    name === 'GoogleAuthProvider' ? 'class {}' :
    name === 'httpsCallable' ? '() => async data => { (window.aiFixtureRequests ||= []).push(data); if (window.deferAiFixture) return new Promise(resolve => {window.resolveAiFixture = resolve;}); return {data: data.action === "appeal" ? {isApproved:true,fromCache:false} : {text:"fixture report"}}; }' :
    name === 'onAuthStateChanged' ? '(auth, callback) => { window.authFixture = callback; }' :
    name === 'getDocs' ? 'async () => ({empty: !(window.historyFixture?.length), forEach(callback) { (window.historyFixture || []).forEach(data => callback({data: () => data})); }})' :
    name === 'onSnapshot' ? '(...args) => { window.snapshotCalls = (window.snapshotCalls || 0) + 1; if (window.snapshotError) args[2](new Error(window.snapshotError)); else args[1]({empty:true,size:0,forEach(){}}); return () => {}; }' :
    '(...args) => ({})'
  }`).join(',') + ';';
  const instrumented = stubs + source.replace(/import\s*\{[\s\S]*?\}\s*from\s*"[^"]+";/g, '') + `
    window.uiTest = {loadBooks, loadChapters, loadWords, setViewMode, openModal, closeModal,
      seed() { currentUser = {uid:'fixture'}; }, renderCardView, renderTableView,
      escapeCSV, renderSimpleMarkdown, getUser() { return currentUser; },
      seedReport() {selectedBookId = 'book'; selectedChapterId = 'chapter'; currentTestRecord = {correct: 1, total: 1, wrongWords: [], mode: 'quiz', dir: 'word2meaning'};},
      seedAppeal() {selectedBookId = 'book'; selectedChapterId = 'chapter'; shortCurrentData = {_path:'users/fixture/books/book/chapters/chapter/words/word',word:'apple',meaning:'사과'}; document.querySelector('#short-answer-input').value = '사과';}};`;
  new vm.Script(instrumented, {filename: 'instrumented-app.js'});
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
    await page.evaluate(() => localStorage.setItem('gemini_api_key', 'retired-fixture-key'));
    await page.addScriptTag({type: 'module', content: instrumented});
    await page.waitForFunction(() => !!window.uiTest).catch(error => {
      throw new Error(`App initialization failed: ${errors.join('; ') || error.message}`);
    });
    assert.equal(await page.evaluate(() => localStorage.getItem('gemini_api_key')), null);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('superword_ai_key')), null);
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
    // Security regressions use hostile data through the real rendering/event paths.
    const payload = '<img src=x onerror="window.securityInjected=true">';
    const rendered = await page.evaluate(payload => {
      window.securityInjected = false;
      window.uiTest.renderTableView([{front: payload, back: payload,
        _path: `bad\"><img src=x onerror=\"window.securityInjected=true\">`}]);
      const table = document.querySelector('#words-tbody');
      return {images: table.querySelectorAll('img').length,
        text: table.textContent, markdown: window.uiTest.renderSimpleMarkdown(payload),
        csv: ['=1+1', '+SUM(1)', '-1', '@SUM(1)', '\t=1', '  =1', '\r=1', 'normal', 'hello,world']
          .map(value => window.uiTest.escapeCSV(value))};
    }, payload);
    assert.equal(rendered.images, 0);
    assert.ok(rendered.text.includes(payload));
    assert.ok(rendered.markdown.includes('&lt;img'));
    rendered.csv.slice(0, 7).forEach(value => assert.ok(value.startsWith("'") || value.startsWith('"\'')));
    assert.equal(rendered.csv[7], 'normal');
    assert.equal(rendered.csv[8], '"hello,world"');
    await page.evaluate(payload => {window.historyFixture = [{correct: payload, total: payload, mode: 'quiz'}];
      window.uiTest.seed(); window.uiTest.loadWords('book','chapter','Day 01');
      document.querySelector('#view-history-btn').click();}, payload);
    await page.waitForTimeout(500);
    await page.locator('.history-item').click();
    assert.equal(await page.locator('#history-detail-score img').count(), 0);
    assert.ok((await page.locator('#history-detail-score').textContent()).includes(payload));
    await page.evaluate(payload => {window.authFixture(null); window.uiTest.seed(); window.snapshotError = payload; window.uiTest.loadBooks();}, payload);
    assert.equal(await page.locator('#view-books img').count(), 0);
    assert.ok((await page.locator('#view-books').textContent()).includes(payload));
    await page.evaluate(() => {window.snapshotError = null;});
    console.log('PASS hostile paths, words, history, errors, Markdown and CSV formulas');
    page.on('dialog', dialog => dialog.dismiss());
    const providerRequests = [];
    page.on('request', request => {if (/generativelanguage|api.openai/.test(request.url())) providerRequests.push(request.url());});
    await page.evaluate(() => {
      window.uiTest.seedReport();
      document.querySelector('#generate-ai-report-btn').click();
    });
    await page.waitForFunction(() => document.querySelector('#history-ai-report-container').textContent.includes('fixture report'));
    const requests = await page.evaluate(() => window.aiFixtureRequests);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].action, 'report');
    assert.equal(JSON.stringify(requests).includes('apiKey'), false);
    assert.equal(await page.locator('#gemini-api-key').count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('gemini_api_key')), null);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('superword_ai_key')), null);
    await page.evaluate(() => {window.uiTest.seedAppeal(); document.querySelector('#short-appeal-btn').click();});
    await page.waitForFunction(() => document.querySelector('#short-feedback').textContent.includes('정답으로 인정'));
    const appeal = await page.evaluate(() => window.aiFixtureRequests.at(-1));
    assert.equal(appeal.action, 'appeal');
    assert.equal(appeal.wordId, 'word');
    assert.equal(appeal.userAnswer, '사과');
    assert.equal('apiKey' in appeal, false);
    await page.evaluate(() => window.authFixture(null));
    assert.equal(await page.locator('#history-ai-report-container').textContent(), '');
    const before = await page.evaluate(() => window.snapshotCalls);
    await page.evaluate(() => window.authFixture({uid:'unverified', email:'tntgame1203@gmail.com', emailVerified:false}));
    assert.equal(await page.evaluate(() => window.uiTest.getUser()), null);
    assert.equal(await page.evaluate(() => window.snapshotCalls), before);
    await page.evaluate(() => window.authFixture({uid:'verified', email:'verified@example.com', emailVerified:true, providerData:[]}));
    assert.equal(await page.evaluate(() => window.uiTest.getUser().uid), 'verified');
    assert.equal(await page.evaluate(() => window.securityInjected), false);
    console.log('PASS server-only AI report/appeal, no browser key/provider requests, logout and verified login');
    await page.evaluate(() => {
      window.deferAiFixture = true;
      window.uiTest.seedReport();
      document.querySelector('#generate-ai-report-btn').click();
      document.querySelector('#flashcard-front').textContent = 'private previous word';
      document.querySelector('#short-answer-input').value = 'private previous answer';
    });
    await page.waitForFunction(() => !!window.resolveAiFixture);
    await page.evaluate(() => {
      window.authFixture({uid:'another-user', email:'another@example.com', emailVerified:true, providerData:[]});
      window.resolveAiFixture({data:{text:'private stale report'}});
    });
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#history-ai-report-container').textContent(), '');
    assert.equal(await page.locator('#flashcard-front').textContent(), '');
    assert.equal(await page.locator('#short-answer-input').inputValue(), '');
    assert.equal(await page.evaluate(() => window.uiTest.getUser().uid), 'another-user');
    assert.equal(providerRequests.length, 0);
    assert.deepEqual(errors, []);
    console.log('PASS direct account switch and stale server response suppression');
    if (process.env.UI_TEST_SCREENSHOT) await page.screenshot({path: process.env.UI_TEST_SCREENSHOT});
  } finally {
    await browser.close();
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
