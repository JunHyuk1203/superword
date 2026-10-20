// Run with Node and Playwright available through NODE_PATH.
// Firebase is replaced with local fixtures; no account or remote data is changed.
const { chromium, webkit } = require('playwright');
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
    name === 'initializeFirestore' ? '(_app, settings) => { window.firestoreSettings = settings; return {}; }' :
    name === 'httpsCallable' ? '() => async data => { (window.aiFixtureRequests ||= []).push(data); if (window.deferAiFixture) return new Promise(resolve => {window.resolveAiFixture = resolve;}); return {data: data.action === "appeal" ? {isApproved:true,fromCache:false} : {text:"fixture report"}}; }' :
    name === 'onAuthStateChanged' ? '(auth, callback) => { window.authFixture = callback; }' :
    name === 'getDocs' ? 'async () => ({empty: !(window.historyFixture?.length), forEach(callback) { (window.historyFixture || []).forEach(data => callback({data: () => data})); }})' :
    name === 'onSnapshot' ? '(...args) => { window.snapshotCalls = (window.snapshotCalls || 0) + 1; const entry = {cancelled:false, deliver(words = []) {if (!this.cancelled) args[1]({empty:!words.length,size:words.length,forEach(callback){words.forEach((data,index)=>callback({data:()=>data,ref:{path:"fixture/words/"+index}}));}});}}; (window.snapshotEntries ||= []).push(entry); if (window.snapshotError) args[2](new Error(window.snapshotError)); else if (!window.deferSnapshots) entry.deliver(); return () => {entry.cancelled = true;}; }' :
    '(...args) => ({})'
  }`).join(',') + ';';
  const instrumented = stubs + source.replace(/import\s*\{[\s\S]*?\}\s*from\s*"[^"]+";/g, '') + `
    window.uiTest = {loadBooks, loadChapters, loadWords, setViewMode, openModal, closeModal,
      seed() { currentUser = {uid:'fixture'}; }, renderCardView, renderTableView,
      navigateSwipe,
      seedStudy() { autoPlayPronunciation = false; autoPlayBtn.classList.remove('active'); autoPlayBtn.setAttribute('aria-pressed', 'false');
        currentLoadedWords = ['apple','banana','orange'].map(word => ({word, meaning:'과일', examples:[], related:[]}));
        renderCardView(currentLoadedWords); updateHideToggleAvailability(currentLoadedWords); },
      escapeCSV, renderSimpleMarkdown, getUser() { return currentUser; },
      seedReport() {selectedBookId = 'book'; selectedChapterId = 'chapter'; currentTestRecord = {correct: 1, total: 1, wrongWords: [], mode: 'quiz', dir: 'word2meaning'};},
      seedAppeal() {selectedBookId = 'book'; selectedChapterId = 'chapter'; shortCurrentData = {_path:'users/fixture/books/book/chapters/chapter/words/word',word:'apple',meaning:'사과'}; document.querySelector('#short-answer-input').value = '사과';}};`;
  new vm.Script(instrumented, {filename: 'instrumented-app.js'});
  const browser = process.env.UI_TEST_WEBKIT ? await webkit.launch({headless: true}) :
    await chromium.launch({headless: true,
      executablePath: process.env.UI_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const page = await browser.newPage(process.env.UI_TEST_WEBKIT ? {
      viewport:{width:390,height:900}, deviceScaleFactor:3, isMobile:true, hasTouch:true,
      userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
    } : process.env.UI_TEST_ANDROID ? {
      viewport:{width:390,height:900}, deviceScaleFactor:3, isMobile:true, hasTouch:true,
      userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A.240905.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36'
    } : {});
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
    assert.equal(await page.evaluate(() => !!window.firestoreSettings.experimentalForceLongPolling), !!process.env.UI_TEST_WEBKIT);
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
    if (process.env.UI_TEST_RESPONSIVE) {
      await require('./responsive-study-regression.cjs')(page);
      assert.deepEqual(errors, []);
      return;
    }
    if (process.env.UI_TEST_HIDE_STATE) {
      await require('./hide-state-regression.cjs')(page);
      assert.deepEqual(errors, []);
      return;
    }
    if (process.env.UI_TEST_IOS_PAINT) {
      await require('./ios-title-paint.cjs')(page);
      assert.deepEqual(errors, []);
      return;
    }
    if (!process.env.UI_TEST_NAV_ONLY) {
    const dialogs = ['settings-modal', 'test-modal', 'history-modal', 'export-modal'];
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({width, height: 900});
      await page.waitForTimeout(450);
      const layout = await page.evaluate(() => ({
        columns: getComputedStyle(document.querySelector('.words-card-grid')).gridTemplateColumns,
        contentWidth: document.querySelector('.app-container').getBoundingClientRect().width,
        overflow: document.documentElement.scrollWidth > innerWidth
      }));
      assert.equal(layout.overflow, false, `Page overflow at ${width}`);
      assert.ok(Math.abs(layout.contentWidth-width)<1, 'Page uses available viewport width');
      assert.equal(layout.columns.split(' ').length, width>=960 ? 2 : 1, 'Desktop cards use the available columns');
      if (process.env.UI_TEST_ARTIFACTS && [1440, 390].includes(width)) {
        await fs.mkdir(process.env.UI_TEST_ARTIFACTS, {recursive: true});
        await page.screenshot({path: path.join(process.env.UI_TEST_ARTIFACTS, `library-${width}.png`)});
      }
      const styles = [];
      for (const id of dialogs) {
        await page.evaluate(id => window.uiTest.openModal(document.getElementById(id)), id);
        await page.waitForFunction(id => document.getElementById(id).classList.contains('show'), id);
        if (width === 390) {
          const minBottom = await page.evaluate(async id => {
            const sheet = document.querySelector(`#${id} .sheet-modal`);
            const start = performance.now();
            let minimum = Infinity;
            while (performance.now() - start < 450) {
              await new Promise(requestAnimationFrame);
              minimum = Math.min(minimum, sheet.getBoundingClientRect().bottom);
            }
            return minimum;
          }, id);
          assert.ok(minBottom >= 899, `${id} opening animation keeps bottom edge below viewport`);
        }
        await page.waitForTimeout(500);
        const metrics = await page.evaluate(id => {
          const el = document.querySelector(`#${id} .sheet-modal`);
          const box = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {width: box.width, x: box.x, right: box.right, bottom: box.bottom,
            padding: style.paddingLeft, background: style.backgroundColor,
            radius: style.borderRadius, overflow: el.scrollWidth > el.clientWidth,
            header: !!el.querySelector('.sheet-header'), parent: el.parentElement.id,
            barHidden: getComputedStyle(document.querySelector('#hide-toggle-bar')).display === 'none' || getComputedStyle(document.querySelector('#hide-toggle-bar')).visibility === 'hidden'};
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
        await page.waitForFunction(() => !document.body.classList.contains('modal-open'), null, {timeout:3000}).catch(async error => {
          throw new Error(`${id} failed to close: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.modal-screen.show')].map(el => el.id)))}; page errors: ${errors.join('; ')}; ${error.message}`);
        });
        assert.equal(await page.locator('body').evaluate(el => el.classList.contains('modal-open')), false);
      }
      styles.forEach(style => assert.deepEqual(style, styles[0], `Dialog consistency at ${width}`));
      console.log(`PASS ${width}px: layout, four dialogs, Escape and scroll lock`);
    }
    const gestures = await page.evaluate(() => {
      const emit = (type, points) => {
        const event = new Event(type, {bubbles:true});
        const touches = points.map(([clientX,clientY]) => ({clientX,clientY}));
        Object.defineProperties(event, {touches:{value:type === 'touchend' || type === 'touchcancel' ? [] : touches}, changedTouches:{value:touches}});
        document.dispatchEvent(event);
      };
      const results = [];
      for (const [name, moves, end] of [
        ['scroll down', [[36,440]], [180,580]],
        ['scroll up', [[36,360]], [180,220]],
        ['diagonal back', [[90,450]], [180,520]],
        ['upward diagonal back', [[50,364]], [140,256]],
        ['downward diagonal back', [[50,436]], [140,544]],
        ['outside angle down', [[40,435]], [140,608]],
        ['outside angle up', [[40,365]], [140,192]],
        ['scroll then horizontal', [[24,380],[140,395]], [200,405]],
        ['horizontal then scroll', [[60,402],[80,540]], [240,580]],
        ['horizontal back', [[60,403]], [150,405]]
      ]) {
        window.uiTest.loadChapters('book','영어 단어장');
        emit('touchstart', [[20,400]]);
        moves.forEach(point => emit('touchmove',[point]));
        emit('touchend', [end]);
        results.push({name, level:document.body.dataset.libraryLevel});
      }
      window.uiTest.loadChapters('book','영어 단어장');
      emit('touchstart',[[20,400]]);
      emit('touchmove',[[60,402]]);
      emit('touchcancel',[[60,402]]);
      emit('touchend',[[150,405]]);
      results.push({name:'cancelled touch',level:document.body.dataset.libraryLevel});
      emit('touchstart',[[20,400]]);
      emit('touchmove',[[80,402],[100,410]]);
      emit('touchend',[[180,405]]);
      results.push({name:'multiple touches',level:document.body.dataset.libraryLevel});
      return results;
    });
    gestures.forEach(result => assert.equal(result.level, result.name.endsWith(' back') ? '0' : '1', result.name));
    console.log('PASS Back gesture: wider diagonal range, vertical scroll locks, angle limits, cancellation and multitouch');
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
    // Re-enter the same/different book before its initial snapshot arrives.
    await page.evaluate(() => {
      window.deferSnapshots = true;
      for (const book of ['book', 'other', 'other', 'book']) {
        window.uiTest.loadChapters(book, book);
        window.uiTest.loadBooks();
      }
      window.uiTest.loadChapters('book', '영어 단어장');
      window.snapshotEntries.forEach(entry => entry.deliver());
      window.deferSnapshots = false;
    });
    assert.ok(!(await page.locator('#view-chapters').textContent()).includes('로딩 중'));
    assert.equal(await page.evaluate(() => window.snapshotEntries.filter(entry => !entry.cancelled).length), 1);
    console.log('PASS delayed snapshots: repeated same/different book entry, one active listener');
    const recovery = await page.evaluate(() => {
      const originalSetTimeout = window.setTimeout;
      const deadlines = [];
      window.setTimeout = (callback, delay, ...args) => {
        if (delay === 15000) deadlines.push(callback);
        return originalSetTimeout(callback, delay, ...args);
      };
      const results = [];
      window.deferSnapshots = true;
      try {
        for (const [container, load] of [
          ['#view-books', () => window.uiTest.loadBooks()],
          ['#view-chapters', () => window.uiTest.loadChapters('book', '영어 단어장')],
          ['#words-card-view', () => window.uiTest.loadWords('book', 'chapter', 'Day 01')]
        ]) {
          load();
          const expired = deadlines.at(-1);
          expired();
          const target = document.querySelector(container);
          const timeoutShown = target.textContent.includes('연결이 지연');
          target.querySelector('.library-retry').click();
          // A cancelled request must never replace the newer loading screen.
          expired();
          const cancelledIgnored = target.textContent.includes('로딩 중');
          deadlines.at(-1)();
          window.snapshotEntries.at(-1).deliver();
          results.push({timeoutShown, cancelledIgnored,
            recovered: !target.textContent.includes('로딩 중') && !target.querySelector('.library-retry')});
        }
      } finally {
        window.setTimeout = originalSetTimeout;
        window.deferSnapshots = false;
      }
      return results;
    });
    assert.deepEqual(recovery, Array.from({length:3}, () => ({timeoutShown:true, cancelledIgnored:true, recovered:true})));
    console.log('PASS loading deadline, retry, late recovery and cancelled deadline isolation at all three levels');
    for (const width of [390, 1440]) {
      await page.setViewportSize({width, height: 900});
      for (const level of ['chapters', 'words']) {
        await page.evaluate(level => {
          if (level === 'chapters') window.uiTest.loadChapters('book', '영어 단어장');
          else window.uiTest.loadWords('book', 'chapter', 'Day 01');
          document.querySelector('#lib-views-container').style.minHeight = '2400px';
        }, level);
        await page.waitForTimeout(400);
        const expanded = await page.locator('.ios-nav-bar').evaluate(el => el.getBoundingClientRect().height);
        await page.evaluate(() => window.scrollTo({top:350, behavior:'instant'}));
        await page.waitForTimeout(650);
        const compact = await page.evaluate(() => {
          const title = document.querySelector('#ios-large-title-text').getBoundingClientRect();
          const slot = document.querySelector('#ios-nav-title-inline').getBoundingClientRect();
          const back = document.querySelector('#ios-back-btn').getBoundingClientRect();
          const backText = document.querySelector('#ios-back-text').getBoundingClientRect();
          return {height: document.querySelector('.ios-nav-bar').getBoundingClientRect().height,
            x: Math.abs(title.x - slot.x), y: Math.abs(title.y - slot.y), afterBack: title.x >= back.right,
            textAlignment: Math.abs((title.top + title.height / 2) - (backText.top + backText.height / 2)),
            duplicateVisible: getComputedStyle(document.querySelector('#ios-nav-title-inline')).visibility !== 'hidden'};
        });
        assert.ok(compact.height < expanded - (width >= 960 ? 8 : 20), `${level} header shrinks at ${width}: ${expanded} -> ${compact.height}`);
        assert.ok(compact.x < 2 && compact.y < 2 && compact.afterBack, 'Title moves beside back button');
        assert.ok(compact.textAlignment < 1, 'Current and previous titles share the same vertical center');
        assert.equal(compact.duplicateVisible, false);
        await page.evaluate(() => window.scrollTo({top:0, behavior:'instant'}));
        await page.waitForTimeout(650);
        assert.equal(await page.locator('.ios-nav-bar').evaluate(el => el.classList.contains('compact')), false);
      }
    }
    await page.evaluate(() => {document.querySelector('#lib-views-container').style.minHeight = '60vh';});
    console.log('PASS mobile/desktop: chapters and words collapse, title movement, return to top');
    await page.evaluate(() => { window.uiTest.setViewMode('swipe'); window.scrollTo(0, 0); });
    await page.waitForTimeout(650);
    assert.equal(await page.locator('.ios-nav-bar').evaluate(el => el.classList.contains('compact')), true);
    await page.evaluate(() => document.dispatchEvent(new Event('scroll')));
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.ios-nav-bar').evaluate(el => el.classList.contains('compact')), true);
    await page.evaluate(() => window.uiTest.setViewMode('card'));
    await page.waitForTimeout(650);
    assert.equal(await page.locator('.ios-nav-bar').evaluate(el => el.classList.contains('compact')), false);
    console.log('PASS Shorts: compact at top and on scroll, expands when returning to cards');
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({width, height: 900});
      await page.evaluate(() => {window.uiTest.seedStudy(); window.uiTest.setViewMode('card'); window.scrollTo(0, 0);});
      await page.waitForTimeout(450);
      const cardGap = await page.evaluate(() => document.querySelector('.word-card').getBoundingClientRect().top - document.querySelector('.ios-nav-bar').getBoundingClientRect().bottom);
      assert.ok(cardGap >= 18*(width<960 ? 0.7 : 1), `Card top spacing at ${width}`);
      assert.equal(await page.locator('.hide-toggle-options button').count(), 4);
      await page.locator('#toggle-word').click();
      assert.equal(await page.locator('#toggle-word').getAttribute('aria-pressed'), 'false');
      await page.locator('#toggle-word').click();
      assert.equal(await page.locator('#toggle-word').getAttribute('aria-pressed'), 'true');
      await page.evaluate(() => window.uiTest.setViewMode('swipe'));
      await page.waitForTimeout(700);
      const fit = await page.evaluate(() => {
        const card = document.querySelector('#swipe-card').getBoundingClientRect();
        const header = document.querySelector('.ios-nav-bar').getBoundingClientRect();
        const bar = document.querySelector('#hide-toggle-bar').getBoundingClientRect();
        return {top: card.top - header.bottom, bottom: bar.top - card.bottom,
          fits: bar.left >= 0 && bar.right <= innerWidth && bar.bottom <= innerHeight,
          overflow: document.documentElement.scrollWidth > innerWidth};
      });
      assert.ok(fit.top >= (width >= 600 ? 8 : 18)*(width<960 ? 0.7 : 1) && fit.bottom >= 12, `Shorts card spacing at ${width}: ${JSON.stringify(fit)}`);
      assert.ok(fit.fits && !fit.overflow, `Toolbar fits at ${width}`);
      assert.equal(await page.locator('#auto-play-toggle').isVisible(), true);
      assert.equal(await page.locator('#shuffle-swipe-btn').isVisible(), true);
      const popupStability = await page.evaluate(async () => {
        const card = document.querySelector('#swipe-card');
        const baseline = card.getBoundingClientRect();
        let maxDelta = 0;
        let toolsHidden = true;
        const sample = async duration => {
          const start = performance.now();
          while (performance.now() - start < duration) {
            await new Promise(requestAnimationFrame);
            const box = card.getBoundingClientRect();
            maxDelta = Math.max(maxDelta, Math.abs(box.height - baseline.height), Math.abs(box.top - baseline.top), Math.abs(box.width - baseline.width));
          }
        };
        for (const id of ['settings-modal','test-modal','history-modal','export-modal']) {
          const modal = document.getElementById(id);
          window.uiTest.openModal(modal);
          toolsHidden &&= getComputedStyle(document.querySelector('#hide-toggle-bar')).visibility === 'hidden';
          // Trigger resize recalculation too, as happens with mobile browser chrome.
          window.dispatchEvent(new Event('resize'));
          await sample(420);
          window.uiTest.closeModal(modal);
          await sample(450);
        }
        return {maxDelta, toolsHidden};
      });
      assert.ok(popupStability.maxDelta < 1, `Shorts background stays stable throughout popup animations at ${width}: ${JSON.stringify(popupStability)}`);
      assert.ok(popupStability.toolsHidden);
      assert.equal(await page.locator('#hide-toggle-bar').isVisible(), true);
      await page.locator('#auto-play-toggle').click();
      assert.equal(await page.locator('#auto-play-toggle').getAttribute('aria-pressed'), 'true');
      await page.locator('#auto-play-toggle').click();
      assert.equal(await page.locator('#auto-play-toggle').getAttribute('aria-pressed'), 'false');
      await page.evaluate(() => {window.uiTest.navigateSwipe(1); window.uiTest.navigateSwipe(1);});
      await page.waitForTimeout(450);
      assert.equal(await page.locator('#swipe-counter').textContent(), '2 / 3');
      await page.locator('#shuffle-swipe-btn').click();
      await page.waitForTimeout(450);
      assert.equal(await page.locator('#swipe-counter').textContent(), '2 / 3');
      if (process.env.UI_TEST_ARTIFACTS) await page.screenshot({path:path.join(process.env.UI_TEST_ARTIFACTS, `study-toolbar-${width}.png`)});
      await page.evaluate(() => window.uiTest.setViewMode('card'));
      await page.waitForTimeout(450);
      assert.equal(await page.locator('.shorts-controls').evaluate(el => el.inert), true);
    }
    console.log('PASS study spacing and simple toolbar: 320/390/1440px, all controls, shuffle, rapid swipe lock, stable Shorts background during four popup animations');
    await page.setViewportSize({width:390, height:900});
    for (const level of ['books','chapters']) {
      await page.evaluate(level => {
        if (level === 'books') window.uiTest.loadBooks();
        else window.uiTest.loadChapters('book', '영어 단어장');
      }, level);
      await page.waitForTimeout(400);
      const gap = await page.evaluate(level => {
        const button = document.querySelector(level === 'books' ? '#add-book-btn' : '#add-chapter-btn');
        return button.getBoundingClientRect().top - document.querySelector('.ios-nav-bar').getBoundingClientRect().bottom;
      }, level);
      assert.ok(gap >= 18*0.7, `${level} add button has spacing below header`);
    }
    console.log('PASS add book/chapter spacing and bottom-sheet animation without overshoot');
    }
    await page.setViewportSize({width:390, height:900});
    await page.waitForTimeout(400);
    const headerMotion = await page.evaluate(async () => {
      const inner = document.querySelector('.ios-nav-bar-inner');
      window.uiTest.loadBooks();
      window.uiTest.loadChapters('book', '영어 단어장');
      await new Promise(requestAnimationFrame);
      const forward = document.querySelector('.ios-title-label').getAnimations().map(animation => animation.effect.getKeyframes()[0].transform).filter(Boolean);
      window.uiTest.loadWords('book', 'chapter', 'Day 01');
      await new Promise(requestAnimationFrame);
      window.uiTest.loadChapters('book', '영어 단어장');
      await new Promise(requestAnimationFrame);
      const ghost = document.querySelector('.library-nav-ghost');
      const transfer = ghost?.getAnimations()[0]?.effect.getKeyframes().at(-1).transform;
      const text = ghost?.textContent;
      const fixedAnimations = inner.getAnimations().length + document.querySelector('#settings-btn').getAnimations().length + document.querySelector('.ios-nav-back-chevron').getAnimations().length;
      window.uiTest.loadBooks();
      window.uiTest.loadChapters('book', '영어 단어장');
      await new Promise(requestAnimationFrame);
      return {forward, transfer, text, fixedAnimations, ghostCount:document.querySelectorAll('.library-nav-ghost').length};
    });
    assert.deepEqual(headerMotion.forward, ['translate(-100%, 0px)']);
    assert.equal(headerMotion.text, '영어 단어장');
    assert.match(headerMotion.transfer, /^translate\(/);
    assert.ok(parseFloat(headerMotion.transfer.split(',')[1]) > 0, 'Previous menu name moves downward to the current title');
    assert.equal(headerMotion.fixedAnimations, 0, 'Settings, chevron and header container remain stationary');
    assert.ok(headerMotion.ghostCount <= 1, 'Rapid navigation removes previous title transfers');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.evaluate(async () => {
      window.uiTest.loadBooks();
      await new Promise(requestAnimationFrame);
      return document.querySelector('#ios-large-title-text').getAnimations().length + document.querySelectorAll('.library-nav-ghost').length;
    }), 0);
    await page.emulateMedia({reducedMotion:'no-preference'});
    console.log('PASS directional header transitions, rapid navigation cancellation, reduced motion');
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({width, height:900});
      const repeated = await page.evaluate(async () => {
        const label = document.querySelector('#ios-back-text');
        const back = document.querySelector('#ios-back-btn');
        const problems = [];
        let duration = 0;
        for (let i = 0; i < 8; i++) {
          window.uiTest.loadBooks();
          window.uiTest.loadChapters('book', '영어 단어장');
          await new Promise(requestAnimationFrame);
          if (label.textContent !== '단어장 목록') problems.push('root label mismatch');
          const rootTransfer = document.querySelector('.library-nav-ghost');
          if (rootTransfer?.textContent !== '단어장 목록' || document.querySelector('.library-nav-exit')) problems.push('root title did not transfer into back label');
          window.uiTest.loadWords('book', 'chapter', 'Day 01');
          await new Promise(requestAnimationFrame);
          duration = Math.max(duration, ...document.querySelector('.library-nav-ghost').getAnimations().map(animation => animation.effect.getTiming().duration));
          back.click();
          await new Promise(requestAnimationFrame);
          const style = getComputedStyle(label);
          const box = label.getBoundingClientRect();
          if (label.textContent !== '단어장 목록' || style.visibility !== 'visible' || Number(style.opacity) < 0.45 || box.width < 20 || box.height < 10) problems.push(`missing label after return ${i}`);
          back.click();
        }
        window.uiTest.loadChapters('book', '영어 단어장');
        return {problems, duration};
      });
      assert.deepEqual(repeated.problems, [], `Back labels survive repeated interrupted navigation at ${width}`);
      assert.equal(repeated.duration, 520, 'Title movement uses the longer duration');
      await page.evaluate(() => new Promise(requestAnimationFrame));
      await page.waitForFunction(() => !document.querySelector('.library-nav-ghost'));
      assert.equal(await page.locator('#ios-back-text').textContent(), '단어장 목록');
      assert.equal(await page.locator('#ios-back-text').evaluate(el => getComputedStyle(el).opacity), '1');
      assert.equal(await page.locator('.library-nav-ghost').count(), 0);
      const forwardMotion = await page.evaluate(async () => {
        window.uiTest.loadWords('book', 'chapter', 'Day 01');
        await new Promise(requestAnimationFrame);
        const ghost = document.querySelector('.library-nav-ghost');
        const movement = ghost.getAnimations()[0];
        movement.pause();
        const samples = [];
        for (const time of [0, 80, 240, 519]) {
          movement.currentTime = time;
          await new Promise(requestAnimationFrame);
          const bounds = ghost.getBoundingClientRect();
          samples.push(bounds.width > 0 && bounds.height > 0 && getComputedStyle(ghost).visibility === 'visible');
        }
        const frames = movement.effect.getKeyframes();
        const end = new DOMMatrix(frames.at(-1).transform);
        movement.currentTime = 240;
        return {text:ghost.textContent, samples, y:end.f,
          clipAnimated:frames.some(frame => frame.clipPath !== undefined),
          exits:document.querySelectorAll('.library-nav-exit').length};
      });
      assert.equal(forwardMotion.text, '영어 단어장', 'The previous current title itself becomes the back label');
      assert.deepEqual(forwardMotion.samples, [true, true, true, true], 'Flying title remains visible throughout the push');
      assert.equal(forwardMotion.exits, 0, 'Forward title transfers instead of exiting sideways');
      if (width < 960) assert.ok(forwardMotion.y < 0, 'Expanded current title moves upward into the back label');
      assert.equal(forwardMotion.clipAnimated, true, 'Keep the original clipping animation on every platform');
      const waitingBackLabel = await page.locator('#ios-back-text').evaluate(el => ({
        visibility:getComputedStyle(el).visibility, opacity:getComputedStyle(el).opacity
      }));
      assert.deepEqual(waitingBackLabel, process.env.UI_TEST_WEBKIT ?
        {visibility:'visible',opacity:'0'} : {visibility:'hidden',opacity:'1'},
        'iOS keeps the real back label painted and hides only its opacity until arrival');
      assert.equal(await page.locator('.library-nav-ghost').isVisible(), true);
      await page.evaluate(() => document.querySelector('.library-nav-ghost').getAnimations()[0].play());
      await page.waitForFunction(() => !document.querySelector('#ios-back-text').classList.contains('library-nav-pending'));
      assert.equal(await page.locator('#ios-back-text').isVisible(), true);
      assert.equal(await page.locator('#ios-back-text').evaluate(el => getComputedStyle(el).opacity), '1', 'Real back label is opaque after the flying title arrives');
      assert.equal(await page.locator('#ios-back-text').textContent(), '영어 단어장');
      await page.evaluate(async () => {
        document.querySelector('#ios-back-btn').click();
        await new Promise(requestAnimationFrame);
        const movement = document.querySelector('.library-nav-ghost').getAnimations()[0];
        movement.pause();
        movement.currentTime = 240;
        await new Promise(requestAnimationFrame);
      });
      assert.equal(await page.locator('#ios-large-title-text').evaluate(el => getComputedStyle(el).visibility), 'hidden', 'Destination current title waits for transfer arrival');
      assert.equal(await page.locator('.library-nav-ghost').isVisible(), true);
      const mobileFont = await page.evaluate(() => {
        const ghost = document.querySelector('.library-nav-ghost'), title = document.querySelector('#ios-large-title-text');
        const frames = ghost.getAnimations()[0].effect.getKeyframes();
        const end = new DOMMatrix(frames.at(-1).transform);
        return {font:getComputedStyle(ghost).fontSize, targetFont:getComputedStyle(title).fontSize,
          autoSize:getComputedStyle(ghost).webkitTextSizeAdjust, targetAutoSize:getComputedStyle(title).webkitTextSizeAdjust,
          animatedFont:frames.some(frame => frame.fontSize !== undefined), scaleX:end.a, scaleY:end.d};
      });
      assert.equal(mobileFont.font, mobileFont.targetFont, 'Transfer uses destination font size from its first frame');
      assert.equal(mobileFont.autoSize, mobileFont.targetAutoSize, 'Same text autosizing policy inside and outside toolbar');
      assert.equal(mobileFont.animatedFont, false, 'No WebView font-size interpolation');
      assert.equal(mobileFont.scaleX, 1);
      assert.equal(mobileFont.scaleY, 1);
      const handoff = await page.evaluate(async () => {
          const ghost = document.querySelector('.library-nav-ghost');
          const animation = ghost.getAnimations()[0];
          animation.currentTime = 519;
          await new Promise(requestAnimationFrame);
          const title = document.querySelector('#ios-large-title-text');
          const a = ghost.getBoundingClientRect(), b = title.getBoundingClientRect();
          const ghostStyle = getComputedStyle(ghost), titleStyle = getComputedStyle(title);
          const ghostRange = document.createRange(), titleRange = document.createRange();
          ghostRange.selectNodeContents(ghost);
          titleRange.selectNodeContents(title.querySelector('.ios-title-label'));
          const last = {x:Math.abs(a.left-b.left), y:Math.abs(a.top-b.top),
            glyphWidth:Math.abs(ghostRange.getBoundingClientRect().width-titleRange.getBoundingClientRect().width),
            sameFont:ghostStyle.fontFamily === titleStyle.fontFamily,
            letterSpacing:Math.abs(parseFloat(ghostStyle.letterSpacing)-parseFloat(titleStyle.letterSpacing))};
          animation.play();
        return last;
      });
      assert.ok(handoff && handoff.sameFont && handoff.letterSpacing < 0.05, `Transfer typography matches the destination at ${width}: ${JSON.stringify(handoff)}`);
      assert.ok(handoff.x < 1 && handoff.y < 1 && handoff.glyphWidth < 1, `Transfer handoff has no position/text-width jump at ${width}: ${JSON.stringify(handoff)}`);
      await page.waitForFunction(() => !document.querySelector('.library-nav-ghost'));
      assert.equal(await page.locator('#ios-large-title-text').isVisible(), true);
      assert.equal(await page.locator('#ios-back-text').textContent(), '단어장 목록');
      assert.equal(await page.locator('.library-nav-ghost').count(), 0);
    }
    console.log('PASS full root label, repeated interrupted navigation, visible resting back label, longer motion');
    const restoredNavigation = await page.evaluate(async () => {
      window.uiTest.loadChapters('book', '영어 단어장');
      await new Promise(requestAnimationFrame);
      window.uiTest.loadWords('book', 'chapter', 'Day 01');
      await new Promise(requestAnimationFrame);
      const ghost = document.querySelector('.library-nav-ghost');
      const movement = ghost.getAnimations()[0];
      const finish = movement.onfinish;
      movement.onfinish = null;
      movement.finish();
      await new Promise(requestAnimationFrame);
      const target = document.querySelector('#ios-back-text');
      const a = ghost.getBoundingClientRect(), b = target.getBoundingClientRect();
      const held = {fill:movement.effect.getTiming().fill, x:Math.abs(a.left-b.left), y:Math.abs(a.top-b.top)};
      finish();
      const revealedBeforeRemoval = getComputedStyle(target).visibility === 'visible' && ghost.isConnected;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const removed = !ghost.isConnected;
      window.uiTest.loadChapters('book', '영어 단어장');
      await new Promise(requestAnimationFrame);
      document.querySelector('.library-nav-ghost')?.getAnimations()[0].pause();
      document.dispatchEvent(new Event('visibilitychange'));
      const resumed = !document.querySelector('.library-nav-ghost') && !document.querySelector('.library-nav-pending');
      window.uiTest.loadWords('book', 'chapter', 'Day 01');
      await new Promise(requestAnimationFrame);
      window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true}));
      return {held, revealedBeforeRemoval, removed, resumed,
        restored:!document.querySelector('.library-nav-ghost') && !document.querySelector('.library-nav-pending')};
    });
    assert.equal(restoredNavigation.held.fill, 'both');
    assert.ok(restoredNavigation.held.x < 1 && restoredNavigation.held.y < 1, 'Finished transfer holds its destination while finish dispatch is delayed');
    for (const key of ['revealedBeforeRemoval','removed','resumed','restored']) assert.equal(restoredNavigation[key], true, key);
    console.log('PASS filled endpoint, painted-label handoff, tab resume and back/forward cache cleanup');
    if (process.env.UI_TEST_NAV_ONLY) {
      assert.deepEqual(errors, []);
      return;
    }
    await page.setViewportSize({width:390, height:900});
    for (const mode of ['card', 'swipe']) {
      await page.evaluate(mode => {
        window.uiTest.loadChapters('book', '영어 단어장');
        window.uiTest.loadWords('book', 'chapter', 'Day 01');
        window.uiTest.setViewMode(mode);
      }, mode);
      await page.waitForTimeout(700);
      const departure = await page.evaluate(async () => {
        document.querySelector('#ios-back-btn').click();
        await new Promise(requestAnimationFrame);
        const exit = document.querySelector('.library-nav-exit');
        return {text:exit?.textContent,
          end:exit?.firstElementChild.getAnimations()[0]?.effect.getKeyframes().at(-1).transform,
          fixed:document.querySelector('#settings-btn').getAnimations().length};
      });
      assert.equal(departure.text, 'Day 01');
      assert.equal(departure.end, mode === 'card' ? 'translate(-100%, 0px)' : 'translate(0px, -100%)');
      assert.equal(departure.fixed, 0);
      await page.waitForTimeout(650);
      assert.equal(await page.locator('.library-nav-exit').count(), 0);
      assert.equal(await page.locator('#ios-large-title-text').isVisible(), true);
    }
    console.log('PASS outgoing title: exits left when expanded, upward when compact; temporary layers cleaned up');
    for (const width of [390, 1440]) {
      await page.setViewportSize({width, height:900});
      await page.evaluate(() => window.uiTest.loadWords('book', 'chapter', 'Day 01'));
      await page.waitForTimeout(850);
      const heights = await page.evaluate(async () => {
        const bar = document.querySelector('.ios-nav-bar');
        const before = bar.getBoundingClientRect().height;
        window.uiTest.loadChapters('book', '영어 단어장');
        const samples = [];
        const start = performance.now();
        while (performance.now() - start < 700) {
          await new Promise(requestAnimationFrame);
          samples.push(bar.getBoundingClientRect().height);
        }
        return {before, after:samples.at(-1), samples};
      });
      if (width < 960) {
        assert.ok(heights.before - heights.after > 2, `Header heights differ at ${width}: ${heights.before} -> ${heights.after}`);
        assert.ok(heights.samples.some(height => height > heights.after + 0.5 && height < heights.before - 0.5), 'Header passes through intermediate heights');
        assert.ok(Math.max(...heights.samples.slice(1).map((height,i) => Math.abs(height - heights.samples[i]))) < (heights.before - heights.after) * 0.75, 'No single-frame height jump');
      } else {
        assert.ok(heights.before <= 64 && heights.after <= 64, 'Desktop screens keep a small single-row header');
      }
      const settled = await page.locator('.ios-nav-bar').evaluate(bar => ({
        outer:bar.getBoundingClientRect().height,
        inner:bar.querySelector('.ios-nav-bar-inner').getBoundingClientRect().height,
        border:parseFloat(getComputedStyle(bar).borderTopWidth) + parseFloat(getComputedStyle(bar).borderBottomWidth)
      }));
      assert.ok(Math.abs(settled.outer - settled.inner - settled.border) < 1, 'Header settles to its content height');
    }
    console.log('PASS mobile/desktop header height animation: intermediate frames and correct final height');
    for (const width of [960, 1024, 1440]) {
      await page.setViewportSize({width, height:900});
      await page.evaluate(() => {
        window.uiTest.loadChapters('book', '영어 단어장');
        window.uiTest.loadWords('book', 'chapter', 'Day 01');
        window.uiTest.setViewMode('card');
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(800);
      assert.ok(await page.locator('.ios-nav-bar').evaluate(el => el.getBoundingClientRect().height <= 64));
      await page.evaluate(() => window.uiTest.setViewMode('swipe'));
      await page.waitForTimeout(800);
      const desktop = await page.evaluate(() => {
        const bar = document.querySelector('.ios-nav-bar').getBoundingClientRect();
        const settings = document.querySelector('#settings-btn').getBoundingClientRect();
        const controls = ['view-card-btn','view-swipe-btn','view-table-btn','start-test-btn','view-history-btn','open-extract-btn','export-csv-btn'].map(id => {
          const button = document.getElementById(id), box = button.getBoundingClientRect();
          return {id, sameRow:Math.abs((box.top+box.height/2)-(settings.top+settings.height/2)) < 1,
            fits:box.left >= bar.left && box.right <= settings.left && box.top >= bar.top && box.bottom <= bar.bottom && box.width >= 24};
        });
        return {height:bar.height,width:bar.width, controls, overflow:document.documentElement.scrollWidth > innerWidth};
      });
      assert.ok(desktop.width <= width && desktop.height <= 52 && !desktop.overflow,
        `Adaptive Shorts header at ${width}: ${JSON.stringify(desktop)}`);
      assert.ok(desktop.controls.every(button => button.sameRow && button.fits), `All desktop actions align with Settings at ${width}: ${JSON.stringify(desktop)}`);
    }
    await page.evaluate(() => window.uiTest.setViewMode('card'));
    console.log('PASS reference-size desktop header: 960/1024/1440px, all controls fit, compact and default height limits');
    for (const width of [960, 1440]) {
      await page.setViewportSize({width, height:900});
      for (const mode of ['card', 'swipe']) {
        await page.evaluate(mode => {
          window.uiTest.loadChapters('book', '길이가 긴 영어 단어장 이름');
          window.uiTest.loadWords('book', 'chapter', 'Day 01');
          window.uiTest.setViewMode(mode);
        }, mode);
        await page.waitForTimeout(750);
        for (const destination of ['chapters','books']) {
          await page.evaluate(() => document.querySelector('#ios-back-btn').click());
          await page.waitForTimeout(120);
          const landing = await page.evaluate(() => {
            const title = document.querySelector('#ios-large-title-text').getBoundingClientRect();
            const bar = document.querySelector('.ios-nav-bar');
            const slot = document.querySelector(bar.classList.contains('compact') ? '#ios-nav-title-inline' : '.ios-title-slot').getBoundingClientRect();
            const ghost = document.querySelector('.library-nav-ghost');
            const last = ghost.getAnimations()[0].effect.getKeyframes().at(-1);
            const matrix = new DOMMatrix(last.transform);
            return {targetX:Math.abs(parseFloat(ghost.style.left)+matrix.e-slot.left),
              targetY:Math.abs(parseFloat(ghost.style.top)+matrix.f-slot.top),
              titleX:Math.abs(title.left-slot.left), titleY:Math.abs(title.top-slot.top)};
          });
          assert.ok(Object.values(landing).every(delta => delta < 1), `Desktop Back targets the layout slot at ${width}, ${mode}, ${destination}: ${JSON.stringify(landing)}`);
          await page.waitForTimeout(550);
          assert.equal(await page.locator('#ios-large-title-text').isVisible(), true);
          assert.equal(await page.locator('#ios-large-title-text').textContent(), destination === 'chapters' ? '길이가 긴 영어 단어장 이름' : '단어장 목록');
        }
      }
    }
    console.log('PASS desktop Back landing: long menu names, chapters/books, expanded/Shorts, 960/1440px');
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
    await require('./hide-state-regression.cjs')(page);
    assert.deepEqual(errors, []);
    if (process.env.UI_TEST_SCREENSHOT) await page.screenshot({path: process.env.UI_TEST_SCREENSHOT});
  } finally {
    await browser.close();
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
