// Run ui-regression.cjs with UI_TEST_HIDE_STATE=1 (optionally UI_TEST_WEBKIT=1).
const assert = require('node:assert/strict');

module.exports = async function verifyHideState(page) {
  const results = await page.evaluate(() => {
    const results = [];
    const full = [{word:'apple',meaning:'사과',examples:['This is an apple.'],synonyms:['fruit: 과일']}];
    const state = label => {
      const targets = ['example', 'related'];
      results.push({label, targets:targets.map(target => {
        const button = document.querySelector(`.hide-toggle-btn[data-target="${target}"]`);
        return {target, active:button.classList.contains('active'), pressed:button.getAttribute('aria-pressed'),
          hidden:document.body.classList.contains(`hide-${target}-state`), disabled:button.disabled};
      })});
    };
    window.deferSnapshots = true;
    try {
      window.uiTest.setViewMode('edit'); // Restore the default: all fields shown.
      window.uiTest.loadWords('book', 'first', 'With examples');
      const first = window.snapshotEntries.at(-1);
      first.deliver([]);
      state('empty initial snapshot');
      first.deliver(full);
      state('populated snapshot with synonyms only');
      for (const target of ['example', 'related']) document.querySelector(`.hide-toggle-btn[data-target="${target}"]`).click();
      state('user hides both');
      first.deliver([]);
      first.deliver(full);
      state('refresh preserves hidden preference');
      window.uiTest.loadWords('book', 'second', 'No optional data');
      window.snapshotEntries.at(-1).deliver([{word:'plain',meaning:'단어'}]);
      state('chapter without optional data');
      window.uiTest.loadWords('book', 'third', 'Antonyms only');
      window.snapshotEntries.at(-1).deliver([{word:'cold',meaning:'추운',examples:['It is cold.'],antonyms:['hot: 더운']}]);
      state('antonyms enable the related toggle');
      window.uiTest.setViewMode('edit');
      state('edit resets every representation');
    } finally {
      window.deferSnapshots = false;
    }
    return results;
  });
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const shown = i < 2 || i === 6;
    const disabled = i === 0 || i === 4;
    for (const target of result.targets) {
      assert.equal(target.active, shown, `${result.label}: ${target.target} button`);
      assert.equal(target.pressed, String(shown), `${result.label}: ${target.target} aria-pressed`);
      assert.equal(target.hidden, !shown, `${result.label}: ${target.target} actual mask`);
      assert.equal(target.disabled, disabled, `${result.label}: ${target.target} data availability`);
    }
    console.log(`PASS hide state: ${result.label}`);
  }
};
