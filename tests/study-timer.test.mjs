import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AutoStudyTimer,isLearning,localApi,todayStudySeconds,studyUuid} from '../study-timer-core.js';

test('HTTP UUID fallback uses secure random bytes and preserves server controller format',()=>{
  let calls=0;
  const cryptoApi={getRandomValues(bytes){calls++;bytes.fill(255);return bytes;}};
  assert.equal(studyUuid(cryptoApi),'ffffffff-ffff-4fff-bfff-ffffffffffff');
  assert.equal(calls,1);
  assert.match(studyUuid({getRandomValues:bytes=>crypto.getRandomValues(bytes)}),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(studyUuid({randomUUID:()=> 'native-id'}),'native-id');
});

function memory(){let value=null;return {read:()=>value,write:next=>{value=next;}};}
function response(id='session'){return {sessionId:id,session:{sequence:0,serverNowMs:100000,accumulatedSeconds:0,activeSinceMs:100000,leaseUntilMs:130000}};}

test('finish shares the heartbeat drain and resolves only after final storage acknowledgement',async()=>{
  let now=100000,release,save,finishes=0,ended=false;
  const timer=new AutoStudyTimer({store:memory(),now:()=>now,heartbeatMs:5000,api:{
    start:async()=>({...response(),initialSyncComplete:true}),sync:()=>new Promise(resolve=>{release=()=>resolve(response());}),
    finish:()=>{finishes++;return new Promise(resolve=>{save=()=>resolve({creditedSeconds:5});});}
  }});
  await timer.update(true);now+=5000;const beat=timer.update(true);await Promise.resolve();
  const finish=timer.finish();assert.equal(finish,beat);void finish.then(()=>{ended=true;});
  await Promise.resolve();assert.equal(ended,false);assert.equal(finishes,0);
  release();await new Promise(resolve=>setImmediate(resolve));assert.equal(finishes,1);assert.equal(ended,false);
  save();assert.deepEqual(await finish,{ok:true,pending:false});assert.equal(timer.record,null);
});

test('permanent resume rejection sends one request per backoff instead of recursing',async()=>{
  let calls=0,now=100000;
  const paused={sessionId:'old',session:{sequence:0,serverNowMs:now,activeSinceMs:null,leaseUntilMs:null}};
  const timer=new AutoStudyTimer({store:memory(),now:()=>now,jitter:()=>0,api:{start:async()=>({...paused,initialSyncComplete:true}),sync:async()=>{calls++;return paused;}}});
  const result=await timer.update(true);assert.equal(result.ok,false);assert.equal(calls,1);
  await timer.update(true);assert.equal(calls,1);now+=1000;await timer.update(true);assert.equal(calls,2);
});

test('unchanged UI polling during a denied heartbeat cannot trigger another immediate request',async()=>{
  let release,calls=0;
  const paused={sessionId:'old',session:{sequence:0,serverNowMs:100000,activeSinceMs:null,leaseUntilMs:null}};
  const timer=new AutoStudyTimer({store:memory(),now:()=>100000,jitter:()=>0,api:{start:async()=>({...paused,initialSyncComplete:true}),sync:()=>{calls++;return new Promise(resolve=>{release=()=>resolve(paused);});}}});
  const pending=timer.update(true);await new Promise(resolve=>setImmediate(resolve));
  for(let i=0;i<20;i++)assert.equal(timer.update(true),pending);
  release();const result=await pending;
  assert.equal(result.ok,false);assert.equal(calls,1);
});

test('terminal max-duration finishes once and opens at most one replacement in a drain',async()=>{
  let starts=0,finishes=0;
  const timer=new AutoStudyTimer({store:memory(),now:()=>100000,api:{
    start:async()=>({sessionId:`s${++starts}`,session:{sequence:0,serverNowMs:100000,activeSinceMs:null,leaseUntilMs:null,canResume:false,terminalReason:'max-duration'}}),
    finish:async()=>{finishes++;return {creditedSeconds:12};},sync:async()=>{throw Error('unexpected');}
  }});
  const result=await timer.update(true);assert.equal(result.ok,false);assert.equal(starts,2);assert.equal(finishes,2);
});

test('slow replies schedule the next heartbeat from sending time and explicit save failures remain pending',async()=>{
  let now=100000,release,calls=0;
  const timer=new AutoStudyTimer({store:memory(),now:()=>now,heartbeatMs:5000,jitter:()=>0,api:{
    start:async()=>({...response(),initialSyncComplete:true}),sync:async input=>{calls++;if(calls===1)await new Promise(resolve=>{release=resolve;});return {...response(),session:{...response().session,sequence:input.sequence}};},
    finish:async()=>{throw Error('offline');}
  }});
  await timer.update(true);now+=5000;const beat=timer.update(true);await Promise.resolve();now+=8000;release();await beat;
  await timer.update(true);assert.equal(calls,2);
  const result=await timer.finish();assert.equal(result.ok,false);assert.equal(result.pending,true);assert.equal(timer.record.sessionId,'session');
});

test('discarding an expired saved session while idle does not create or run another',async()=>{
 const store=memory();store.write({sessionId:'expired',controllerId:'same'});let starts=0;
 const timer=new AutoStudyTimer({store,keepAlive:true,startWhenIdle:false,api:{start:async()=>{starts++;return null;},sync:async()=>{throw Error('Unexpected tracking');}}});
 await timer.update(false);await timer.update(false);
 assert.equal(starts,1);assert.equal(store.read(),null);assert.equal(timer.session,null);assert.equal(timer.error,'');
});

test('only signed in, visible card/test learning counts; idle, editor and modal do not',()=>{
  const active={signedIn:true,visible:true,words:true,test:false,blocked:false,idleMs:1000};
  assert.equal(isLearning(active),true);
  for(const patch of [{visible:false},{signedIn:false},{words:false},{blocked:true},{idleMs:10000}])assert.equal(isLearning({...active,...patch}),false);
  assert.equal(isLearning({...active,idleMs:9999}),true);
  assert.equal(isLearning({...active,words:false,test:true}),true);
});

test('leaving while automatic start is in flight finishes that session exactly once',async()=>{
  let release;const calls=[];
  const timer=new AutoStudyTimer({store:memory(),now:()=>100000,api:{start:()=>new Promise(resolve=>{release=resolve;}),sync:async()=>{calls.push('sync');return response();},finish:async()=>{calls.push('finish');return {creditedSeconds:8};}}});
  const pending=timer.update(true);await Promise.resolve();const finishing=timer.finish();
  assert.equal(finishing,pending);release(response());await finishing;
  assert.deepEqual(calls,['finish']);assert.equal(timer.session,null);assert.equal(timer.lastSaved,8);
});

test('lost finish reply preserves the same pending session for idempotent retry',async()=>{
  const store=memory();let now=100000,finishes=0;
  const api={start:async()=>response(),sync:async()=>response(),finish:async()=>{if(++finishes===1)throw new Error('offline');return {creditedSeconds:12};}};
  const timer=new AutoStudyTimer({store,now:()=>now,api});await timer.update(true);await timer.finish();
  assert.equal(store.read().sessionId,'session');now+=10001;await timer.finish();
  assert.equal(finishes,2);assert.equal(store.read(),null);assert.equal(timer.lastSaved,12);
});

test('reload closes a persisted session without starting an unrelated one',async()=>{
  const store=memory();store.write({sessionId:'old',controllerId:'controller'});let starts=0,finishes=0;
  const timer=new AutoStudyTimer({store,api:{start:async record=>{starts++;assert.equal(record.sessionId,'old');return response('old');},finish:async()=>{finishes++;return {creditedSeconds:10};}},now:()=>100000});
  await timer.finish();assert.equal(starts,1);assert.equal(finishes,1);assert.equal(store.read(),null);
});

test('local records split at Korean midnight and exclude suspended gaps',async()=>{
  let now=Date.parse('2026-10-22T14:59:50Z');const history=[];
  const api=localApi(memory(),()=>now,row=>history.push(row));await api.start();await api.sync();
  now+=20000;await api.sync();now+=120000;const result=await api.finish();
  assert.equal(result.creditedSeconds,50);
  assert.deepEqual(history.at(-1).dailySeconds,{'2026-10-22':10,'2026-10-23':40});
  assert.equal(history.at(-1).status,'finished');
});

test('frequent UI ticks do not send heartbeat writes every second',async()=>{
  let now=100000,syncs=0;
  const timer=new AutoStudyTimer({store:memory(),now:()=>now,api:{start:async()=>response(),sync:async()=>{syncs++;return response();}}});
  await timer.update(true);for(let i=0;i<19;i++){now+=1000;await timer.update(true);}
  assert.equal(syncs,1);now+=1000;await timer.update(true);assert.equal(syncs,2);
});

test('linked timer renews its ten-second lease every five seconds while active or idle',async()=>{
  let now=100000;const times=[];
  const timer=new AutoStudyTimer({store:memory(),now:()=>now,keepAlive:true,startWhenIdle:false,heartbeatMs:5000,api:{
    start:async()=>response(),
    sync:async input=>{times.push(now);return {sessionId:'session',session:{sequence:input.sequence,serverNowMs:now,activeSinceMs:input.tracking?now:null,leaseUntilMs:input.tracking?now+10000:null}};},
  }});
  await timer.update(true);
  for(let i=0;i<10;i++){now+=1000;await timer.update(true);}
  assert.deepEqual(times,[100000,105000,110000]);
  await timer.update(false);now+=4999;await timer.update(false);
  assert.equal(times.length,4);now++;await timer.update(false);
  assert.equal(times.at(-1),115000);assert.equal(timer.tracking,false);
});

test('settings, records and chapter changes pause one session then resume without reset or gap credit',async()=>{
  let now=Date.parse('2026-10-22T03:00:00Z');const history={};
  const timer=new AutoStudyTimer({store:memory(),now:()=>now,api:localApi(memory(),()=>now,row=>{history[row.id]=row;})});
  await timer.update(true);const id=timer.record.sessionId;
  for(let i=0;i<3;i++) {
    now+=5000;await timer.update(false);
    const paused=timer.seconds();assert.equal(paused,5*(i+1));
    assert.equal(history[id].status,'paused');
    now+=60000;await timer.update(false);assert.equal(timer.seconds(),paused);
    await timer.update(true);assert.equal(timer.record.sessionId,id);assert.equal(timer.seconds(),paused);
  }
  await timer.finish();assert.equal(timer.lastSaved,15);
});

test('today capsule preserves finished time across fresh sessions, excluding old days and cached duplicates',()=>{
  const now=Date.parse('2026-10-22T03:00:10Z');
  const history={old:{id:'old',dailySeconds:{'2026-10-21':100}},done:{id:'done',dailySeconds:{'2026-10-22':30}},active:{id:'active',dailySeconds:{'2026-10-22':5}}};
  const session={dailySeconds:{'2026-10-22':5},activeSinceMs:now-3000,leaseUntilMs:now+30000};
  assert.equal(todayStudySeconds(history,session,'active',now),38);
  assert.equal(todayStudySeconds(history,null,null,now),35);
});

test('a background finish is not cancelled by polling while a heartbeat is in flight',async()=>{
  let now=100000,release,finished=0;
  const api={start:async()=>response(),sync:()=>new Promise(resolve=>{release=resolve;}),finish:async()=>{finished++;return {creditedSeconds:5};}};
  const timer=new AutoStudyTimer({api,store:memory(),now:()=>now});
  const pending=timer.update(true);await Promise.resolve();await Promise.resolve();
  const finishing=timer.finish();const idle=timer.update(false);release(response());await Promise.all([pending,finishing,idle]);
  assert.equal(finished,1);assert.equal(timer.session,null);
});

test('linked app presence stays alive while idle without crediting study time or creating extra sessions',async()=>{
  let now=100000,starts=0,beats=0;
  const timer=new AutoStudyTimer({keepAlive:true,store:memory(),now:()=>now,api:{start:async()=>{starts++;return {sessionId:'presence',session:{sequence:0,serverNowMs:now,accumulatedSeconds:0,activeSinceMs:null,leaseUntilMs:null}};},sync:async input=>{beats++;assert.equal(input.tracking,false);return {sessionId:'presence',session:{sequence:input.sequence,serverNowMs:now,accumulatedSeconds:0,activeSinceMs:null,leaseUntilMs:null}};},finish:async()=>({creditedSeconds:0})}});
  await timer.update(false);assert.equal(starts,1);assert.equal(beats,1);
  now+=20000;await timer.update(false);assert.equal(beats,2);assert.equal(timer.seconds(),0);
  await timer.finish();assert.equal(timer.session,null);
});

test('opening the linked app idle creates no session; presence begins only after learning',async()=>{
  let now=100000,starts=0,beats=0;
  const timer=new AutoStudyTimer({keepAlive:true,startWhenIdle:false,store:memory(),now:()=>now,api:{
    start:async()=>{starts++;return {sessionId:'learning',session:{sequence:0,serverNowMs:now,activeSinceMs:null,accumulatedSeconds:0}};},
    sync:async input=>{beats++;return {sessionId:'learning',session:{sequence:input.sequence,serverNowMs:now,activeSinceMs:input.tracking?now:null,leaseUntilMs:now+30000,accumulatedSeconds:0}};},
    finish:async()=>({creditedSeconds:0}),
  }});
  await timer.update(false);now+=20000;await timer.update(false);
  assert.equal(starts,0);assert.equal(timer.record,null);
  await timer.update(true);assert.equal(starts,1);assert.equal(timer.tracking,true);
  await timer.update(false);assert.equal(timer.tracking,false);
  now+=20000;await timer.update(false);assert.equal(starts,1);assert.equal(beats,3);
});
