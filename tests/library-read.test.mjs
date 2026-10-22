import {test} from 'node:test';import assert from 'node:assert/strict';
import {librarySubscriber} from '../library-read.js';
const user={uid:'account',getIdToken:async()=>'private-token'};
test('stalled realtime library falls back to authenticated paginated HTTP and preserves edit references',async()=>{
 let calls=0,result;const urls=[];
 const subscribe=librarySubscriber({onSnapshot:()=>()=>{},makeRef:path=>({path}),getUser:()=>user,projectId:'fixture',delayMs:0,fetcher:async(url,options)=>{
  urls.push(String(url));assert.equal(options.headers.Authorization,'Bearer private-token');calls++;
  return {ok:true,json:async()=>({documents:[{name:`projects/fixture/databases/(default)/documents/users/account/books/b/chapters/c/words/w${calls}`,fields:{word:{stringValue:'apple'},order:{integerValue:String(calls)}}}],...(calls===1?{nextPageToken:'next'}:{})})};
 }});
 const stop=subscribe({},value=>result=value,error=>{throw error;},{appendChild(){}},()=>{},'users/account/books/b/chapters/c/words','order');
 await new Promise(r=>setTimeout(r,25));stop();
 assert.equal(result.size,2);assert.equal(result.docs[0].data().word,'apple');assert.equal(result.docs[1].ref.path,'users/account/books/b/chapters/c/words/w2');assert.match(urls[1],/pageToken=next/);assert.match(urls[0],/orderBy=order/);
});
test('HTTP fallback cannot update a closed view or replace a newer realtime snapshot',async()=>{
 let resolve,listener,result;const subscribe=librarySubscriber({onSnapshot:(_,cb)=>{listener=cb;return ()=>{};},getUser:()=>user,makeRef:()=>({}),projectId:'fixture',delayMs:0,fetcher:()=>new Promise(r=>resolve=r)});
 const stop=subscribe({path:'users/account/books'},s=>result=s,()=>{}, {},()=>{});
 await new Promise(r=>setTimeout(r,10));const live={size:7};listener(live);resolve({ok:true,json:async()=>({documents:[]})});await new Promise(r=>setTimeout(r,10));assert.equal(result,live);stop();
});
