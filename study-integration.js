import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithPopup,signInWithEmailAndPassword,GoogleAuthProvider,signOut,onIdTokenChanged} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';
import {getFirestore,doc,setDoc,collection,query,orderBy,limit,getDocs,onSnapshot,documentId} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import {AutoStudyTimer,isLearning,localApi,todayStudySeconds,studyUuid} from './study-timer-core.js?v=20261022-5';
import {wordLiveSeconds} from './study-word-time.js?v=20261022-1';

const config={apiKey:'AIzaSyBF8-jNyMdm1izozV2S5OoB6KtnIQ716Yw',authDomain:'study-junhyuk1203-20261021.firebaseapp.com',projectId:'study-junhyuk1203-20261021',appId:'1:555183292594:web:64b739b20ca4b32d63c9ab'};
const studyApp=getApps().find(app=>app.name==='study-integration') ?? initializeApp(config,'study-integration');
const studyAuth=getAuth(studyApp), wordAuth=getAuth(getApp());
const wordDb=getFirestore(getApp());
const studyDb=getFirestore(studyApp,'study-data');
const functions=getFunctions(studyApp,'asia-northeast3');
const call=async(name,data)=>(await httpsCallable(functions,name)(data)).data;
const library=document.getElementById('library-content');
const panel=document.createElement('section');
panel.className='study-link-panel';
panel.setAttribute('aria-label','스터디 연동 설정');
panel.innerHTML=`<div class="study-link-summary"><div><strong>스터디 연동</strong><p data-study-link-account>단어앱 기록에 자동 저장</p></div></div><p data-study-link-status role="status">단어 카드나 테스트를 열면 자동으로 시간을 측정합니다.</p><div class="study-link-actions"><button type="button" data-study-connect>스터디 계정 연결</button><button type="button" data-study-disconnect hidden>연동 해제</button><a href="https://junhyuk1203.github.io/study/study.html" target="_blank" rel="noopener">스터디 기록 ↗</a></div><p class="study-link-help">단어와 테스트 학습시간이 합산됩니다. 설정·기록 화면이나 10초 무입력 시 일시정지하고, 다시 학습하면 이어서 측정합니다. 앱을 나가면 자동 저장·종료됩니다.</p>`;
document.querySelector('#settings-modal .sheet-header').nextElementSibling.firstElementChild.after(panel);
const timeCapsule=document.createElement('output');
timeCapsule.className='study-time-capsule';
timeCapsule.dataset.studyLinkTime='';
timeCapsule.setAttribute('aria-label','오늘 학습 시간');
timeCapsule.textContent='00:00:00';
const dialog=document.createElement('dialog');
dialog.className='study-link-dialog';
dialog.setAttribute('aria-label','스터디 서비스 연동');
dialog.innerHTML=`<form method="dialog"><button class="study-link-close" aria-label="닫기">×</button></form><h2>스터디 서비스 연동</h2><p>시간을 저장할 기존 스터디 계정으로 로그인하세요.</p><button type="button" data-study-google>Google로 연결</button><form data-study-email-form><label>스터디 이메일<input name="email" type="email" autocomplete="email" required></label><label>비밀번호<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">이메일로 연결</button></form><p data-study-login-error role="alert"></p>`;
document.body.append(dialog);
const recordsButton=document.createElement('button');
recordsButton.id='study-records-btn';recordsButton.className='ios-nav-action-btn';recordsButton.type='button';recordsButton.title='학습 기록';recordsButton.setAttribute('aria-label','학습 기록');
recordsButton.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 20V10m8 10V4m8 16v-7" stroke-linecap="round"/></svg>';
document.getElementById('settings-btn').before(recordsButton);
recordsButton.before(timeCapsule);
const recordsDialog=document.createElement('dialog');recordsDialog.className='study-link-dialog study-records-dialog';
recordsDialog.setAttribute('aria-label','학습 기록');
recordsDialog.innerHTML='<form method="dialog"><button class="study-link-close" aria-label="기록 닫기">×</button></form><h2>학습 기록</h2><p>단어앱에서 자동 측정한 영단어 학습시간입니다.</p><div class="study-record-totals"><div>오늘<strong data-record-today>0분</strong></div><div>이번 주<strong data-record-week>0분</strong></div></div><p data-record-status role="status"></p><div data-record-days></div>';
document.body.append(recordsDialog);
const recordMode=document.createElement('button');recordMode.type='button';recordMode.textContent='이전 기기 기록 보기';recordMode.hidden=true;recordsDialog.querySelector('h2').after(recordMode);
const $=selector=>panel.querySelector(selector);
let tracker,linkedTracker,context='',linkedContext='',lastActivity=performance.now(),wordUid=null,ready=false,studyReady=false,token='',message='',outboxBusy=false,focused=document.hasFocus();
let linkedStats={key:'',subjectId:null,today:null,days:{},word:null,clock:null,error:''},linkedWatches=[],showDeviceRecords=false;
function linkedSeconds(){
  if(!linkedStats.today||!linkedStats.subjectId)return null;
  const clock=linkedStats.clock,now=clock?clock.serverMs+Math.max(0,performance.now()-clock.localMs):Date.now();
  return (linkedStats.today.subjectSeconds?.[linkedStats.subjectId]||0)+wordLiveSeconds(linkedStats.today,linkedStats.word,'day',dateKey(),now);
}
function watchLinkedStats(){
  if(!studyReady)return;
  const user=studyAuth.currentUser,key=user?.emailVerified?`${user.uid}:${dateKey()}`:'';
  if(key===linkedStats.key)return;
  for(const stop of linkedWatches)stop();linkedWatches=[];
  linkedStats={key,subjectId:null,today:null,days:{},word:null,clock:null,error:''};
  if(!key)return;
  const changed=()=>{paint();if(recordsDialog.open)renderRecords();};
  const failed=()=>{linkedStats.error='스터디 연동 기록을 불러오지 못했습니다. 연결을 확인해 주세요.';changed();};
  linkedWatches.push(onSnapshot(doc(studyDb,'users',user.uid),snapshot=>{
    if(linkedStats.key!==key)return;
    const profile=snapshot.data()||{},word=profile.wordSnapshot||null;
    if(word?.serverNowMs!==linkedStats.word?.serverNowMs)linkedStats.clock=word?{serverMs:word.serverNowMs,localMs:performance.now()}:null;
    linkedStats.subjectId=profile.subjects?.find(row=>row.name==='영단어')?.id||word?.subjectId||null;
    linkedStats.word=word;changed();
  },failed));
  linkedWatches.push(onSnapshot(doc(studyDb,'users',user.uid,'dailyStats',dateKey()),snapshot=>{
    if(linkedStats.key!==key)return;
    linkedStats.today=snapshot.data()||{};linkedStats.days[dateKey()]=linkedStats.today;linkedStats.error='';changed();
  },failed));
}
function appVisible(){return !document.hidden && focused && document.hasFocus();}
const tabKey='superword:study-tab';
const tabId=sessionStorage.getItem(tabKey)||studyUuid();sessionStorage.setItem(tabKey,tabId);
function storage(key) {
  return {read(){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}},write(value){if(value==null)localStorage.removeItem(key);else localStorage.setItem(key,JSON.stringify(value));}};
}
function learning() {
  const shown=id=>{const node=document.getElementById(id);return node && !node.classList.contains('hidden');};
  const test=shown('test-modal') && ['test-flash','test-quiz','test-short','test-trace'].some(shown);
  const blocked=[...document.querySelectorAll('.modal-screen.show,.modal-screen:not(.hidden)')].some(node=>node.id!=='test-modal') || dialog.open || recordsDialog.open;
  const words=document.getElementById('layer-words')?.classList.contains('active-lib') && !shown('test-modal') && ['words-card-view','words-swipe-view'].some(id=>document.getElementById(id)?.classList.contains('active-view')) && document.querySelector('#words-card-view .word-card,#words-swipe-view .swipe-card');
  return isLearning({visible:appVisible(),signedIn:Boolean(wordUid),words:Boolean(words),test,blocked,idleMs:performance.now()-lastActivity});
}
function paint() {
  const linked=Boolean(studyAuth.currentUser?.emailVerified);
  $('[data-study-link-account]').textContent=linked?`스터디: ${studyAuth.currentUser.email}`:'단어앱 기록에 자동 저장';
  $('[data-study-connect]').hidden=linked;
  $('[data-study-disconnect]').hidden=!studyAuth.currentUser;
  $('[data-study-disconnect]').disabled=Boolean(linkedTracker?.busy);
  const seconds=linked?linkedSeconds():todayStudySeconds(storage(`superword:history:${wordUid}`).read()||{},tracker?.session,tracker?.record?.sessionId);
  timeCapsule.textContent=seconds==null?'--:--:--':[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
  timeCapsule.setAttribute('aria-label',linked?'오늘 영단어 연동 시간':'오늘 학습 시간');
  timeCapsule.classList.toggle('is-running',Boolean(linked?linkedStats.word?.activeSinceMs!=null&&linkedStats.word.leaseUntilMs>Date.now():tracker?.session&&tracker.desired));
  recordMode.hidden=!linked;
  $('[data-study-link-status]').textContent=message || linkedStats.error || linkedTracker?.error || tracker?.error || (tracker?.busy&&!tracker?.desired?'학습 시간을 저장하는 중…':tracker?.session?tracker.desired?(linked?'학습 중 · 스터디 영단어 시간에 연동':'학습 중 · 단어앱에 기록'):'학습 일시정지 · 단어로 돌아오면 이어서 측정합니다.':tracker?.lastSaved!=null?`${tracker.lastSaved}초 단어앱에 기록 완료`:'단어 카드나 테스트를 열면 자동으로 시간을 측정합니다.');
}
function makeTracker() {
  if(!ready || !studyReady)return;
  const user=studyAuth.currentUser;
  const linked=Boolean(user?.emailVerified),next=wordUid||'guest';
  if(next!==context) {
    void tracker?.finish();context=next;
    const uid=wordUid;
    tracker=new AutoStudyTimer({store:storage(`superword:study:${next}:${tabId}:local`),api:localApi(storage(`superword:study-local:${next}:${tabId}`),()=>Date.now(),row=>saveHistory(uid,row)),onChange:paint});
    if(tracker.record)void tracker.update(false);
  }
  const remoteContext=linked&&wordUid?`${wordUid}:${user.uid}`:'';
  if(remoteContext===linkedContext)return;
  void linkedTracker?.finish();linkedTracker=null;linkedContext=remoteContext;
  if(!remoteContext){paint();return;}
  const store=storage(`superword:study:${remoteContext}:${tabId}:remote`);
  const owner=user?.uid;
  const guarded=(name,data)=>{
    if(studyAuth.currentUser?.uid!==owner)throw new Error('연동 계정이 변경되었습니다. 이전 계정으로 다시 연결하면 기록을 복구합니다.');
    return call(name,data);
  };
  const api={
    async start(record){
      if(record.sessionId)return guarded('syncWordStudy',{...record,sequence:Date.now(),tracking:false,present:appVisible()}).catch(async error=>{
        if(error.code!=='functions/failed-precondition')throw error;
        await guarded('finishStudySession',record);
        return guarded('startWordStudy',record);
      });
      const name=(user.displayName||'회원').replace(/[\p{Cc}\p{Cf}]/gu,'').trim().slice(0,20);
      await guarded('ensureProfile',{displayName:name.length>=2?name:'회원'});
      return guarded('startWordStudy',record);
    },
    sync:record=>guarded('syncWordStudy',{...record,present:appVisible()&&Boolean(wordUid)}),finish:record=>guarded('finishStudySession',record)
  };
  linkedTracker=new AutoStudyTimer({api,store,onChange:paint,keepAlive:true});
  // Recover the saved session paused, then resume when a learning view is visible.
  if(linkedTracker.record)void linkedTracker.update(false,!appVisible());else void linkedTracker.update(learning(),!appVisible());
  paint();
}
function tick(){watchLinkedStats();makeTracker();const active=learning();void tracker?.update(active,!appVisible());void linkedTracker?.update(active,!appVisible());paint();}
for(const type of ['pointerdown','pointermove','keydown','input','wheel','touchstart'])document.addEventListener(type,event=>{if(event.isTrusted)lastActivity=performance.now();},{capture:true,passive:true});
const observer=new MutationObserver(()=>{const active=learning();void tracker?.update(active,!appVisible());void linkedTracker?.update(active,!appVisible());});
observer.observe(library,{attributes:true,attributeFilter:['class'],subtree:true});
for(const id of ['test-modal','test-flash','test-quiz','test-short','test-trace','test-setup','test-result']){
  const node=document.getElementById(id);if(node)observer.observe(node,{attributes:true,attributeFilter:['class']});
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)lastActivity=performance.now();tick();});
window.addEventListener('blur',()=>{focused=false;tick();});
window.addEventListener('focus',()=>{focused=true;lastActivity=performance.now();tick();});
function keepaliveFinish() {
  const record=linkedTracker?.record;
  if(!record?.sessionId || !token || !studyAuth.currentUser?.emailVerified || !linkedContext.endsWith(`:${studyAuth.currentUser.uid}`))return;
  // The callable HTTP protocol works with keepalive during mobile page teardown.
  // Pending storage remains until the server confirms completion on the next visit.
  void fetch(`https://asia-northeast3-${config.projectId}.cloudfunctions.net/finishStudySession`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({data:{sessionId:record.sessionId}}),keepalive:true}).catch(()=>{});
}
window.addEventListener('pagehide',()=>{keepaliveFinish();void tracker?.finish();void linkedTracker?.finish();});
window.addEventListener('pageshow',()=>{lastActivity=performance.now();tick();});
onIdTokenChanged(studyAuth,async user=>{try{token=user?await user.getIdToken():'';}catch{token='';}});
onAuthStateChanged(wordAuth,user=>{wordUid=user?.emailVerified?(user.email==='tntgame1203@gmail.com'?'default_user':user.uid):null;ready=true;makeTracker();});
onAuthStateChanged(studyAuth,()=>{studyReady=true;watchLinkedStats();makeTracker();paint();});
$('[data-study-connect]').addEventListener('click',()=>dialog.showModal());
dialog.addEventListener('close',()=>{lastActivity=performance.now();tick();});
async function login(action) {
  const errorNode=dialog.querySelector('[data-study-login-error]');errorNode.textContent='연결 중…';
  try {
    await linkedTracker?.finish();
    await action();
    if(!studyAuth.currentUser.emailVerified)throw new Error('스터디 계정의 이메일을 먼저 인증해 주세요.');
    errorNode.textContent='';dialog.querySelector('[name=password]').value='';dialog.close();message='';
  }catch(error){errorNode.textContent=error.code==='auth/invalid-credential'?'이메일과 비밀번호를 확인해 주세요.':error.code==='auth/unauthorized-domain'?'현재 단어앱 주소에서 스터디 로그인이 허용되지 않습니다.':error.message;}
}
dialog.querySelector('[data-study-google]').addEventListener('click',()=>{
  // Open the popup in the click task, before any asynchronous save can block it.
  const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
  const pending=signInWithPopup(studyAuth,provider);void login(()=>pending);
});
dialog.querySelector('[data-study-email-form]').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;void login(()=>signInWithEmailAndPassword(studyAuth,form.email.value,form.password.value));});
$('[data-study-disconnect]').addEventListener('click',async()=>{
  try {await linkedTracker?.finish();if(linkedTracker?.record)throw new Error('기록 저장이 끝난 뒤 연동을 해제할 수 있습니다.');await signOut(studyAuth);message='';}
  catch(error){message=error.message;paint();}
});
setInterval(tick,1000);

function saveHistory(uid,row) {
  if(!uid || row.seconds<=0)return;
  const cache=storage(`superword:history:${uid}`),rows=cache.read()||{};
  rows[row.id]=row;
  const recent=Object.fromEntries(Object.values(rows).sort((a,b)=>b.startedAtMs-a.startedAtMs).slice(0,500).map(item=>[item.id,item]));
  cache.write(recent);
  const pending=storage(`superword:history-outbox:${uid}`),outbox=pending.read()||{};outbox[row.id]=row;pending.write(outbox);
  void flushHistory();
}
async function flushHistory() {
  const uid=wordUid;if(!uid || outboxBusy || !navigator.onLine)return;
  outboxBusy=true;
  try {
    const pending=storage(`superword:history-outbox:${uid}`);
    for(const row of Object.values(pending.read()||{}).slice(0,20)) {
      if(wordUid!==uid)break;
      await setDoc(doc(wordDb,'users',uid,'learningSessions',row.id),row);
      const latest=pending.read()||{};
      if(JSON.stringify(latest[row.id])===JSON.stringify(row)){delete latest[row.id];pending.write(latest);}
    }
  }catch{}finally{outboxBusy=false;}
}
const dateKey=()=>new Date(Date.now()+32400000).toISOString().slice(0,10);
const minutes=seconds=>seconds>0&&seconds<60?`${Math.floor(seconds)}초`:`${Math.floor(seconds/3600)}시간 ${Math.floor(seconds%3600/60)}분`;
function renderRecords() {
  const rows=Object.values(storage(`superword:history:${wordUid}`).read()||{}),days={};
  const linked=Boolean(studyAuth.currentUser?.emailVerified)&&!showDeviceRecords;
  if(linked){for(const [date,stats]of Object.entries(linkedStats.days))days[date]=stats.subjectSeconds?.[linkedStats.subjectId]||0;days[dateKey()]=linkedSeconds()||0;}
  else for(const row of rows)for(const [date,seconds]of Object.entries(row.dailySeconds||{}))days[date]=(days[date]||0)+seconds;
  recordMode.textContent=showDeviceRecords?'스터디 연동 기록 보기':'기기 자체 기록 보기';
  const today=dateKey(),monday=new Date(`${today}T00:00:00Z`);monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);const week=monday.toISOString().slice(0,10);
  recordsDialog.querySelector('[data-record-today]').textContent=minutes(days[today]||0);
  recordsDialog.querySelector('[data-record-week]').textContent=minutes(Object.entries(days).filter(([date])=>date>=week&&date<=today).reduce((sum,[,seconds])=>sum+seconds,0));
  const list=recordsDialog.querySelector('[data-record-days]');list.replaceChildren();
  for(const [date,seconds]of Object.entries(days).sort(([a],[b])=>b.localeCompare(a))) {
    const row=document.createElement('div');row.className='study-record-row';
    const label=document.createElement('span');label.textContent=date;
    const value=document.createElement('strong');value.textContent=minutes(seconds);row.append(label,value);list.append(row);
  }
  if(!list.children.length)list.textContent='아직 학습 기록이 없습니다. 단어 카드나 테스트를 열어 보세요.';
}
recordsButton.addEventListener('click',async()=>{
  showDeviceRecords=false;recordsDialog.showModal();void tracker?.update(false);void linkedTracker?.update(false);renderRecords();
  const status=recordsDialog.querySelector('[data-record-status]'),uid=wordUid;status.textContent='계정 기록을 불러오는 중…';
  try {
    await flushHistory();
    if(studyAuth.currentUser?.emailVerified){
      const linkedUid=studyAuth.currentUser.uid,result=await getDocs(query(collection(studyDb,'users',linkedUid,'dailyStats'),orderBy(documentId(),'desc'),limit(50)));
      if(studyAuth.currentUser?.uid!==linkedUid)return;
      linkedStats.days={...Object.fromEntries(result.docs.map(row=>[row.id,row.data()])),[dateKey()]:linkedStats.today||{}};
      renderRecords();status.textContent='스터디와 동일한 영단어 연동 기록 · 최근 50일';return;
    }
    const result=await getDocs(query(collection(wordDb,'users',uid,'learningSessions'),orderBy('startedAtMs','desc'),limit(500)));
    if(uid!==wordUid)return;
    const cache=storage(`superword:history:${uid}`),rows=cache.read()||{};
    for(const record of result.docs){const remote=record.data();if(!rows[record.id]||remote.updatedAtMs>=rows[record.id].updatedAtMs)rows[record.id]=remote;}
    cache.write(rows);renderRecords();status.textContent=Object.keys(storage(`superword:history-outbox:${uid}`).read()||{}).length?'기기 기록 표시 중 · 계정 저장을 재시도합니다.':'최근 학습 500회 기준 · 계정에 저장된 기록입니다.';
  }catch{status.textContent='이 기기에 남은 기록입니다. 계정 기록을 불러오지 못했습니다.';}
});
recordMode.addEventListener('click',()=>{showDeviceRecords=!showDeviceRecords;renderRecords();recordsDialog.querySelector('[data-record-status]').textContent=showDeviceRecords?'연동 전·오프라인을 포함한 기기 자체 기록입니다. 스터디 적립 시간과 구분됩니다.':'스터디와 동일한 영단어 연동 기록입니다.';});
recordsDialog.addEventListener('close',()=>{lastActivity=performance.now();tick();});
window.addEventListener('online',()=>{void flushHistory();tick();});
setInterval(()=>{void flushHistory();},20000);
