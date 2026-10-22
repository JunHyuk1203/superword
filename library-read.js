// A stalled realtime transport must not leave the library on a loading screen.
function decode(value) {
  if('nullValue' in value)return null;
  if('stringValue' in value)return value.stringValue;
  if('integerValue' in value)return Number(value.integerValue);
  if('doubleValue' in value)return value.doubleValue;
  if('booleanValue' in value)return value.booleanValue;
  if('timestampValue' in value){const date=new Date(value.timestampValue);return {toDate:()=>date,toMillis:()=>date.getTime()};}
  if('arrayValue' in value)return (value.arrayValue.values||[]).map(decode);
  if('mapValue' in value)return fields(value.mapValue.fields);
  return value;
}
function fields(values={}){return Object.fromEntries(Object.entries(values).map(([key,value])=>[key,decode(value)]));}

export function librarySubscriber({onSnapshot,makeRef,getUser,projectId,fetcher=fetch,delayMs=5000,timeoutMs=12000}) {
 return function subscribe(reference,render,showError,container,retry,collectionPath=reference.path,orderBy=''){
  let active=true,received=false,version=0,retryButton,stop=()=>{};
  const controller=new AbortController(),owner=getUser()?.uid;
  const valid=()=>active&&getUser()?.uid===owner;
  const fail=error=>{if(!valid())return;retryButton?.remove();showError(error);retryButton=document.createElement('button');retryButton.type='button';retryButton.className='small-btn library-retry';retryButton.textContent='다시 시도';retryButton.onclick=retry;container.appendChild(retryButton);};
  const deliver=snapshot=>{if(!valid())return;try{render(snapshot);received=true;version++;retryButton?.remove();clearTimeout(timer);}catch(error){fail(error);}};
  let fallbackStarted=false;
  const fallback=async()=>{
   if(!valid()||received||fallbackStarted)return;fallbackStarted=true;const before=version;
   const deadline=setTimeout(()=>controller.abort(),timeoutMs);
   try{
    const user=getUser();if(!user||!collectionPath?.startsWith('users/'))throw Error('로그인 후 다시 시도해 주세요.');
    const token=await Promise.race([user.getIdToken(),new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Object.assign(new Error('연결 시간 초과'),{name:'AbortError'})),{once:true}))]),documents=[];let pageToken='';
    do{
     const url=new URL(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionPath.split('/').map(encodeURIComponent).join('/')}`);
     url.searchParams.set('pageSize','1000');if(orderBy)url.searchParams.set('orderBy',orderBy);if(pageToken)url.searchParams.set('pageToken',pageToken);
     const response=await fetcher(url,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
     const body=await response.json();if(!response.ok)throw Error(body.error?.message||`목록 조회 실패 (${response.status})`);
     documents.push(...(body.documents||[]));pageToken=body.nextPageToken||'';
    }while(pageToken&&valid());
    if(!valid()||version!==before)return;
    const docs=documents.map(row=>{const path=row.name.split('/documents/')[1];return {id:path.split('/').at(-1),ref:makeRef(path),data:()=>fields(row.fields)};});
    deliver({empty:docs.length===0,size:docs.length,docs,forEach:callback=>docs.forEach(callback)});
   }catch(error){if(valid()&&!received)fail(new Error(error.name==='AbortError'?'연결 시간이 초과됐습니다. 다시 시도해 주세요.':error.message));}
   finally{clearTimeout(deadline);}
  };
  const timer=setTimeout(()=>void fallback(),delayMs);
  try{stop=onSnapshot(reference,snapshot=>{if(snapshot.metadata?.fromCache)return;deliver(snapshot);},()=>void fallback());}catch{void fallback();}
  return ()=>{active=false;clearTimeout(timer);controller.abort();retryButton?.remove();stop();};
 };
}
