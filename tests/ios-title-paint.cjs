// Uses the same local Firebase fixtures as ui-regression.cjs. Compare actual
// screenshot pixels; visible DOM bounds alone do not prove WebKit painted text.
const assert = require('node:assert/strict');
const {PNG} = require('pngjs');

module.exports = async function verifyTitlePaint(page) {
  for (const width of [320, 390]) {
    await page.setViewportSize({width, height:900});
    await page.evaluate(async () => {
      window.uiTest.loadBooks();
      await new Promise(requestAnimationFrame);
      document.getAnimations().forEach(animation => {
        if (Number.isFinite(animation.effect.getComputedTiming().endTime)) animation.finish();
        else animation.pause();
      });
      await new Promise(requestAnimationFrame);
    });
    for (const level of ['chapters', 'words']) {
      await page.evaluate(level => {
        if (level === 'chapters') window.uiTest.loadChapters('book', '워드마스터 고등');
        else window.uiTest.loadWords('book', 'chapter', '22');
      }, level);
      await page.waitForFunction(() => document.querySelector('.library-nav-ghost')?.getAnimations().length > 0);
      await page.evaluate(() => {
        document.getAnimations().forEach(animation => animation.pause());
      });
      for (const time of [0, 120, 300, 519]) {
        await page.evaluate(async time => {
          document.querySelector('.library-nav-ghost').getAnimations()[0].currentTime = time;
          await new Promise(requestAnimationFrame);
        }, time);
        const options = {clip:{x:0,y:0,width,height:210}, animations:'allow'};
        const painted = PNG.sync.read(await page.screenshot(options));
        await page.evaluate(() => { document.querySelector('.library-nav-ghost').style.visibility = 'hidden'; });
        const baseline = PNG.sync.read(await page.screenshot(options));
        await page.evaluate(() => { document.querySelector('.library-nav-ghost').style.visibility = ''; });
        let changed = 0;
        for (let i = 0; i < painted.data.length; i += 4) {
          if (Math.abs(painted.data[i]-baseline.data[i]) + Math.abs(painted.data[i+1]-baseline.data[i+1]) +
              Math.abs(painted.data[i+2]-baseline.data[i+2]) > 40) changed++;
        }
        assert.ok(changed > 100, `Moving title must paint pixels: ${width}px ${level} at ${time}ms, changed=${changed}`);
        console.log(`PASS title pixels: ${width}px ${level} ${time}ms (${changed} pixels)`);
      }
      await page.evaluate(() => {
        document.getAnimations().forEach(animation => {
          if (Number.isFinite(animation.effect.getComputedTiming().endTime)) animation.finish();
        });
      });
      await page.waitForFunction(() => !document.querySelector('.library-nav-pending') && !document.querySelector('.library-nav-ghost'));
      const options = {clip:{x:0,y:0,width,height:210}, animations:'allow'};
      const landed = PNG.sync.read(await page.screenshot(options));
      await page.evaluate(() => { document.querySelector('#ios-back-text').style.opacity = '0'; });
      const withoutLabel = PNG.sync.read(await page.screenshot(options));
      await page.evaluate(() => { document.querySelector('#ios-back-text').style.opacity = ''; });
      let labelPixels = 0;
      for (let i = 0; i < landed.data.length; i += 4) {
        if (Math.abs(landed.data[i]-withoutLabel.data[i]) + Math.abs(landed.data[i+1]-withoutLabel.data[i+1]) +
            Math.abs(landed.data[i+2]-withoutLabel.data[i+2]) > 40) labelPixels++;
      }
      assert.ok(labelPixels > 100, `Real back label must paint after proxy removal: ${width}px ${level}, pixels=${labelPixels}`);
      console.log(`PASS landed back-label pixels: ${width}px ${level} (${labelPixels} pixels)`);
    }
  }
};
