// Run against a debuggable APK in an isolated emulator. Forward its WebView
// DevTools socket to localhost:9223 first. Firebase/network calls use fixtures.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');

async function main() {
  const root = path.resolve(__dirname, '..');
  const targets = await (await fetch('http://127.0.0.1:9223/json/list')).json();
  const target = targets.find(target => target.type === 'page' && target.url.startsWith('https://junhyuk1203.github.io/superword/'));
  assert.ok(target, 'The isolated emulator must have the Superword APK open');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, {once:true}));
  let sequence = 0;
  const requests = new Map();
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => {requests.delete(id); reject(new Error(`${method} timed out`));}, 15000);
    requests.set(id, {resolve, reject, timeout});
    socket.send(JSON.stringify({id, method, params}));
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const source = await fs.readFile(path.join(root, 'app.js'), 'utf8');
  const imports = [...source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*"[^"]+";/g)]
    .flatMap(match => match[1].split(',').map(name => name.trim()).filter(Boolean));
  const stubs = 'const ' + imports.map(name => `${name} = ${
    name === 'GoogleAuthProvider' ? 'class {}' :
    name === 'onSnapshot' ? '(_query,next)=>{next({empty:true,size:0,forEach(){}});return ()=>{};}' :
    '(...args)=>({})'
  }`).join(',') + ';';
  const instrumented = stubs + source.replace(/import\s*\{[\s\S]*?\}\s*from\s*"[^"]+";/g, '') + `
    window.nativeFixture = {loadBooks,loadChapters,loadWords,setViewMode,
      motionState(){return {user:!!currentUser,pendingLibraryNavDirection,navFrame,epoch:libraryNavEpoch,snapshot:libraryNavSnapshot,ghost:!!libraryNavGhost};},
      seed(){currentUser={uid:'fixture'};autoPlayPronunciation=false;
        document.querySelector('#landing-screen').classList.add('hidden');
        document.querySelector('#auth-screen').classList.add('hidden');
        document.querySelector('#library-content').classList.remove('hidden');}};`;
  const files = new Map(await Promise.all(['index.html','style.css','logo.png'].map(async file => [file, await fs.readFile(path.join(root,file))])));
  const errors = [];
  let routeError = null;
  socket.addEventListener('message', async event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = requests.get(message.id);
      if (!request) return;
      clearTimeout(request.timeout);
      requests.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    } else if (message.method === 'Fetch.requestPaused') {
      const {requestId,request} = message.params;
      try {
        const url = new URL(request.url);
        const file = url.pathname.replace(/^\/superword\/?/, '') || 'index.html';
        const body = file === 'app.js' ? Buffer.from(instrumented) : files.get(file);
        if (url.hostname === 'junhyuk1203.github.io' && body) {
          const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html';
          await command('Fetch.fulfillRequest', {requestId,responseCode:200,
            responseHeaders:[{name:'Content-Type',value:type},{name:'Cache-Control',value:'no-store'}],body:body.toString('base64')});
        } else await command('Fetch.failRequest', {requestId,errorReason:'Aborted'});
      } catch (error) {routeError = error;}
    }
  });
  try {
    await command('Runtime.enable');
    await command('Page.enable');
    await command('Fetch.enable', {patterns:[{urlPattern:'*'}]});
    await command('Page.navigate', {url:'https://junhyuk1203.github.io/superword/?native-regression'});
    const start = Date.now();
    while (!await evaluate('Boolean(window.nativeFixture)')) {
      if (routeError) throw routeError;
      if (Date.now() - start > 15000) throw new Error(`Fixture did not initialize: ${errors.join('; ')}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('WebView:', JSON.stringify(await evaluate('({ua:navigator.userAgent,width:innerWidth,dpr:devicePixelRatio,scale:visualViewport.scale})')));
    await evaluate('window.nativeFixture.seed()');
    // A headless Android WebView may not start rendering frames until its native
    // view receives focus. Touch only the blank fixture in our isolated emulator.
    const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
    assert.ok(serial.startsWith('emulator-'), 'This test must not control a physical phone');
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
    const adb = process.env.ANDROID_ADB || path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
    execFileSync(adb, ['-s',serial,'shell','input','tap','520','1900']);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>resolve(true)))');
    for (const mode of ['card','swipe']) {
      const result = await evaluate(`(async()=>{
        const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
        nativeFixture.loadChapters('book','모바일 단어장 Words');
        nativeFixture.loadWords('book','chapter','Day 01');
        nativeFixture.setViewMode(${JSON.stringify(mode)});
        await wait(750);
        const started=performance.now();
        document.querySelector('#ios-back-btn').click();
        await wait(220);
        const ghost=document.querySelector('.library-nav-ghost');
        if(!ghost) return {missing:true,elapsed:performance.now()-started,state:nativeFixture.motionState()};
        const title=document.querySelector('#ios-large-title-text');
        const animation=ghost.getAnimations()[0];
        const changingFont=animation.effect.getKeyframes().some(frame=>frame.fontSize!==undefined);
        animation.pause(); animation.currentTime=animation.effect.getTiming().duration-0.001;
        // Simulate a late/stalled native compositor beyond the old 600ms timeout.
        await wait(700);
        const survivedStall=ghost.isConnected && title.classList.contains('library-nav-pending');
        await new Promise(requestAnimationFrame);
        const a=ghost.getBoundingClientRect(),b=title.getBoundingClientRect();
        const ghostRange=document.createRange(),titleRange=document.createRange();
        ghostRange.selectNodeContents(ghost);titleRange.selectNodeContents(title.querySelector('.ios-title-label'));
        const result={dx:Math.abs(a.x-b.x),dy:Math.abs(a.y-b.y),
          glyphWidth:Math.abs(ghostRange.getBoundingClientRect().width-titleRange.getBoundingClientRect().width),
          font:getComputedStyle(ghost).fontSize,targetFont:getComputedStyle(title).fontSize,changingFont,survivedStall};
        animation.play();await wait(160);
        result.visible=getComputedStyle(title).visibility==='visible';
        result.ghosts=document.querySelectorAll('.library-nav-ghost').length;
        return result;
      })()`);
      assert.ok(!result.missing && result.dx < 1 && result.dy < 1 && result.glyphWidth < 1, `${mode} geometry: ${JSON.stringify(result)}`);
      assert.equal(result.font, result.targetFont);
      assert.equal(result.changingFont, false);
      assert.ok(result.survivedStall, 'A stalled native frame cannot trigger an early handoff');
      assert.ok(result.visible && result.ghosts === 0);
      console.log(`PASS native WebView ${mode}: ${JSON.stringify(result)}`);
    }
    assert.deepEqual(errors, [], 'No native WebView JavaScript runtime errors');
    console.log('PASS native WebView runtime and handoff');
  } finally {
    await command('Fetch.disable').catch(()=>{});
    socket.close();
  }
}
main().catch(error => {console.error(error);process.exitCode=1;});
