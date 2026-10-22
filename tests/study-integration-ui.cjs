// NODE_PATH must include Playwright. Local SDK fixtures never touch live accounts.
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
async function main(){
  const root=path.resolve(__dirname,'..');
  const html=(await fs.readFile(path.join(root,'index.html'),'utf8')).replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  const css=await fs.readFile(path.join(root,'style.css'),'utf8')+'\n'+await fs.readFile(path.join(root,'study-integration.css'),'utf8');
  const core=(await fs.readFile(path.join(root,'study-timer-core.js'),'utf8')).replace(/^export /gm,'');
  const shared=(await fs.readFile(path.join(root,'study-word-time.js'),'utf8')).replace(/^export /gm,'');
  const source=(await fs.readFile(path.join(root,'study-integration.js'),'utf8')).replace(/^import .*;\r?\n/gm,'');
  const browser=await chromium.launch({headless:true,executablePath:process.env.UI_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    for(const width of [320,390,1280]){
      const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>route.request().url()==='http://word.test:8765/'?route.fulfill({contentType:'text/html',body:html}):route.abort());
      await page.goto('http://word.test:8765/');await page.addStyleTag({content:css});
      assert.equal(await page.evaluate(()=>window.isSecureContext),false);
      assert.equal(await page.evaluate(()=>typeof crypto.randomUUID),'undefined');
      await page.evaluate(width=>{
        document.getElementById('landing-screen').classList.add('hidden');document.getElementById('library-content').classList.remove('hidden');
        document.getElementById('layer-books').classList.remove('active-lib');document.getElementById('layer-words').classList.add('active-lib');
        document.getElementById('words-card-view').innerHTML='<div class="word-card">apple 사과</div>';
        window.testNow=Date.parse('2026-10-22T03:00:00Z');Date.now=()=>window.testNow;window.testPerformanceNow=1000;performance.now=()=>window.testPerformanceNow;window.savedRows={};window.testLinked=width===1280;window.remoteCalls=[];
        if(width===1280)localStorage.setItem('superword:history:fixture',JSON.stringify({legacy:{id:'legacy',startedAtMs:window.testNow-1800000,seconds:480,dailySeconds:{'2026-10-22':480},status:'finished'}}));
      },width);
      const sdk=`
        const apps=[{name:'word'}],getApps=()=>apps,getApp=()=>apps[0],initializeApp=(_,name)=>{const app={name};apps.push(app);return app;};
        const getAuth=app=>({kind:app.name,currentUser:null}),getFunctions=()=>({});
        const subscriptions=[];let serverStats={subjectSeconds:{vocab:0}},serverWord=null,sessionNumber=0;
        const deliver=()=>{for(const item of subscriptions)if(!item.stopped)item.callback({data:()=>item.path.includes('dailyStats')?serverStats:{subjects:[{id:'vocab',name:'영단어'}],wordSnapshot:serverWord}});};
        const httpsCallable=(_,name)=>async data=>{
          window.remoteCalls.push(name);(window.remoteInputs||=[]).push({name,data});
          if(name==='startWordStudy'){serverWord={sessionId:'remote-session-'+(++sessionNumber),subjectId:'vocab',sequence:0,segments:[],serverNowMs:Date.now(),accumulatedSeconds:0,activeSinceMs:null,leaseUntilMs:null};deliver();return {data:{sessionId:serverWord.sessionId,session:{...serverWord}}};}
          if(name==='syncWordStudy'||name==='finishStudySession'){
            const delta=serverWord?.activeSinceMs==null?0:Math.max(0,Math.floor((Math.min(Date.now(),serverWord.leaseUntilMs)-serverWord.activeSinceMs)/1000));
            if(serverWord){serverWord.accumulatedSeconds+=delta;serverWord.segments=[{date:'2026-10-22',seconds:serverWord.accumulatedSeconds}];serverStats={subjectSeconds:{vocab:serverStats.subjectSeconds.vocab+delta},wordCheckpoint:{sessionId:serverWord.sessionId,seconds:serverWord.accumulatedSeconds}};}
            if(name==='finishStudySession'){const seconds=serverWord?.accumulatedSeconds||0;serverWord=null;deliver();return {data:{creditedSeconds:seconds}};}
            Object.assign(serverWord,{sequence:data.sequence,serverNowMs:Date.now(),activeSinceMs:data.tracking?Date.now():null,leaseUntilMs:data.tracking?Date.now()+30000:null});deliver();return {data:{sessionId:serverWord.sessionId,session:{...serverWord}}};
          }
          return {data:{creditedSeconds:10}};
        };
        const getFirestore=()=>({}),doc=(_, ...parts)=>parts.join('/'),setDoc=async(key,row)=>{window.savedRows[row.id]=row;},collection=(_, ...parts)=>parts.join('/'),query=path=>({path}),orderBy=()=>({}),limit=()=>({}),documentId=()=>'__name__',getDocs=async input=>({docs:input.path?.includes('dailyStats')?[{id:'2026-10-22',data:()=>serverStats}]:Object.entries(window.savedRows).map(([id,row])=>({id,data:()=>row}))}),onSnapshot=(path,callback)=>{const item={path,callback,stopped:false};subscriptions.push(item);queueMicrotask(deliver);return ()=>{item.stopped=true;};};
        const onIdTokenChanged=(_,cb)=>queueMicrotask(()=>cb(null)),onAuthStateChanged=(auth,cb)=>queueMicrotask(()=>{
          const user=auth.kind==='word'?{uid:'fixture',email:'fixture@example.com',emailVerified:true}:window.testLinked?{uid:'study-fixture',email:'study@example.com',emailVerified:true}:null;
          auth.currentUser=user;cb(user);
        });
        const signInWithPopup=async()=>{},signInWithEmailAndPassword=async()=>{},GoogleAuthProvider=class{},signOut=async()=>{};
      `;
      await page.addScriptTag({type:'module',content:sdk+'\n'+core+'\n'+shared+'\n'+source});
      await page.waitForFunction(()=>document.querySelector('[data-study-link-status]')?.textContent.includes('학습 중')).catch(async error=>{throw new Error(JSON.stringify({errors,status:await page.locator('[data-study-link-status]').textContent(),cause:error.message}));});
      assert.equal(await page.locator('.study-link-panel').evaluate(node=>node.closest('#settings-modal')?.id),'settings-modal');
      assert.equal(await page.locator('.study-time-capsule').evaluate(node=>Boolean(node.closest('.ios-nav-actions'))),true);
      assert.equal(await page.locator('#library-content .study-link-panel').count(),0);
      const capsule=await page.locator('.study-time-capsule').boundingBox();assert.ok(capsule.height<=28&&capsule.x>=0&&capsule.x+capsule.width<=width);
      await page.evaluate(()=>{window.testNow+=10000;});
      assert.equal(await page.locator('#study-records-btn').evaluate(node=>node.nextElementSibling.id),'settings-btn');
      await page.locator('#study-records-btn').click();
      await page.waitForFunction(()=>document.querySelector('[data-record-today]')?.textContent==='10초');
      if(width===1280) {
        await page.waitForFunction(()=>window.remoteInputs.some(row=>row.name==='syncWordStudy'&&row.data.tracking===false));
        assert.equal(await page.evaluate(()=>window.remoteCalls.includes('finishStudySession')),false);
        assert.ok((await page.evaluate(()=>window.remoteCalls)).includes('syncWordStudy'));
        assert.equal(await page.locator('[data-study-link-account]').textContent(),'스터디: study@example.com');
      }
      assert.equal(await page.locator('[data-record-week]').textContent(),'10초');
      if(width===1280){
        await page.getByRole('button',{name:'기기 자체 기록 보기'}).click();
        assert.equal(await page.locator('[data-record-today]').textContent(),'0시간 8분');
        await page.getByRole('button',{name:'스터디 연동 기록 보기'}).click();
        assert.equal(await page.locator('[data-record-today]').textContent(),'10초');
      }
      assert.equal(await page.locator('.study-record-row').count(),1);
      const box=await page.locator('.study-records-dialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);
      await page.screenshot({path:path.join(process.env.UI_TEST_OUTPUT||require('node:os').tmpdir(),`study-records-${width}.png`),fullPage:false});
      await page.locator('[aria-label="기록 닫기"]').click();
      await page.waitForFunction(()=>document.querySelector('[data-study-link-status]')?.textContent.includes('학습 중'));
      await page.screenshot({path:path.join(process.env.UI_TEST_OUTPUT||require('node:os').tmpdir(),`study-capsule-${width}.png`),fullPage:false});
      await page.evaluate(()=>{document.getElementById('settings-modal').classList.remove('hidden');document.getElementById('settings-modal').classList.add('show');});
      await page.waitForFunction(()=>document.querySelector('[data-study-link-status]')?.textContent.includes('일시정지'));
      assert.equal(await page.locator('.study-link-panel').isVisible(),true);
      if(width!==1280) {
        await page.locator('[data-study-connect]').click();
        assert.equal(await page.locator('[aria-label="스터디 서비스 연동"]').evaluate(node=>node.open),true);
        await page.locator('[aria-label="스터디 서비스 연동"] [aria-label="닫기"]').click();
      }
      await page.screenshot({path:path.join(process.env.UI_TEST_OUTPUT||require('node:os').tmpdir(),`study-link-settings-${width}.png`),fullPage:false});
      await page.evaluate(()=>{document.getElementById('settings-modal').classList.add('hidden');document.getElementById('settings-modal').classList.remove('show');});
      await page.waitForFunction(()=>document.querySelector('[data-study-link-status]')?.textContent.includes('학습 중'));
      await page.evaluate(()=>{document.getElementById('layer-words').classList.remove('active-lib');});
      await page.waitForFunction(()=>document.querySelector('[data-study-link-status]')?.textContent.includes('일시정지'));
      assert.equal(await page.locator('.study-time-capsule').textContent(),'00:00:10');
      for(const mode of ['test-flash','test-quiz','test-short','test-trace']) {
        await page.evaluate(mode=>{
          const modal=document.getElementById('test-modal');modal.classList.remove('hidden');modal.classList.add('show');
          for(const id of ['test-setup','test-result','test-flash','test-quiz','test-short','test-trace'])document.getElementById(id).classList.toggle('hidden',id!==mode);
        },mode);
        await page.waitForFunction(()=>document.querySelector('[data-study-link-status]')?.textContent.includes('학습 중'));
        await page.evaluate(()=>{window.testNow+=1000;});
      }
      await page.evaluate(()=>{document.getElementById('test-modal').classList.add('hidden');document.getElementById('test-modal').classList.remove('show');});
      await page.waitForFunction(()=>document.querySelector('[data-study-link-status]')?.textContent.includes('일시정지'));
      assert.equal(await page.locator('.study-time-capsule').textContent(),'00:00:14');
      await page.evaluate(()=>{document.getElementById('layer-words').classList.add('active-lib');});
      await page.locator('.study-time-capsule').click();
      await page.waitForFunction(()=>document.querySelector('[data-study-link-status]')?.textContent.includes('학습 중'));
      await page.evaluate(()=>{window.testNow+=10000;window.testPerformanceNow+=10000;});
      await page.waitForFunction(()=>document.querySelector('[data-study-link-status]')?.textContent.includes('일시정지'));
      assert.equal(await page.locator('.study-time-capsule').textContent(),'00:00:24');
      await page.evaluate(()=>{window.testNow+=60000;});
      await page.locator('.study-time-capsule').click();
      await page.waitForFunction(()=>document.querySelector('[data-study-link-status]')?.textContent.includes('학습 중'));
      assert.equal(await page.locator('.study-time-capsule').textContent(),'00:00:24');
      await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
      await page.waitForFunction(()=>document.querySelector('[data-study-link-status]')?.textContent.includes('기록 완료'));
      await page.evaluate(()=>{window.testNow+=5000;window.dispatchEvent(new Event('blur'));});
      assert.equal(await page.locator('.study-time-capsule').textContent(),'00:00:24');
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await page.waitForFunction(()=>document.querySelector('[data-study-link-status]')?.textContent.includes('학습 중'));
      assert.equal(await page.locator('.study-time-capsule').textContent(),'00:00:24');
      assert.deepEqual(errors,[]);await page.close();console.log(`PASS ${width}px: settings-left records, automatic start/stop, date totals, dialog layout, no page errors`);
    }
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
