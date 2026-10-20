// UI_TEST_RESPONSIVE=1 node tests/ui-regression.cjs, optionally UI_TEST_WEBKIT=1.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = async function verifyResponsiveStudy(page) {
  const words = ['acquire','inhabitant','dedicate'].map(word => ({word, meaning:'얻다, 습득하다', pos:'동',
    pronunciation:'[əkwáiər]', etymology:['ad(...에)','quaerere(구하다)'],
    examples:Array.from({length:18}, (_, i) => `${i+1}. We ${word} useful skills through daily practice. (매일 연습하며 유용한 기술을 익힙니다.)`),
    synonyms:['obtain: 손에 넣다'], related:['acquisition: 습득']}));
  await page.evaluate(words => {
    window.uiTest.seedStudy(); // Disable pronunciation in fixtures.
    window.uiTest.loadWords('book','chapter','Day 01');
    window.snapshotEntries.at(-1).deliver(words);
    window.fullscreenFixtureRequests = 0;
    Object.defineProperty(document.documentElement, 'requestFullscreen', {configurable:true,value() {
      window.fullscreenFixtureRequests++; return Promise.reject(new Error('Browser fullscreen must not be requested'));
    }});
  }, words);
  if (process.env.UI_TEST_ARTIFACTS) await fs.mkdir(process.env.UI_TEST_ARTIFACTS, {recursive:true});
  let referenceFont;
  let referenceButton;
  for (const [width,height] of [[506,898],[390,844],[1440,900],[1920,1080]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(() => window.uiTest.setViewMode('card'));
    await page.waitForTimeout(450);
    const size = await page.evaluate(() => ({width:document.querySelector('.app-container').getBoundingClientRect().width,
      font:getComputedStyle(document.querySelector('.word-card-word')).fontSize,
      buttonWidth:document.querySelector('#start-test-btn').getBoundingClientRect().width,
      buttonHeight:document.querySelector('#start-test-btn').getBoundingClientRect().height,
      cssButtonHeight:parseFloat(getComputedStyle(document.querySelector('#start-test-btn')).height),
      scale:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gui-scale')),
      overflow:document.documentElement.scrollWidth > innerWidth}));
    referenceFont ||= size.font;
    referenceButton ||= [size.buttonWidth,size.buttonHeight];
    assert.ok(Math.abs(size.width-width)<1 && !size.overflow, `Page uses available width at ${width}: ${JSON.stringify(size)}`);
    assert.equal(size.scale,width<960 ? 0.805 : 1,'Mobile GUI is 15% larger than the previous 70% scale; desktop is unchanged');
    assert.ok(Math.abs(size.buttonHeight-size.cssButtonHeight*size.scale)<1,'Buttons render at the requested GUI scale');
    if (width<960) {
      assert.equal(size.font, referenceFont, 'Mobile reading text keeps the reference size');
      assert.deepEqual([size.buttonWidth,size.buttonHeight],referenceButton, 'Mobile GUI buttons keep the reference size');
    }
    console.log(`PASS fluid page with reference GUI sizes: ${width}x${height}`);
  }
  for (const [width,height] of [[844,390],[667,375],[1024,600],[1280,540],[1024,768],[1366,768],[1440,801],[1440,900],[506,430],[390,360]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(() => window.uiTest.setViewMode('swipe'));
    await page.waitForFunction(() => {
      const bar=document.querySelector('.ios-nav-bar');
      const inner=document.querySelector('.ios-nav-bar-inner');
      const style=getComputedStyle(bar), border=parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth);
      const card=document.querySelector('#swipe-card'), toolbar=document.querySelector('#hide-toggle-bar');
      return bar.classList.contains('compact') && card.clientHeight>50 &&
        card.getBoundingClientRect().bottom<=toolbar.getBoundingClientRect().top-5 &&
        Math.abs(bar.getBoundingClientRect().height-inner.getBoundingClientRect().height-border)<1;
    });
    await page.waitForTimeout(100);
    const layout = await page.evaluate(() => {
      const card=document.querySelector('#swipe-card'), primary=document.querySelector('.swipe-card-primary'), details=document.querySelector('.swipe-card-details');
      const a=primary.getBoundingClientRect(), b=details.getBoundingClientRect();
      const title=document.querySelector('#ios-large-title-text'), titleBox=title.getBoundingClientRect();
      const titleRange=document.createRange(); titleRange.selectNodeContents(title);
      const glyphs=titleRange.getBoundingClientRect();
      return {columns:getComputedStyle(document.querySelector('.swipe-card-content')).gridTemplateColumns,
        titleVisible:title.checkVisibility() && glyphs.width>0 && glyphs.height>0,
        titleText:title.textContent.trim(),titleTop:titleBox.top,titleBottom:titleBox.bottom,
        headerBottom:document.querySelector('.ios-nav-bar').getBoundingClientRect().bottom,
        left:a.left,right:b.left,cardCenter:(card.getBoundingClientRect().left+card.getBoundingClientRect().right)/2,
        cardBottom:card.getBoundingClientRect().bottom,cardHeight:card.clientHeight,
        barTop:document.querySelector('#hide-toggle-bar').getBoundingClientRect().top,
        font:card.style.fontSize,overflow:document.documentElement.scrollWidth > innerWidth,
        viewport:[innerWidth,innerHeight,visualViewport.height],headerClass:document.querySelector('.ios-nav-bar').className,
        viewHeight:document.querySelector('#words-swipe-view').style.height};
    });
    assert.ok(!layout.overflow && layout.cardHeight > 50 && layout.cardBottom <= layout.barTop-5, `Card fits above tools at ${width}x${height}: ${JSON.stringify(layout)}`);
    assert.equal(layout.font,'100%', 'Card uses readable text without percentage shrinking');
    assert.ok(layout.titleVisible && layout.titleText === 'Day 01' && layout.titleTop>=0 && layout.titleBottom<=layout.headerBottom,
      `Real unit title remains rendered at ${width}x${height}: ${JSON.stringify(layout)}`);
    const horizontal = width >= 480 && height <= (width>=960 ? 800 : 650);
    if (horizontal) {
      assert.equal(layout.columns.split(' ').length,2);
      assert.ok(layout.right > layout.left+100, 'Short wide card has side-by-side content');
    } else {
      assert.equal(layout.columns,'none', 'Tall screens keep the original vertical Shorts card');
      assert.ok(Math.abs(layout.cardCenter-width/2)<2,`Vertical Shorts remains centered: ${JSON.stringify(layout)}`);
    }
    const readingTarget = horizontal ? '.swipe-card-details' : '#swipe-card';
    if (process.env.UI_TEST_WEBKIT) {
      await page.locator(readingTarget).evaluate(el => {
        const touch = (type, y) => {
          const event = new Event(type, {bubbles:true});
          Object.defineProperties(event, {touches:{value:type === 'touchend' ? [] : [{clientY:y}]},changedTouches:{value:[{clientY:y}]}});
          el.dispatchEvent(event);
        };
        touch('touchstart',240);
        el.scrollTop += 180;
        touch('touchend',80);
      });
    } else {
      await page.locator(readingTarget).hover();
      await page.mouse.wheel(0,180);
    }
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#swipe-counter').textContent(),'1 / 3', 'Reading scroll does not change the word');
    const scrolled = await page.locator(readingTarget).evaluate(el => el.scrollTop);
    assert.ok(scrolled > 0, 'Long content remains reachable');
    await page.locator('#next-swipe-btn').click();
    await page.waitForTimeout(450);
    assert.equal(await page.locator('#swipe-counter').textContent(),'2 / 3');
    await page.locator('#prev-swipe-btn').click();
    await page.waitForTimeout(450);
    assert.equal(await page.locator('#swipe-counter').textContent(),'1 / 3');
    const touchSwipe = async (direction, crossEdge = false) => {
      await page.locator(readingTarget).evaluate((el,{direction,crossEdge})=>{
        const max=el.scrollHeight-el.clientHeight;
        el.scrollTop=direction>0 ? (crossEdge ? max/2 : max) : 0;
        const emit=(type,y)=>{
          const event=new Event(type,{bubbles:true});
          Object.defineProperties(event,{touches:{value:type==='touchend'?[]:[{clientY:y}]},changedTouches:{value:[{clientY:y}]}});
          el.dispatchEvent(event);
        };
        emit('touchstart',220);
        if (crossEdge) el.scrollTop=max;
        emit('touchend',direction>0 ? 60 : 380);
      },{direction,crossEdge});
      await page.waitForTimeout(450);
    };
    await touchSwipe(1,true);
    assert.equal(await page.locator('#swipe-counter').textContent(),'1 / 3','Reaching the bottom while reading does not turn the word');
    await touchSwipe(1);
    assert.equal(await page.locator('#swipe-counter').textContent(),'2 / 3','A fresh upward gesture at the bottom advances a long card');
    await touchSwipe(-1);
    assert.equal(await page.locator('#swipe-counter').textContent(),'1 / 3','A downward gesture at the top returns to the previous word');
    if (!horizontal) {
      const center=await page.locator('#swipe-card').evaluate(el=>{const r=el.getBoundingClientRect();return (r.left+r.right)/2;});
      assert.ok(Math.abs(center-width/2)<2,`Reading and navigation keep the vertical card centered at ${width}: ${center}`);
    }
    if (process.env.UI_TEST_ARTIFACTS) await page.screenshot({path:path.join(process.env.UI_TEST_ARTIFACTS,`shorts-${width}x${height}.png`)});
    console.log(`PASS adaptive Shorts card, reading scroll and explicit navigation: ${width}x${height}`);
  }
  await page.setViewportSize({width:1366,height:768});
  await page.evaluate(()=>window.uiTest.setViewMode('swipe'));
  await page.waitForTimeout(600);
  await page.locator('.swipe-card-details').evaluate(el=>{
    el.scrollTop=(el.scrollHeight-el.clientHeight)/2;
    el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:180}));
    el.scrollTop=el.scrollHeight;
    el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:180}));
  });
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#swipe-counter').textContent(),'1 / 3','Reading momentum cannot turn a card when it reaches the bottom');
  for (let i=0;i<6;i++) {
    await page.locator('.swipe-card-details').evaluate(el=>el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:180})));
    await page.waitForTimeout(100);
  }
  assert.equal(await page.locator('#swipe-counter').textContent(),'2 / 3','A fresh wheel gesture at the edge advances once, including continued momentum');
  console.log('PASS wheel edge navigation with momentum isolation');
  await page.setViewportSize({width:506,height:898});
  await page.evaluate(() => {window.uiTest.seedStudy(); window.uiTest.setViewMode('swipe');});
  await page.waitForTimeout(600);
  await page.locator('#swipe-card').evaluate(el => {
    const emit = (type, y) => {
      const event = new Event(type,{bubbles:true});
      Object.defineProperties(event,{touches:{value:type==='touchend'?[]:[{clientY:y}]},changedTouches:{value:[{clientY:y}]}});
      el.dispatchEvent(event);
    };
    emit('touchstart',500); emit('touchend',200);
  });
  await page.waitForTimeout(450);
  assert.equal(await page.locator('#swipe-counter').textContent(),'2 / 3','Fitting cards keep the original swipe-to-next gesture');
  console.log('PASS original swipe navigation on cards that fit');
  const safeStyle=await page.addStyleTag({content:':root { --safe-bottom:calc(34px / var(--gui-scale)); }'});
  await page.waitForTimeout(200);
  const safeBottom=await page.locator('#hide-toggle-bar').evaluate(el=>innerHeight-el.getBoundingClientRect().bottom);
  assert.ok(safeBottom>=34,'Mobile GUI scaling preserves the physical home-indicator safe area');
  await safeStyle.evaluate(el=>el.remove());
  for (const [width,height] of [[390,844],[844,390],[1440,900]]) {
    await page.setViewportSize({width,height});
    await page.locator('#start-test-btn').click();
    await page.waitForFunction(() => document.querySelector('#test-modal').classList.contains('show'));
    const setup = await page.locator('#test-modal .test-modal-box').boundingBox();
    assert.ok(setup.height < height, 'Setup remains a sheet before starting');
    await page.locator('#test-start-confirm-btn').click();
    await page.waitForTimeout(350);
    const fullscreen = await page.locator('#test-modal .test-modal-box').boundingBox();
    assert.ok(Math.abs(fullscreen.x)<1 && Math.abs(fullscreen.y)<1 && Math.abs(fullscreen.width-width)<1 && Math.abs(fullscreen.height-height)<1,
      `Started test fills viewport at ${width}: ${JSON.stringify(fullscreen)}`);
    assert.equal(await page.evaluate(() => window.fullscreenFixtureRequests),0, 'Starting a test never requests browser fullscreen');
    if (process.env.UI_TEST_ARTIFACTS) await page.screenshot({path:path.join(process.env.UI_TEST_ARTIFACTS,`test-${width}x${height}.png`)});
    await page.locator('#flashcard').click();
    await page.waitForTimeout(600);
    const actions = await page.locator('#flash-actions').boundingBox();
    assert.ok(actions && actions.y >= 0 && actions.y+actions.height <= height, 'Answer buttons remain inside the filled web viewport');
    await page.locator('#flash-close-btn').click();
    await page.waitForTimeout(450);
    assert.equal(await page.evaluate(() => document.fullscreenElement),null);
    assert.equal(await page.locator('body').evaluate(el => el.classList.contains('test-open')),false);
    console.log(`PASS test setup sheet -> filled web viewport -> clean exit: ${width}x${height}`);
  }
  await page.evaluate(() => { Object.defineProperty(document.documentElement,'requestFullscreen',{configurable:true,value:undefined}); });
  await page.locator('#start-test-btn').click();
  await page.waitForFunction(() => document.querySelector('#test-modal').classList.contains('show'));
  await page.locator('#test-start-confirm-btn').click();
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('test-open')),true);
  await page.locator('#flash-close-btn').click();
  console.log('PASS filled web viewport without browser fullscreen API');
  for (const width of [390,960,1440,1920]) {
    await page.setViewportSize({width,height:900});
    for (const level of ['books','chapters']) {
      await page.evaluate(level => {
        window.uiTest.setViewMode('card');
        if (level==='books') window.uiTest.loadBooks();
        else window.uiTest.loadChapters('book','영어 단어장');
        window.snapshotEntries.at(-1).deliver(Array.from({length:6},(_,i)=>({name:`${level} ${i+1}`})));
      },level);
      await page.waitForTimeout(850);
      const layout=await page.locator(`#view-${level}`).evaluate(el=>{
        const first=el.children[0].getBoundingClientRect(), second=el.children[1].getBoundingClientRect();
        return {firstTop:first.top,secondTop:second.top,firstLeft:first.left,secondLeft:second.left,
          headerHeight:document.querySelector('.ios-nav-bar').getBoundingClientRect().height,
          overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.equal(layout.overflow,false);
      if (width>=960) {
        assert.ok(Math.abs(layout.firstTop-layout.secondTop)<1 && layout.secondLeft>layout.firstLeft,
          `Desktop ${level} uses multiple columns: ${JSON.stringify(layout)}`);
        assert.ok(layout.headerHeight<=64,'Desktop library keeps the single-row header');
      } else {
        assert.ok(layout.secondTop>layout.firstTop,'Mobile library keeps its vertical list');
      }
      if (process.env.UI_TEST_ARTIFACTS) await page.screenshot({path:path.join(process.env.UI_TEST_ARTIFACTS,`${level}-${width}.png`)});
      console.log(`PASS ${level}: restored desktop grid and mobile list at ${width}px`);
    }
  }
};
