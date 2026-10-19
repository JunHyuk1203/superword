// Run via npm run test:rules. Uses the demo project only, never production data.
const {before, after, test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {initializeTestEnvironment, assertSucceeds, assertFails} = require('@firebase/rules-unit-testing');
const {doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, orderBy, writeBatch} = require('firebase/firestore');
let env;
const verified = (uid, email = `${uid}@example.com`) => env.authenticatedContext(uid, {email, email_verified:true}).firestore();
before(async () => {
  env = await initializeTestEnvironment({projectId:'demo-superword', firestore:{
    rules:fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8')
  }});
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const uid of ['alice', 'bob', 'default_user']) {
      await setDoc(doc(db,`users/${uid}/books/book`),{name:'기존 단어장',legacyField:true});
      await setDoc(doc(db,`users/${uid}/books/book/chapters/day`),{name:'Day 01'});
      await setDoc(doc(db,`users/${uid}/books/book/chapters/day/words/word`),{front:'apple',back:'사과',order:0,extraLegacyField:'kept'});
      await setDoc(doc(db,`users/${uid}/books/book/chapters/day/testHistory/result`),{correct:1,total:2,timestamp:new Date()});
      await setDoc(doc(db,`users/${uid}/appeals/server-verdict`),{isApproved:true});
    }
    await setDoc(doc(db,'_aiUsage/global'),{daily:1});
    await setDoc(doc(db,'privateConfig/ai'),{apiKey:'test-only-not-a-real-key'});
  });
});
after(async () => {await env?.cleanup();});

test('verified user can list existing books, chapters, ordered words and history', async () => {
  const db = verified('alice');
  for (const suffix of ['books','books/book/chapters']) await assertSucceeds(getDocs(collection(db,`users/alice/${suffix}`)));
  await assertSucceeds(getDocs(query(collection(db,'users/alice/books/book/chapters/day/words'),orderBy('order'))));
  await assertSucceeds(getDocs(query(collection(db,'users/alice/books/book/chapters/day/testHistory'),orderBy('timestamp','desc'))));
});
test('create/edit/delete/import and batch deletion work without imposing a new legacy schema', async () => {
  const db = verified('alice');
  await assertSucceeds(setDoc(doc(db,'users/alice'),{preferences:{theme:'light'}}));
  const paths = ['books/new','books/new/chapters/new','books/new/chapters/new/words/new','books/new/chapters/new/testHistory/new'];
  for (const suffix of paths) {
    const ref = doc(db,`users/alice/${suffix}`);
    await assertSucceeds(setDoc(ref,{name:'기존 또는 새 데이터',front:'test',back:'imported',order:1}));
    await assertSucceeds(updateDoc(ref,{customLegacyField:['example']}));
    await assertSucceeds(getDoc(ref));
  }
  const batch = writeBatch(db);
  paths.forEach(suffix => batch.delete(doc(db,`users/alice/${suffix}`)));
  await assertSucceeds(batch.commit());
});
test('parent deletion does not unexpectedly prevent access to owned orphan words', async () => {
  const db = verified('alice');
  await assertSucceeds(setDoc(doc(db,'users/alice/books/orphan/chapters/day/words/word'),{front:'existing orphan'}));
  await assertSucceeds(getDoc(doc(db,'users/alice/books/orphan/chapters/day/words/word')));
  await assertSucceeds(deleteDoc(doc(db,'users/alice/books/orphan/chapters/day/words/word')));
});
test('another verified user cannot read, list, overwrite or delete someone else’s data', async () => {
  const db = verified('bob');
  const target = doc(db,'users/alice/books/book/chapters/day/words/word');
  await assertFails(getDoc(target));
  await assertFails(getDocs(collection(db,'users/alice/books')));
  await assertFails(setDoc(target,{front:'attack'}));
  await assertFails(deleteDoc(target));
});
test('legacy owner retains default_user and own UID access with a verified email', async () => {
  const db = verified('owner-real-uid','tntgame1203@gmail.com');
  await assertSucceeds(getDocs(collection(db,'users/default_user/books')));
  await assertSucceeds(setDoc(doc(db,'users/default_user/books/new-owner-book'),{name:'owner'}));
  await assertSucceeds(setDoc(doc(db,'users/owner-real-uid/books/new'),{name:'own UID'}));
});
test('an unverified owner email cannot claim the legacy data', async () => {
  const db = env.authenticatedContext('attacker',{email:'tntgame1203@gmail.com',email_verified:false}).firestore();
  await assertFails(getDoc(doc(db,'users/default_user/books/book')));
  await assertFails(setDoc(doc(db,'users/attacker/books/new'),{name:'unverified'}));
});
test('other verified users cannot acquire legacy owner access through client-written flags', async () => {
  const db = verified('bob');
  await assertSucceeds(setDoc(doc(db,'users/bob'),{admin:true,email:'tntgame1203@gmail.com'}));
  await assertFails(getDoc(doc(db,'users/default_user/books/book')));
});
test('guests cannot access any protected user collection', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db,'users/alice/books/book')));
  await assertFails(getDocs(collection(db,'users/alice/books')));
  await assertFails(setDoc(doc(db,'users/alice/books/attack'),{name:'guest'}));
});
test('server AI cache is readable only by its owner and cannot be forged by clients', async () => {
  const alice = verified('alice'), bob = verified('bob');
  await assertSucceeds(getDoc(doc(alice,'users/alice/appeals/server-verdict')));
  await assertFails(getDoc(doc(bob,'users/alice/appeals/server-verdict')));
  await assertFails(setDoc(doc(alice,'users/alice/appeals/forged'),{isApproved:true}));
  await assertFails(deleteDoc(doc(alice,'users/alice/appeals/server-verdict')));
});
test('secrets, usage counters, unknown nested collections and global legacy caches are denied', async () => {
  for (const db of [verified('alice'),verified('owner-real-uid','tntgame1203@gmail.com'),env.unauthenticatedContext().firestore()]) {
    for (const target of ['privateConfig/ai','publicConfig/ai','serverSecrets/ai','_aiUsage/global','appeals/legacy','users/alice/private/key']) {
      await assertFails(getDoc(doc(db,target)));
      await assertFails(setDoc(doc(db,target),{apiKey:'fake',daily:0,isApproved:true}));
    }
  }
});
