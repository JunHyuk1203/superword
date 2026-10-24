import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {AutoStudyTimer} from '../study-timer-core.js';

test('late start on an old account drains with its captured credential before creating the next timer',async()=>{
  const source=await readFile(new URL('../study-integration.js',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('function makeTracker()'),source.indexOf('async function persistConnection()'));
  let release,active=true,credentialVersion=0;const stores=new Map(),requests=[],finishes=[];
  const user=id=>({uid:id,emailVerified:true,getIdToken:async()=>`token-${id}-${credentialVersion}`});
  const auth={currentUser:user('old')};
  const reply=id=>({sessionId:id,session:{sequence:0,serverNowMs:100000,activeSinceMs:active?100000:null,leaseUntilMs:110000}});
  const context=vm.createContext({AutoStudyTimer,Date,performance,
    ready:true,studyReady:true,authTransition:false,retiringTracker:null,linkedEpoch:0,wordUid:'word',wordAuth:{currentUser:{uid:'word'}},
    studyAuth:auth,restoringConnection:false,restoredWordUid:'word',restoreRetryAt:0,unlinking:false,saveRetryAt:Infinity,
    tracker:null,linkedTracker:null,context:'word',linkedContext:'',tabId:'tab',message:'',lastActivity:0,
    learning:()=>active,appVisible:()=>true,paint(){},persistConnection:async()=>{},
    config:{projectId:'fixture'},
    storage:key=>{if(!stores.has(key)){let value=null;stores.set(key,{read:()=>value,write:next=>{value=next;}});}return stores.get(key);},
    call:async(name,data)=>{requests.push({name,data,owner:auth.currentUser.uid});if(name==='startWordStudy'&&auth.currentUser.uid==='old')return new Promise(resolve=>{release=()=>resolve(reply('old-session'));});return reply('new-session');},
    fetch:async(url,options)=>{finishes.push(options);return {ok:true,json:async()=>({result:{creditedSeconds:5}})};}
  });
  vm.runInContext(code+'\nglobalThis.getRemote=()=>linkedTracker;globalThis.retiring=()=>retiringTracker;',context);
  context.makeTracker();await new Promise(resolve=>setImmediate(resolve));
  const old=context.getRemote();assert.equal(old.busy,true);
  auth.currentUser=user('new');active=false;credentialVersion=1;context.makeTracker();
  assert.equal(context.getRemote(),old);assert.ok(context.retiring());
  release();await context.retiring();
  assert.equal(old.record,null);assert.equal(old.desired,false);assert.equal(finishes.length,1);
  assert.equal(finishes[0].headers.Authorization,'Bearer token-old-1');
  assert.equal(JSON.parse(finishes[0].body).data.sessionId,'old-session');
  context.makeTracker();await new Promise(resolve=>setImmediate(resolve));
  const next=context.getRemote();assert.notEqual(next,old);assert.equal(next.desired,false);assert.equal(next.record,null);
  assert.equal(requests.filter(row=>row.name==='startWordStudy').length,1);
});
