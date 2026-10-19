// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??// superword - app.js v3.0 (Study Edition)
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??console.log("GoodNotes Vocab App Loaded - v11.0 (Apple HIG Design System)");

// ?? Apple HIG Theme System ??
(function initTheme() {
  const saved = localStorage.getItem('app_theme') || 'dark';
  document.body.setAttribute('data-theme', saved);
})();

window.setTheme = function(theme) {
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('app_theme', theme);
  // Update button active states
  const darkBtn  = document.getElementById('theme-btn-dark');
  const lightBtn = document.getElementById('theme-btn-light');
  if (!darkBtn || !lightBtn) return;
  
  if (theme === 'dark') {
    darkBtn.classList.add('active');
    lightBtn.classList.remove('active');
  } else {
    lightBtn.classList.add('active');
    darkBtn.classList.remove('active');
  }
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, getDocs, addDoc,
  query, orderBy, serverTimestamp, deleteDoc, updateDoc,
  onSnapshot, initializeFirestore, persistentLocalCache, where, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged,
  sendPasswordResetEmail, browserLocalPersistence, setPersistence,
  sendEmailVerification, updatePassword, linkWithPopup, EmailAuthProvider,
  fetchSignInMethodsForEmail, getAdditionalUserInfo, deleteUser
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// ??? Firebase Init ????????????????????????????????????????????????????????????
const firebaseApp = initializeApp({
  apiKey: "AIzaSyDToPgxyeRpAfYUqSlweugc7M5vwCwagsU",
  authDomain: "goodnotesword-454fa.firebaseapp.com",
  projectId: "goodnotesword-454fa",
  storageBucket: "goodnotesword-454fa.firebasestorage.app",
  messagingSenderId: "509235514160",
  appId: "1:509235514160:web:87282a03a70ec2041696f5",
  measurementId: "G-Z0C9CQT4T7"
});
const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache()
});
const auth = getAuth(firebaseApp);
setPersistence(auth, browserLocalPersistence);

// ??? Global State ?????????????????????????????????????????????????????????????
let currentUser = null;
let unsubBooks = null;
let unsubChapters = null;
let unsubWords = null;
let selectedBookId = null;
let selectedChapterId = null;
let currentLoadedWords = [];
let generatedData = [];
let currentViewMode = 'card'; // 'card' | 'table'
let hideState = { word: true, meaning: true, example: true, related: true };

// Test state
let testWords = [];
let testIndex = 0;
let testMode = 'flash'; // 'flash' | 'quiz'
let testDir = 'word2meaning'; // 'word2meaning' | 'meaning2word'
let testOrder = 'sequential';
let testCorrect = 0;
let testWrong = [];
let testIsFlipped = false;

// ??? Utility ??????????????????????????????????????????????????????????????????
function $(id) { return document.getElementById(id); }
function highlightExample(enText, keyword) {
  let escaped = escapeHTML(enText);
  if (!keyword) return escaped;
  // Use regex to highlight the keyword, ignoring case.
  try {
    const re = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return escaped.replace(re, '<strong>$&</strong>');
  } catch(e) {
    return escaped;
  }
}

function escapeHTML(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escapeCSV(s) {
  if (s == null) return '';
  const v = String(s).replace(/"/g, '""');
  return (v.includes(',') || v.includes('\n') || v.includes('"')) ? `"${v}"` : v;
}

function openModal(modalEl) {
  document.body.classList.add('modal-open');
  // Use visibility instead of display:none removal to avoid layout flash
  modalEl.classList.remove('hidden');
  // Double rAF ensures browser has painted 1 frame before starting transition
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      modalEl.classList.add('show');
    });
  });
}
function closeModal(modalEl) {
  modalEl.classList.remove('show');
  setTimeout(() => {
    modalEl.classList.add('hidden');
    if (!document.querySelector('.modal-screen.show')) {
      document.body.classList.remove('modal-open');
    }
  }, 400);
}

// ?? Apple Bottom Sheet Dismissal Logic ??
document.querySelectorAll('.modal-screen').forEach(modal => {
  // Tap outside to dismiss
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });
  
  // Swipe down to dismiss
  let sheetStartY = null;
  let sheetCurrentY = null;
  const content = modal.querySelector('.modal-screen-content');
  
  if (content) {
    content.addEventListener('touchstart', (e) => {
      if (content.scrollTop === 0) {
        sheetStartY = e.touches[0].clientY;
      }
    }, { passive: true });
    
    content.addEventListener('touchmove', (e) => {
      if (sheetStartY === null) return;
      sheetCurrentY = e.touches[0].clientY;
      const deltaY = sheetCurrentY - sheetStartY;
      if (deltaY > 0) {
        content.style.transform = `translateY(${deltaY}px)`;
        content.style.transition = 'none';
      }
    }, { passive: true });
    
    content.addEventListener('touchend', (e) => {
      if (sheetStartY === null) return;
      const deltaY = sheetCurrentY - sheetStartY;
      content.style.transform = '';
      content.style.transition = '';
      if (deltaY > 100) {
        closeModal(modal);
      }
      sheetStartY = null;
      sheetCurrentY = null;
    });
  }
});

// ??? Custom Modals ????????????????????????????????????????????????????????????
function showPrompt(message, defaultVal = '') {
  return new Promise(resolve => {
    const modal = $('custom-prompt-modal');
    const msgEl = $('custom-prompt-message');
    const input = $('custom-prompt-input');
    const okBtn = $('custom-prompt-ok');
    const cancelBtn = $('custom-prompt-cancel');
    msgEl.textContent = message;
    input.value = defaultVal;
    okBtn.disabled = !defaultVal.trim();
    modal.classList.remove('hidden');
    setTimeout(() => input.focus(), 50);
    const cleanup = (val) => {
      modal.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      input.removeEventListener('input', onInput);
      resolve(val);
    };
    const onOk = () => { if (!okBtn.disabled) cleanup(input.value.trim() || null); };
    const onCancel = () => cleanup(null);
    const onKey = (e) => { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onCancel(); };
    const onInput = () => { okBtn.disabled = !input.value.trim(); };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
    input.addEventListener('input', onInput);
  });
}

function showConfirm(message) {
  return new Promise(resolve => {
    const modal = $('custom-confirm-modal');
    const msgEl = $('custom-confirm-message');
    const okBtn = $('custom-confirm-ok');
    const cancelBtn = $('custom-confirm-cancel');
    msgEl.textContent = message;
    modal.classList.remove('hidden');
    const cleanup = (val) => {
      modal.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(val);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

// ??? DOM Refs ?????????????????????????????????????????????????????????????????
const errorSection = $('error-section');
const errorTitle = $('error-title');
const errorMsg = $('error-msg');
const viewBooks = $('view-books');
const viewChapters = $('view-chapters');
const viewWords = $('view-words');
const layerBooks = $('layer-books');
const layerChapters = $('layer-chapters');
const layerWords = $('layer-words');

let currentLibraryLevel = 0; // 0: Books, 1: Chapters, 2: Words

function setLibraryLevel(newIndex) {
  currentLibraryLevel = newIndex;
  const views = [layerBooks, layerChapters, layerWords];
  views.forEach((v, i) => {
    if (!v) return;
    v.classList.remove('active-lib', 'idle-left', 'idle-right', 'hidden');
    if (i < newIndex) {
      v.classList.add('idle-left');
    } else if (i > newIndex) {
      v.classList.add('idle-right');
    } else {
      v.classList.add('active-lib');
    }
  });
}
const iosBackBtn = $('ios-back-btn');
const iosBackText = $('ios-back-text');
const iosNavTitleInline = $('ios-nav-title-inline');
const iosLargeTitleText = $('ios-large-title-text');

// Scroll behavior for Apple Large Title
document.addEventListener('scroll', () => {
  const scrollY = window.scrollY;
  if (scrollY > 44) {
    if (iosNavTitleInline) iosNavTitleInline.classList.add('visible');
  } else {
    if (iosNavTitleInline) iosNavTitleInline.classList.remove('visible');
  }
}, { passive: true });
const addBookBtn = $('add-book-btn');
const addBookWrap = $('add-book-wrap');
const addChapterBtn = $('add-chapter-btn');
const addChapterWrap = $('add-chapter-wrap');
const wordCountBadge = $('word-count-badge');
const wordsTbody = $('words-tbody');
const wordsCardView = $('words-card-view');
const wordsEditView = $('words-edit-view');
const wordsSwipeView = $('words-swipe-view');
const hideToggleBar = $('hide-toggle-bar');
const extractModal = $('extract-modal');
const openExtractBtn = $('open-extract-btn');
const closeExtractBtn = $('close-extract-btn');
const promptOutput = $('prompt-output');
const copyPromptBtn = $('copy-prompt-btn');
const aiJsonInput = $('ai-json-input');
const convertBtn = $('convert-btn');
const exportCsvBtn = $('export-csv-btn');
const selectAllWords = $('select-all-words');
const deleteSelectedBtn = $('delete-selected-btn');
const cardFrontSel = $('card-front-sel');
const cardBackSel = $('card-back-sel');
const viewCardBtn = $('view-card-btn');
const viewTableBtn = $('view-table-btn');
const viewSwipeBtn = $('view-swipe-btn');

// Settings
const settingsBtn = $('settings-btn');
const settingsModal = $('settings-modal');
const settingsCloseBtn = $('settings-close-btn');
const settingsSaveBtn = $('settings-save-btn');
const geminiApiKeyInput = $('gemini-api-key');

// 湲곕낯 API ??珥덇린??(?ъ슜?먭? 蹂꾨룄濡??ㅼ젙?섏? ?딆? 寃쎌슦?먮쭔 ?곸슜)
// Shared default API credentials removed. Use a user-provided key only.
let geminiApiKey = '';

if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    geminiApiKeyInput.value = geminiApiKey;

    // Sync theme buttons
    const currentTheme = document.body.getAttribute('data-theme') || 'dark';
    window.setTheme(currentTheme);
    openModal(settingsModal);
  });
  settingsCloseBtn.addEventListener('click', () => closeModal(settingsModal));
  settingsSaveBtn.addEventListener('click', () => {
    geminiApiKey = geminiApiKeyInput.value.trim();
    // Legacy snapshots must not persist credentials.

    closeModal(settingsModal);
    alert('?ㅼ젙????λ릺?덉뒿?덈떎.');
  });
  
}
// duplicate declaration removed
const startTestBtn = $('start-test-btn');
const viewHistoryBtn = $('view-history-btn');
const historyModal = $('history-modal');
const historyCloseBtn = $('history-close-btn');
const historyList = $('history-list');

const historyDetailModal = $('history-detail-modal');
const historyDetailCloseBtn = $('history-detail-close-btn');
const historyDetailTitle = $('history-detail-title');
const historyDetailDate = $('history-detail-date');
const historyDetailScore = $('history-detail-score');
const historyDetailWrong = $('history-detail-wrong');
const generateAiReportBtn = $('generate-ai-report-btn');
const historyAiReportContainer = $('history-ai-report-container');

let chapterHistoryRecords = [];
let currentTestRecord = null;

if (historyDetailCloseBtn) {
  historyDetailCloseBtn.addEventListener('click', () => closeModal(historyDetailModal));
}

function renderSimpleMarkdown(text) {
  let html = escapeHTML(text);
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Lists
  html = html.replace(/^- (.*)$/gm, '<li>$1</li>');
  // Newlines
  html = html.replace(/\n/g, '<br/>');
  return html;
}

if (generateAiReportBtn) {
  generateAiReportBtn.addEventListener('click', async () => {
    if (!geminiApiKey) {
      alert("?ㅼ젙(?숋툘) 硫붾돱?먯꽌 API ?ㅻ? 癒쇱? ?깅줉?댁＜?몄슂.");
      return;
    }
    if (!currentTestRecord) return;

    generateAiReportBtn.disabled = true;
    generateAiReportBtn.innerHTML = '?쨼 由ы룷???앹꽦 以?..';
    historyAiReportContainer.classList.remove('hidden');
    historyAiReportContainer.innerHTML = '<div style="text-align:center; padding:1rem;"><div class="progress-spinner" style="margin:0 auto;"></div><div style="margin-top:10px;">AI媛 ?숈뒿 ?깆랬?꾨? 遺꾩꽍?섍퀬 ?덉뒿?덈떎...</div></div>';

    try {
      const chapterWords = currentLoadedWords;
      const historySummary = chapterHistoryRecords.map(r => {
        const pct = Math.round((r.correct / r.total) * 100) || 0;
        const dStr = r.timestamp ? r.timestamp.toDate().toLocaleString() : '理쒓렐';
        const wStr = r.wrongWords && r.wrongWords.length > 0 ? r.wrongWords.join(', ') : '?놁쓬';
        return `- ${dStr} | ?뺣떟瑜? ${pct}% | ?ㅻ떟: ${wStr}`;
      }).join('\n');
      
      const currentPct = Math.round((currentTestRecord.correct / currentTestRecord.total) * 100) || 0;
      const currentWrong = currentTestRecord.wrongWords && currentTestRecord.wrongWords.length > 0 ? currentTestRecord.wrongWords.join(', ') : '?놁쓬';

      const prompt = `?뱀떊? 移쒖젅?섍퀬 ?꾨Ц?곸씤 ?댄쐶 ?숈뒿 AI ?쒗꽣?낅땲??
?숈깮???⑥뼱???뚯뒪??寃곌낵瑜?遺꾩꽍?섏뿬, ?대뼡 遺遺꾩쓣 ?룰컝???섎뒗吏, ?대뼡 遺遺꾩씠 遺議깊븳吏, ?욎쑝濡??대뼸寃??숈뒿?댁빞 ?섎뒗吏 援ъ껜?곸씠怨??꾩????섎뒗 1~2臾몃떒??釉뚮━?묒쓣 ?묒꽦?댁＜?몄슂.
留덊겕?ㅼ슫 ?쒖떇???ъ슜?섏뿬 源붾걫?섍쾶 ?묒꽦?섎릺, ?듭떖留??붿빟?댁＜?몄슂.

[?꾩옱 ?뚯뒪??寃곌낵]
- ?뺣떟瑜? ${currentPct}% (${currentTestRecord.correct} / ${currentTestRecord.total})
- ?由??⑥뼱: ${currentWrong}

[???⑥썝???댁쟾 ?뚯뒪??湲곕줉 (理쒓렐 ??]
${historySummary}

[???⑥썝???꾩껜 ?⑥뼱 紐⑸줉 李멸퀬]
${chapterWords.map(w => `${w.word} (${w.meaning})`).join(', ')}`;

      let responseText = '';
      const apiKey = geminiApiKey.trim();

      if (apiKey.startsWith('sk-')) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7
          })
        });
        if (!response.ok) throw new Error(`OpenAI API ?ㅻ쪟: ${response.status}`);
        const data = await response.json();
        responseText = data.choices[0].message.content;
      } else {
        const modelsToTry = [
          'gemini-3.1-flash-lite',
          'gemini-2.5-flash-lite',
          'gemini-3.5-flash',
          'gemini-2.5-flash',
          'gemini-3.1-pro-preview'
        ];
        let success = false;
        for (const model of modelsToTry) {
          console.log(`Trying Gemini API with model: ${model} for Report`);
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }]
            })
          });
          if (response.ok) {
            const data = await response.json();
            if (data.candidates && data.candidates[0].content.parts[0].text) {
              responseText = data.candidates[0].content.parts[0].text;
              success = true;
              break;
            }
          }
        }
        if (!success) throw new Error("Gemini API ?몄텧???ㅽ뙣?덉뒿?덈떎.");
      }

      historyAiReportContainer.innerHTML = renderSimpleMarkdown(responseText);

    } catch (e) {
      console.error(e);
      historyAiReportContainer.innerHTML = `<div style="color:var(--danger);">?ㅻ쪟 諛쒖깮: ${e.message}</div>`;
    } finally {
      generateAiReportBtn.disabled = false;
      generateAiReportBtn.innerHTML = '?쨼 AI ?숈뒿 由ы룷???ㅼ떆 ?앹꽦';
    }
  });
}

let swipeIndex = 0;
let swipeWords = [];
let autoPlayPronunciation = true; // Enabled by default in Shorts mode

// ??? Pronunciation ????????????????????????????????????????????????????????????
let _ttsAudio = null;
let _currentUtterance = null; // Prevent Android Chrome Garbage Collection bug
let _speechVoices = [];

if ('speechSynthesis' in window) {
  const fetchVoices = () => { _speechVoices = window.speechSynthesis.getVoices(); };
  fetchVoices();
  window.speechSynthesis.onvoiceschanged = fetchVoices;
}

function playPronunciation(wordText) {
  if (!wordText) return;
  const isAndroidChrome = /Android/i.test(navigator.userAgent) && /Chrome/i.test(navigator.userAgent) && !/SamsungBrowser/i.test(navigator.userAgent);
  
  try {
    if (isAndroidChrome) {
      _ttsAudioFallback(wordText);
      return;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      _currentUtterance = new SpeechSynthesisUtterance(wordText);
      _currentUtterance.lang = 'en-US';
      
      // Explicitly set voice to fix Android Chrome silent bug
      if (_speechVoices.length > 0) {
        let voice = _speechVoices.find(v => v.lang === 'en-US' && (v.name.includes('Google') || v.name.includes('Chrome')));
        if (!voice) voice = _speechVoices.find(v => v.lang === 'en-US');
        if (!voice) voice = _speechVoices.find(v => v.lang.startsWith('en'));
        if (voice) _currentUtterance.voice = voice;
      }

      _currentUtterance.onerror = () => _ttsAudioFallback(wordText);
      
      const timer = setTimeout(() => _ttsAudioFallback(wordText), 800);
      _currentUtterance.onstart = () => clearTimeout(timer);
      
      window.speechSynthesis.speak(_currentUtterance);
      
      // Fix for Chrome getting stuck in paused state
      if (window.speechSynthesis.resume) window.speechSynthesis.resume();
    } else {
      _ttsAudioFallback(wordText);
    }
  } catch (e) {
    _ttsAudioFallback(wordText);
  }
}

function _ttsAudioFallback(wordText) {
  try {
    if (_ttsAudio) { _ttsAudio.pause(); _ttsAudio = null; }
    const encoded = encodeURIComponent(wordText);
    _ttsAudio = new Audio(`https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=en&client=gtx`);
    _ttsAudio.volume = 1.0;
    _ttsAudio.play().catch(() => {});
  } catch (e) {}
}

let speechUnlocked = false;
function unlockSpeech() {
  if (speechUnlocked) return;
  speechUnlocked = true;
  try {
    if ('speechSynthesis' in window) {
      const unlock = new SpeechSynthesisUtterance('');
      unlock.volume = 0;
      window.speechSynthesis.speak(unlock);
    }
  } catch (e) {}
}
document.addEventListener('touchstart', unlockSpeech, { passive: true });
document.addEventListener('click', unlockSpeech, { once: true });

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.pronounce-btn');
  if (btn) {
    e.stopPropagation();
    playPronunciation(btn.dataset.word);
  }
});

// Edit Modal
let currentEditDocRef = null;
const editWordModal = $('edit-word-modal');
const editWordSave = $('edit-word-save');
const editWordCancel = $('edit-word-cancel');

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??// LIBRARY: Books ??Chapters ??Words
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??
let currentBookNameStore = ''; // To preserve for back button

if (iosBackBtn) {
  iosBackBtn.addEventListener('click', () => {
    if (currentLibraryLevel === 2 && selectedBookId) {
      loadChapters(selectedBookId, currentBookNameStore);
    } else if (currentLibraryLevel === 1) {
      loadBooks();
    }
  });
}

// --- Swipe to Go Back (iOS style edge swipe) ---
let backSwipeStartX = null;
let backSwipeStartY = null;

document.addEventListener('touchstart', (e) => {
  // Only trigger from left half (up to 45% of screen width)
  if (e.touches.length === 1 && e.touches[0].clientX <= window.innerWidth * 0.45) {
    backSwipeStartX = e.touches[0].clientX;
    backSwipeStartY = e.touches[0].clientY;
  }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (backSwipeStartX === null) return;
  const deltaX = e.touches[0].clientX - backSwipeStartX;
  const deltaY = Math.abs(e.touches[0].clientY - backSwipeStartY);
  // Cancel if vertical scroll is dominant
  if (deltaY > 50 && deltaX < 50) {
    backSwipeStartX = null;
  }
}, { passive: true });

document.addEventListener('touchend', (e) => {
  if (backSwipeStartX === null) return;
  const deltaX = e.changedTouches[0].clientX - backSwipeStartX;
  if (deltaX > 80) {
    if (currentLibraryLevel === 2 && selectedBookId) {
      loadChapters(selectedBookId, currentBookNameStore);
    } else if (currentLibraryLevel === 1) {
      loadBooks();
    }
  }
  backSwipeStartX = null;
});

// ??? Load Books ???????????????????????????????????????????????????????????????
function loadBooks() {
  if (typeof pushHistoryState === 'function') pushHistoryState(0, {});
  if (unsubChapters) { unsubChapters(); unsubChapters = null; }
  if (unsubWords) { unsubWords(); unsubWords = null; }
  selectedBookId = null;
  selectedChapterId = null;

  setLibraryLevel(0);

  document.getElementById('words-action-wrapper')?.classList.add('hidden');
  
  if (iosBackBtn) iosBackBtn.style.visibility = 'hidden';
  if (iosNavTitleInline) iosNavTitleInline.textContent = '?⑥뼱??紐⑸줉';
  if (iosLargeTitleText) iosLargeTitleText.textContent = '?⑥뼱??紐⑸줉';

  
  hideToggleBar.classList.add('hidden');

  if (!unsubBooks) {
    viewBooks.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-secondary);">濡쒕뵫 以?..</p>';
    unsubBooks = onSnapshot(collection(db, `users/${currentUser.uid}/books`), (snap) => {
      viewBooks.innerHTML = '';
      if (snap.empty) {
        viewBooks.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;">??λ맂 ?⑥뼱?μ씠 ?놁뒿?덈떎. ?꾩쓽 [+ ???⑥뼱??留뚮뱾湲? 踰꾪듉???뚮윭 ?쒖옉?섏꽭??</p>';
        return;
      }
      let idx = 0;
      snap.forEach(d => {
        const data = d.data();
        const div = document.createElement('div');
        div.className = 'lib-card list-item-enter';
        div.style.animationDelay = `${idx * 0.04}s`;
        div.innerHTML = `<div class="lib-icon">?뱲</div><div class="lib-title">${escapeHTML(data.name)}</div><button class="lib-delete-btn" title="?⑥뼱????젣" style="position:absolute;top:8px;right:8px;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.2rem;">??/button>`;
        div.onclick = () => loadChapters(d.id, data.name);
        div.querySelector('.lib-delete-btn').onclick = async (e) => {
          e.stopPropagation();
          if (await showConfirm('???⑥뼱?μ쓣 ??젣?섏떆寃좎뒿?덇퉴? (紐⑤뱺 ?⑥썝怨??④퍡 ??젣?⑸땲??')) {
            try { await deleteDoc(doc(db, `users/${currentUser.uid}/books`, d.id)); }
            catch(err) { alert('??젣 ?ㅽ뙣: ' + err.message); }
          }
        };
        viewBooks.appendChild(div);
        idx++;
      });
    }, (e) => {
      console.error(e);
      viewBooks.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--danger);">?ㅻ쪟: ${e.message}</p>`;
    });
  }
}

// ??? Load Chapters ????????????????????????????????????????????????????????????
function loadChapters(bookId, bookName) {
  if (typeof pushHistoryState === 'function') pushHistoryState(1, { bookId: bookId, bookName: bookName });
  if (unsubWords) { unsubWords(); unsubWords = null; }
  if (unsubChapters && selectedBookId !== bookId) {
    unsubChapters();
    unsubChapters = null;
  }
  selectedBookId = bookId;
  selectedChapterId = null;
  currentBookNameStore = bookName;

  setLibraryLevel(1);

  document.getElementById('words-action-wrapper')?.classList.add('hidden');
  
  if (iosBackBtn) {
    iosBackBtn.style.visibility = 'visible';
    iosBackText.textContent = '紐⑸줉';
  }
  if (iosNavTitleInline) iosNavTitleInline.textContent = bookName;
  if (iosLargeTitleText) iosLargeTitleText.textContent = bookName;


  if (!unsubChapters) {
    viewChapters.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-secondary);">濡쒕뵫 以?..</p>';
    unsubChapters = onSnapshot(collection(db, `users/${currentUser.uid}/books/${bookId}/chapters`), (snap) => {
      viewChapters.innerHTML = '';
      if (snap.empty) {
        viewChapters.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">
  <div class="empty-state-icon">?뱛</div>
  <p class="empty-state-title">?깅줉???⑥썝???놁뒿?덈떎</p>
  <p class="empty-state-desc">+ 踰꾪듉???뚮윭 泥??⑥썝??異붽???蹂댁꽭??</p>
</div>`;
        return;
      }
      let idx = 0;
      snap.forEach(d => {
        const data = d.data();
        const div = document.createElement('div');
        div.className = 'lib-card list-item-enter';
        div.style.animationDelay = `${idx * 0.04}s`;
        div.innerHTML = `<div class="lib-icon">?뱛</div><div class="lib-title">${escapeHTML(data.name)}</div><button class="lib-delete-btn" title="?⑥썝 ??젣" style="position:absolute;top:8px;right:8px;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.2rem;">??/button>`;
        div.onclick = () => loadWords(bookId, d.id, data.name);
        div.querySelector('.lib-delete-btn').onclick = async (e) => {
          e.stopPropagation();
          if (await showConfirm('???⑥썝????젣?섏떆寃좎뒿?덇퉴? (紐⑤뱺 ?⑥뼱? ?④퍡 ??젣?⑸땲??')) {
            try { await deleteDoc(doc(db, `users/${currentUser.uid}/books/${bookId}/chapters`, d.id)); }
            catch(err) { alert('??젣 ?ㅽ뙣: ' + err.message); }
          }
        };
        viewChapters.appendChild(div);
        idx++;
      });
    }, (e) => {
      console.error(e);
      viewChapters.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--danger);">?ㅻ쪟: ${e.message}</p>`;
    });
  }
}

// ??? Load Words ???????????????????????????????????????????????????????????????
function loadWords(bookId, chapterId, chapterName) {
  if (typeof pushHistoryState === 'function') pushHistoryState(2, { bookId: bookId, chapterId: chapterId, chapterName: chapterName });
  if (unsubWords && selectedChapterId !== chapterId) {
    unsubWords();
    unsubWords = null;
  }
  selectedBookId = bookId;
  selectedChapterId = chapterId;

  setLibraryLevel(2);

  document.getElementById('words-action-wrapper')?.classList.remove('hidden');
  
  if (iosBackBtn) {
    iosBackBtn.style.visibility = 'visible';
    iosBackText.textContent = currentBookNameStore || '?⑥썝';
  }
  if (iosNavTitleInline) iosNavTitleInline.textContent = chapterName;
  if (iosLargeTitleText) iosLargeTitleText.textContent = chapterName;


  // Show hide bar and reset to card mode
  hideToggleBar.classList.remove('hidden');
  setViewMode('card');

  if (!unsubWords) {
    wordsCardView.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:2rem;">濡쒕뵫 以?..</p>';
    wordsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">濡쒕뵫 以?..</td></tr>';

    const q = query(collection(db, `users/${currentUser.uid}/books/${bookId}/chapters/${chapterId}/words`), orderBy('order'));
    unsubWords = onSnapshot(q, (snap) => {
      currentLoadedWords = [];
      if (selectAllWords) selectAllWords.checked = false;
      if (deleteSelectedBtn) deleteSelectedBtn.classList.add('hidden');

      wordCountBadge.textContent = `${snap.size} ?⑥뼱`;
      const allDocs = [];
      snap.forEach(d => {
        const data = { ...d.data(), _ref: d.ref, _path: d.ref.path };
        currentLoadedWords.push(data);
        allDocs.push(data);
      });

      renderCardView(allDocs);
      renderTableView(allDocs);
      updateHideToggleAvailability(allDocs);
    }, (e) => {
      console.error(e);
      wordsCardView.innerHTML = `<p style="text-align:center;color:var(--danger);padding:2rem;">?ㅻ쪟: ${e.message}</p>`;
    });
  }
}

// ??? Parse Word Data ??????????????????????????????????????????????????????????
// Handles both old {front, back} format and new structured format
function parseWordData(data) {
  // If has structured fields, use them directly
  if (data.word) {
    return {
      word: data.word || data.front || '',
      pos: data.pos || '',
      pronunciation: data.pronunciation || '',
      meaning: data.meaning || '',
      examples: Array.isArray(data.examples) ? data.examples : [],
      synonyms: Array.isArray(data.synonyms) ? data.synonyms : [],
      antonyms: Array.isArray(data.antonyms) ? data.antonyms : [],
      related: Array.isArray(data.related) ? data.related : [],
      etymology: Array.isArray(data.etymology) ? data.etymology : [],
      front: data.front || data.word || '',
      back: data.back || '',
      _path: data._path || ''
    };
  }

  // Legacy: parse from front/back text
  const front = data.front || '';
  const back = data.back || '';

  // Parse front: "word  ?? [pronunciation]"
  const frontParts = front.split(/\s{2,}/);
  const word = frontParts[0] || front;
  let pos = '';
  let pronunciation = '';
  for (let i = 1; i < frontParts.length; i++) {
    if (frontParts[i].startsWith('[') || frontParts[i].startsWith('(')) {
      pronunciation = frontParts[i];
    } else {
      pos = frontParts[i];
    }
  }

  // Parse back sections by emoji labels
  let meaning = '';
  let examples = [];
  let synonyms = [];
  let antonyms = [];
  let related = [];
  let etymology = [];

  const sections = back.split(/\n\n/);
  for (const section of sections) {
    const trimmed = section.trim();
    if (trimmed.startsWith('?뱦 ??)) {
      meaning = trimmed.replace(/^?뱦 ??n?/, '').trim();
    } else if (trimmed.startsWith('?뱰 ?덈Ц')) {
      examples = trimmed.replace(/^?뱰 ?덈Ц\n?/, '').split('\n').map(s => s.replace(/^??s*/, '').trim()).filter(Boolean);
    } else if (trimmed.startsWith('?㎥ ?댁썝')) {
      etymology = trimmed.replace(/^?㎥ ?댁썝\n?/, '').replace(/^??s*/, '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
    } else if (trimmed.startsWith('???좎쓽??)) {
      synonyms = trimmed.replace(/^???좎쓽??n?/, '').split('\n').map(s => s.replace(/^??s*/, '').trim()).filter(Boolean);
    } else if (trimmed.startsWith('??諛섏쓽??)) {
      antonyms = trimmed.replace(/^??諛섏쓽??n?/, '').split('\n').map(s => s.replace(/^??s*/, '').trim()).filter(Boolean);
    } else if (trimmed.startsWith('?뵕 愿?⑥뼱')) {
      related = trimmed.replace(/^?뵕 愿?⑥뼱\n?/, '').split('\n').map(s => s.replace(/^??s*/, '').trim()).filter(Boolean);
    } else if (!meaning && trimmed) {
      // Fallback: if no label, treat as meaning
      meaning = trimmed;
    }
  }

  // If no parsed meaning, use back directly
  if (!meaning && !examples.length) {
    meaning = back;
  }

  return { ...data, word, pos, pronunciation, meaning, examples, synonyms, antonyms, related, etymology, front, back };
}

// ??? Render Card View ?????????????????????????????????????????????????????????
function renderCardView(docs) {
  if (docs.length === 0) {
    wordsCardView.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:3rem;">?⑥뼱媛 ?놁뒿?덈떎. [???⑥뼱 異붿텧?섍린] 踰꾪듉?쇰줈 異붽??섏꽭??</p>';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'words-card-grid';

  docs.forEach((data, idx) => {
    const parsed = parseWordData(data);
    const card = document.createElement('div');
    card.className = 'word-card list-item-enter';
    card.style.animationDelay = `${idx * 0.03}s`;

    // Build related sections HTML - each item on its own line
    const buildRelatedSection = (items, emoji, label, cls) => {
      if (!items || !items.length) return '';
      const lines = items.map(s => {
        let word = '', pos = '', meaning = '';
        
        // Match patterns like "word [pos]: meaning" or "word (pos): meaning" or "word: meaning"
        const match = s.match(/^([^\[\(:竊?-]+)(?:\[(.*?)\]|\((.*?)\))?(?:\s*[:竊?-]\s*)(.*)$/);
        
        if (match) {
          word = match[1].trim();
          pos = (match[2] || match[3] || '').trim();
          meaning = match[4].trim();
          
          let posHtml = pos ? `<span class="related-item-pos" style="color:var(--primary);font-size:0.8rem;margin-left:4px;">[${escapeHTML(pos)}]</span>` : '';
          return `<div class="related-item"><span class="related-item-word">${escapeHTML(word)}</span>${posHtml}<span class="related-item-colon">:</span><span class="related-item-meaning"> ${escapeHTML(meaning)}</span></div>`;
        }
        
        // Fallback for simple "word: meaning" without proper colon but spaces?
        const spaceMatch = s.match(/^([A-Za-z0-9_]+)\s+(\[[^\]]+\]|\([^)]+\))?\s*(.*)$/);
        if (spaceMatch && !s.includes(':') && !s.includes('-') && !s.includes('竊?)) {
           word = spaceMatch[1].trim();
           pos = (spaceMatch[2] || '').replace(/[\[\]\(\)]/g, '').trim();
           meaning = spaceMatch[3].trim();
           let posHtml = pos ? `<span class="related-item-pos" style="color:var(--primary);font-size:0.8rem;margin-left:4px;">[${escapeHTML(pos)}]</span>` : '';
           return `<div class="related-item"><span class="related-item-word">${escapeHTML(word)}</span>${posHtml}<span class="related-item-colon">:</span><span class="related-item-meaning"> ${escapeHTML(meaning)}</span></div>`;
        }

        return `<div class="related-item"><span class="related-item-meaning">${escapeHTML(s)}</span></div>`;
      }).join('');
      return `
        <div class="word-card-section word-section-related">
          <div class="word-card-section-label">${emoji} ${label}</div>
          <div class="word-card-related-list">${lines}</div>
        </div>`;
    };

    const buildEtymologySection = (items, targetWord) => {
      if (!items || !items.length) return '';
      const lines = items.map((s) => {
        const match = s.match(/(.+?)\((.+?)\)/);
        let chipHtml = `<span class="ety-chip">${escapeHTML(s)}</span>`;
        if (match) {
          chipHtml = `<span class="ety-chip"><span class="ety-en">${escapeHTML(match[1].trim())}</span><span class="ety-ko">${escapeHTML(match[2].trim())}</span></span>`;
        }
        return chipHtml;
      }).join('');
      return `<div class="word-card-section word-section-etymology">
        <div class="word-card-section-label" style="color:var(--primary); font-weight:600; margin-bottom:6px;">?㎥ ?댁썝 寃고빀 釉붾줉</div>
        <div class="ety-container">
          ${lines}
          <div class="ety-result-wrap">
            <span class="ety-arrow">??/span>
            <span class="ety-result">${escapeHTML(targetWord)}</span>
          </div>
        </div>
      </div>`;
    };

    const etySection = buildEtymologySection(parsed.etymology, parsed.word);
    const synSection = buildRelatedSection(parsed.synonyms, '??, '?좎쓽??);
    const antSection = buildRelatedSection(parsed.antonyms, '??, '諛섏쓽??);
    const relSection = buildRelatedSection(parsed.related, '?뵕', '愿?⑥뼱');
    const hasRelated = (parsed.synonyms?.length || parsed.antonyms?.length || parsed.related?.length);

    card.innerHTML = `
      <div class="word-card-header">
        <span class="word-card-word word-section-word">${escapeHTML(parsed.word)}</span>
        <button class="pronounce-btn" data-word="${escapeHTML(parsed.word)}" title="諛쒖쓬 ?ｊ린" style="background:none;border:none;cursor:pointer;font-size:1.1rem;margin-left:4px;vertical-align:middle;padding:2px;opacity:0.8;transition:opacity 0.2s;">?뵄</button>
        ${parsed.pos ? `<span class="word-card-pos word-section-meaning">${escapeHTML(parsed.pos)}</span>` : ''}
        ${parsed.pronunciation ? `<span class="word-card-pron word-section-word">${escapeHTML(parsed.pronunciation)}</span>` : ''}
        <span class="word-card-num">${idx + 1}</span>
      </div>
      ${parsed.meaning ? `
        <div class="word-card-section word-section-meaning">
          <div class="word-card-section-label">?뱦 ??/div>
          <div class="word-card-meaning">${escapeHTML(parsed.meaning)}</div>
        </div>
      ` : ''}
      ${etySection}
      ${parsed.examples.length ? `
        <div class="word-card-section word-section-example">
          <div class="word-card-section-label">?뱰 ?덈Ц</div>
          <div class="word-card-example">${parsed.examples.map(e => {
            const match = e.match(/^(.*?)\s*\(([^)]+)\)$/);
            if (match) {
              return `<div class="ex-en">${highlightExample(match[1], parsed.word)}</div><div class="ex-ko">${escapeHTML(match[2])}</div>`;
            }
            return `<div class="ex-en">${highlightExample(e, parsed.word)}</div>`;
          }).join('')}</div>
        </div>
      ` : ''}
      ${hasRelated ? `<div class="word-card-related-group">${synSection}${antSection}${relSection}</div>` : ''}
      <div class="word-card-actions">
        <button class="word-card-edit-btn">?륅툘 ?섏젙</button>
        <button class="word-card-delete-btn">?뿊 ??젣</button>
      </div>
    `;

    card.querySelector('.word-card-edit-btn').onclick = () => openEditModal(data);

    card.querySelector('.word-card-delete-btn').onclick = async () => {
      if (await showConfirm('???⑥뼱瑜???젣?섏떆寃좎뒿?덇퉴?')) {
        try { await deleteDoc(data._ref); }
        catch(err) { alert('??젣 ?ㅽ뙣: ' + err.message); }
      }
    };

    grid.appendChild(card);
  });

  wordsCardView.innerHTML = '';
  wordsCardView.appendChild(grid);
  applyHideState();
}

// ??? Render Table View ????????????????????????????????????????????????????????
function renderTableView(docs) {
  wordsTbody.innerHTML = '';
  if (docs.length === 0) {
    wordsTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:3rem 0;"><div class="empty-state">
  <div class="empty-state-icon">?뱰</div>
  <p class="empty-state-title">?깅줉???⑥뼱媛 ?놁뒿?덈떎</p>
  <p class="empty-state-desc">+ 踰꾪듉???뚮윭 泥??⑥뼱瑜?異붽???蹂댁꽭??</p>
</div></td></tr>`;
    return;
  }
  docs.forEach((data, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'list-item-enter';
    tr.style.animationDelay = `${idx * 0.02}s`;
    tr.innerHTML = `<td><input type="checkbox" class="word-chk" data-path="${data._path}" /></td><td>${idx+1}</td><td style="font-weight:600;color:var(--primary-light);">${escapeHTML(data.front)}</td><td style="white-space:pre-wrap;font-size:0.82rem;color:var(--text-secondary);">${escapeHTML(data.back)}</td>
      <td><div style="display:flex;gap:4px;">
        <button class="word-card-edit-btn" style="font-size:0.78rem;padding:4px 10px;">?섏젙</button>
        <button class="word-card-delete-btn" style="font-size:0.78rem;padding:4px 10px;">??젣</button>
      </div></td>`;
    tr.querySelector('.word-card-edit-btn').onclick = () => openEditModal(data);
    tr.querySelector('.word-card-delete-btn').onclick = async () => {
      if (await showConfirm('???⑥뼱瑜???젣?섏떆寃좎뒿?덇퉴?')) {
        try { await deleteDoc(data._ref); }
        catch(err) { alert('??젣 ?ㅽ뙣: ' + err.message); }
      }
    };
    tr.querySelector('.word-chk').addEventListener('change', updateDeleteBtn);
    wordsTbody.appendChild(tr);
  });
}

// ??? Edit Word Modal ??????????????????????????????????????????????????????????
function openEditModal(docData) {
  const parsed = parseWordData(docData);
  currentEditDocRef = docData._ref;

  $('edit-word').value = parsed.word || '';
  $('edit-pos').value = parsed.pos || '';
  $('edit-pron').value = parsed.pronunciation || '';
  $('edit-meaning').value = parsed.meaning || '';
  $('edit-examples').value = (parsed.examples || []).join('\n');
  $('edit-etymology').value = (parsed.etymology || []).join('\n');
  $('edit-synonyms').value = (parsed.synonyms || []).join('\n');
  $('edit-antonyms').value = (parsed.antonyms || []).join('\n');
  $('edit-related').value = (parsed.related || []).join('\n');

  editWordModal.classList.remove('hidden');
}

editWordCancel.addEventListener('click', () => {
  editWordModal.classList.add('hidden');
});

editWordSave.addEventListener('click', async () => {
  if (!currentEditDocRef) return;
  const word = $('edit-word').value.trim();
  const pos = $('edit-pos').value.trim();
  const pron = $('edit-pron').value.trim();
  const meaning = $('edit-meaning').value.trim();
  
  const getArray = (id) => $(id).value.split('\n').map(s=>s.trim()).filter(Boolean);
  const examples = getArray('edit-examples');
  const etymology = getArray('edit-etymology');
  const synonyms = getArray('edit-synonyms');
  const antonyms = getArray('edit-antonyms');
  const related = getArray('edit-related');

  let front = word;
  if (pos) front += `  ${pos}`;
  if (pron) front += `  ${pron}`;

  const parts = [];
  if (meaning) parts.push(`?뱦 ??n${pos ? pos + ' ' : ''}${meaning}`);
  if (etymology.length) parts.push(`?㎥ ?댁썝\n??${etymology.join(' + ')}`);
  if (synonyms.length) parts.push(`???좎쓽??n??${synonyms.join('\n??')}`);
  if (antonyms.length) parts.push(`??諛섏쓽??n??${antonyms.join('\n??')}`);
  if (related.length) parts.push(`?뵕 愿?⑥뼱\n??${related.join('\n??')}`);
  if (examples.length) parts.push(`?뱰 ?덈Ц\n??${examples.join('\n??')}`);
  const back = parts.join('\n\n');

  const updatedData = {
    word, pos, pronunciation: pron, meaning, examples, synonyms, antonyms, related, etymology, front, back
  };

  try {
    const org = editWordSave.textContent;
    editWordSave.textContent = '???以?..';
    editWordSave.disabled = true;
    await updateDoc(currentEditDocRef, updatedData);
    editWordModal.classList.add('hidden');
    editWordSave.textContent = org;
    editWordSave.disabled = false;
  } catch(e) {
    alert('?섏젙 ?ㅽ뙣: ' + e.message);
    editWordSave.disabled = false;
    editWordSave.textContent = '???;
  }
});

// ??? View Toggle (Card / Edit / Swipe) ???????????????????????????????????????
function setViewMode(mode) {
  const oldMode = currentViewMode;
  currentViewMode = mode;
  
  // Reset all buttons
  [viewCardBtn, viewSwipeBtn].forEach(b => b?.classList.remove('active'));

  const actionBar = document.querySelector('.words-action-bar');
  if (actionBar && mode !== 'swipe') actionBar.classList.remove('hidden');
  
  if (mode === 'card') {
    viewCardBtn.classList.add('active');
    document.body.classList.remove('shorts-mode-active');
  } else if (mode === 'edit') {
    // Clear all hide states when entering edit mode
    hideState = { word: true, meaning: true, example: true, related: true };
    document.querySelectorAll('.hide-toggle-btn[data-target]').forEach(b => b.classList.add('active'));
    applyHideState();
    document.body.classList.remove('shorts-mode-active');
  } else if (mode === 'swipe') {
    viewSwipeBtn.classList.add('active');
    document.body.classList.add('shorts-mode-active');
    renderSwipeView();
    requestAnimationFrame(adjustSwipeViewHeight);
  }

  // Animation Sliding Logic
  const newIndex = mode === 'card' ? 0 : mode === 'edit' ? 1 : 2;
  const views = [wordsCardView, wordsEditView, wordsSwipeView];

  // Move grid dynamically between Card and Edit views
  const grid = document.querySelector('.words-card-grid');
  if (grid) {
    if (mode === 'card') {
      if (oldMode === 'edit') {
        const clone = grid.cloneNode(true);
        wordsEditView.appendChild(clone);
        setTimeout(() => clone.remove(), 400); // cleanup clone
      }
      wordsCardView.appendChild(grid);
      grid.classList.remove('edit-mode-active');
    } else if (mode === 'edit') {
      if (oldMode === 'card') {
        const clone = grid.cloneNode(true);
        wordsCardView.appendChild(clone);
        setTimeout(() => clone.remove(), 400); // cleanup clone
      }
      wordsEditView.appendChild(grid);
      grid.classList.add('edit-mode-active');
    }
  }

  // Apply CSS transition classes
  views.forEach((v, i) => {
    if (!v) return;
    v.classList.remove('active-view', 'idle-left', 'idle-right', 'hidden');
    if (i < newIndex) {
      v.classList.add('idle-left');
    } else if (i > newIndex) {
      v.classList.add('idle-right');
    } else {
      v.classList.add('active-view');
    }
  });

  // Apply CSS transition classes for hideToggleBar
  hideToggleBar.classList.remove('active-view', 'idle-left', 'idle-right');
  if (mode === 'edit') {
    hideToggleBar.classList.add('idle-left');
  } else {
    // Show in both card and swipe modes
    hideToggleBar.classList.add('active-view');
  }
}

viewCardBtn.addEventListener('click', () => setViewMode('card'));
viewTableBtn.addEventListener('click', () => setViewMode('edit'));
viewSwipeBtn.addEventListener('click', () => setViewMode('swipe'));

// Compute exact remaining height for swipe view using actual DOM measurements
function adjustSwipeViewHeight() {
  const swipeView = document.getElementById('words-swipe-view');
  if (!swipeView) return;
  const vph = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const rect = swipeView.getBoundingClientRect();
  const available = vph - rect.top;
  swipeView.style.height = Math.max(available, 200) + 'px';
  fitSwipeCard();
}

// Re-adjust if window/viewport size changes (mobile address bar show/hide)
window.visualViewport?.addEventListener('resize', () => {
  if (document.body.classList.contains('shorts-mode-active')) adjustSwipeViewHeight();
});



// ??? Swipe (Shorts) View ??????????????????????????????????????????????????????
function buildSwipeCardHTML(parsed, originalIdx) {
  const buildRelatedSection = (items, emoji, label) => {
    if (!items || !items.length) return '';
    const lines = items.map(s => {
      const match = s.match(/^([^\[\(:竊?-]+)(?:\[(.*?)\]|\((.*?)\))?(?:\s*[:竊?-]\s*)(.*)$/);
      if (match) {
        const word = match[1].trim();
        const pos = (match[2] || match[3] || '').trim();
        const meaning = match[4].trim();
        let posHtml = pos ? `<span class="related-item-pos" style="color:var(--primary);margin-left:4px;">[${escapeHTML(pos)}]</span>` : '';
        return `<div class="related-item"><span class="related-item-word">${escapeHTML(word)}</span>${posHtml}<span class="related-item-colon">:</span><span class="related-item-meaning"> ${escapeHTML(meaning)}</span></div>`;
      }
      return `<div class="related-item"><span class="related-item-meaning">${escapeHTML(s)}</span></div>`;
    }).join('');
    return `<div class="word-card-section word-section-related">
      <div class="word-card-section-label">${emoji} ${label}</div>
      <div class="word-card-related-list">${lines}</div>
    </div>`;
  };
  const buildEtymologySection = (items, targetWord) => {
    if (!items || !items.length) return '';
    const lines = items.map((s) => {
      const match = s.match(/(.+?)\((.+?)\)/);
      let chipHtml = `<span class="ety-chip">${escapeHTML(s)}</span>`;
      if (match) {
        chipHtml = `<span class="ety-chip"><span class="ety-en">${escapeHTML(match[1].trim())}</span><span class="ety-ko">${escapeHTML(match[2].trim())}</span></span>`;
      }
      return chipHtml;
    }).join('');
    return `<div class="word-card-section word-section-etymology">
      <div class="word-card-section-label" style="color:var(--primary); font-weight:600; margin-bottom:6px;">?㎥ ?댁썝 寃고빀 釉붾줉</div>
      <div class="ety-container">
        ${lines}
        <div class="ety-result-wrap">
          <span class="ety-arrow">??/span>
          <span class="ety-result">${escapeHTML(targetWord)}</span>
        </div>
      </div>
    </div>`;
  };

  const etySection = buildEtymologySection(parsed.etymology, parsed.word);
  const synSection = buildRelatedSection(parsed.synonyms, '??, '?좎쓽??);
  const antSection = buildRelatedSection(parsed.antonyms, '??, '諛섏쓽??);
  const relSection = buildRelatedSection(parsed.related, '?뵕', '愿?⑥뼱');
  const hasRelated = (parsed.synonyms?.length || parsed.antonyms?.length || parsed.related?.length);

  return `
    <div class="swipe-card-content">
      <div class="word-card-header" style="border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:0.8rem;display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
        <span class="word-card-word word-section-word">${escapeHTML(parsed.word)}</span>
        <button class="pronounce-btn" data-word="${escapeHTML(parsed.word)}" title="諛쒖쓬 ?ｊ린" style="background:none;border:none;cursor:pointer;margin-left:2px;vertical-align:middle;padding:4px;opacity:0.8;">?뵄</button>
        ${parsed.pos ? `<span class="word-card-pos word-section-meaning">${escapeHTML(parsed.pos)}</span>` : ''}
        ${parsed.pronunciation ? `<span class="word-card-pron word-section-word">${escapeHTML(parsed.pronunciation)}</span>` : ''}
        <span class="word-card-num">${originalIdx + 1}</span>
      </div>
      ${parsed.meaning ? `<div class="word-card-section word-section-meaning">
        <div class="word-card-section-label">?뱦 ??/div>
        <div class="word-card-meaning">${escapeHTML(parsed.meaning)}</div>
      </div>` : ''}
      ${etySection}
      ${parsed.examples.length ? `<div class="word-card-section word-section-example">
        <div class="word-card-section-label">?뱰 ?덈Ц</div>
        <div class="word-card-example">${parsed.examples.map(e => {
            const match = e.match(/^(.*?)\s*\(([^)]+)\)$/);
            if (match) {
              return `<div class="ex-en">${highlightExample(match[1], parsed.word)}</div><div class="ex-ko">${escapeHTML(match[2])}</div>`;
            }
            return `<div class="ex-en">${highlightExample(e, parsed.word)}</div>`;
          }).join('')}</div>
      </div>` : ''}
      ${hasRelated ? `<div class="word-card-related-group">${synSection}${antSection}${relSection}</div>` : ''}
    </div>
  `;
}

function renderSwipeView() {
  swipeWords = [...currentLoadedWords];
  if (!swipeWords.length) {
    wordsSwipeView.innerHTML = `<div class="empty-state" style="padding-top: 10vh;">
  <div class="empty-state-icon">?뱰</div>
  <p class="empty-state-title">?깅줉???⑥뼱媛 ?놁뒿?덈떎</p>
  <p class="empty-state-desc">+ 踰꾪듉???뚮윭 泥??⑥뼱瑜?異붽???蹂댁꽭??</p>
</div>`;
    return;
  }
  swipeIndex = 0;

  wordsSwipeView.innerHTML = `
    <div id="swipe-wrap" class="swipe-card-wrap slide-in-top">
      <div class="swipe-card" id="swipe-card"></div>
    </div>
  `;

  // No longer wiring up inline hide-toggle buttons as we use global hide-toggle-bar

  renderSwipeCard(0);
  setupSwipeGestures();
}

function renderSwipeCard(idx) {
  const card = document.getElementById('swipe-card');
  const counter = document.getElementById('swipe-counter');
  if (!card) return;
  
  const rawWord = swipeWords[idx];
  const parsed = parseWordData(rawWord);
  const originalIdx = currentLoadedWords.indexOf(rawWord);
  
  card.innerHTML = buildSwipeCardHTML(parsed, originalIdx);
  counter.textContent = `${idx + 1} / ${swipeWords.length}`;



  if (autoPlayPronunciation) {
    playPronunciation(parsed.word);
  }
  
  // Adjust font size if content overflows
  fitSwipeCard();
}

function fitSwipeCard() {
  const card = document.getElementById('swipe-card');
  const wrap = document.getElementById('swipe-wrap');
  if (!card || !wrap) return;

  // Reset base font size
  let percent = 100;
  card.style.fontSize = percent + '%';
  
  // Force layout calculation
  void card.offsetHeight;
  
  // Shrink font size gradually until it fits (minimum 55%)
  while (card.scrollHeight > wrap.clientHeight && percent > 55) {
    percent -= 3;
    card.style.fontSize = percent + '%';
    void card.offsetHeight;
  }
}

// ??? Peek Mode: Click on hidden element to reveal for 2s ????????????????????????????????????
// Shared peek handler via event delegation
function handlePeekClick(e) {
  const target = e.target;
  let section = null;
  
  if (target.closest('.word-section-word') && document.body.classList.contains('hide-word-state')) section = target.closest('.word-section-word');
  else if (target.closest('.word-section-etymology') && document.body.classList.contains('hide-word-state')) section = target.closest('.word-section-etymology');
  else if (target.closest('.word-section-meaning') && document.body.classList.contains('hide-meaning-state')) section = target.closest('.word-section-meaning');
  else if (target.closest('.word-section-example') && document.body.classList.contains('hide-example-state')) section = target.closest('.word-section-example');
  else if (target.closest('.word-section-related') && document.body.classList.contains('hide-related-state')) section = target.closest('.word-section-related');

  if (!section) return;
  e.stopPropagation();
  section.classList.remove('peeking');
  void section.offsetWidth;  // force reflow to restart animation
  section.classList.add('peeking');
  setTimeout(() => {
    section.classList.remove('peeking');
  }, 2000);
}

wordsCardView.addEventListener('click', handlePeekClick);
wordsSwipeView.addEventListener('click', handlePeekClick);

function navigateSwipe(dir) { // dir: 1 = next (swipe up), -1 = prev (swipe down)
  const wrap = document.getElementById('swipe-wrap');
  if (!wrap) return;
  const newIdx = swipeIndex + dir;
  if (newIdx < 0 || newIdx >= swipeWords.length) return;

  const outClass = dir === 1 ? 'slide-out-top' : 'slide-out-bottom';
  const inClass = dir === 1 ? 'slide-from-bottom' : 'slide-from-top';

  wrap.classList.remove('slide-in-top', 'slide-in-bottom');
  wrap.classList.add(outClass);

  setTimeout(() => {
    swipeIndex = newIdx;
    renderSwipeCard(swipeIndex);
    
    // Disable transition to jump instantly to the starting position
    wrap.style.transition = 'none';
    wrap.classList.remove(outClass);
    wrap.classList.add(inClass);
    
    // Force reflow
    void wrap.offsetWidth;
    
    // Restore transition and animate in
    wrap.style.transition = '';
    wrap.classList.remove(inClass);
    wrap.classList.add('slide-in-top');
  }, 280);
}

let swipeDidOccur = false;

function setupSwipeGestures() {
  const el = wordsSwipeView;
  let startY = 0, isDragging = false;

  const onDragStart = (y) => {
    startY = y;
    isDragging = true;
    swipeDidOccur = false;
  };
  const onDragEnd = (y) => {
    if (!isDragging) return;
    isDragging = false;
    const dy = y - startY;
    if (Math.abs(dy) < 40) return;
    swipeDidOccur = true;
    navigateSwipe(dy < 0 ? 1 : -1);
  };

  // Touch Events
  el.addEventListener('touchstart', e => onDragStart(e.touches[0].clientY), { passive: true });
  el.addEventListener('touchend', e => onDragEnd(e.changedTouches[0].clientY), { passive: true });

  // Mouse Events
  el.addEventListener('mousedown', e => onDragStart(e.clientY));
  el.addEventListener('mouseup', e => onDragEnd(e.clientY));
  el.addEventListener('mouseleave', e => onDragEnd(e.clientY));
  el.addEventListener('mousemove', e => { if(isDragging) e.preventDefault(); });

  el.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) < 30) return;
    navigateSwipe(e.deltaY > 0 ? 1 : -1);
  }, { passive: true });
}

// Swallow clicks that occur immediately after dragging
wordsSwipeView.addEventListener('click', e => {
  if (swipeDidOccur) {
    e.stopPropagation();
    swipeDidOccur = false;
  }
}, { capture: true });

const exportModal = $('export-modal');
const closeExportBtn = $('close-export-btn');
const downloadCsvBtn = $('download-csv-btn');

exportCsvBtn.addEventListener('click', () => {
  if (!currentLoadedWords.length) { alert('?대낫???⑥뼱媛 ?놁뒿?덈떎.'); return; }
  openModal(exportModal);
});

if (closeExportBtn) {
  closeExportBtn.addEventListener('click', () => closeModal(exportModal));
}

if (downloadCsvBtn) {
  downloadCsvBtn.addEventListener('click', () => {
    if (!currentLoadedWords.length) return;
    const frontOpt = cardFrontSel.value;
    const backOpt = cardBackSel.value;
    
    const csvLines = currentLoadedWords.map(w => {
      const formatted = formatCard(w, frontOpt, backOpt);
      return `${escapeCSV(formatted.front)},${escapeCSV(formatted.back)}`;
    });
    
    const csv = '\uFEFF' + csvLines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${crumbChapterName.textContent || 'words'}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    closeModal(exportModal);
  });
}

const shuffleBtn = document.getElementById('shuffle-swipe-btn');
if (shuffleBtn) {
  shuffleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wrap = document.getElementById('swipe-wrap');
    if (!wrap) return;

    shuffleBtn.style.transform = 'scale(0.9)';
    setTimeout(() => shuffleBtn.style.transform = 'scale(1)', 150);

    wrap.style.transition = 'none';
    wrap.classList.add('shuffle-anim');
    
    setTimeout(() => {
      // Swap data halfway through animation
      // Only shuffle from the current card (swipeIndex) onwards, preserving studied cards
      for (let i = swipeWords.length - 1; i > swipeIndex; i--) {
        const j = Math.floor(Math.random() * (i - swipeIndex + 1)) + swipeIndex;
        [swipeWords[i], swipeWords[j]] = [swipeWords[j], swipeWords[i]];
      }
      // Do not reset swipeIndex to 0. Keep them at their current position!
      renderSwipeCard(swipeIndex);
    }, 200);

    setTimeout(() => {
      wrap.classList.remove('shuffle-anim');
      wrap.style.transition = '';
    }, 400);
  });
}

const autoPlayBtn = document.getElementById('auto-play-toggle');
if (autoPlayBtn) {
  // Set initial active state
  if (autoPlayPronunciation) autoPlayBtn.classList.add('active');
  autoPlayBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    autoPlayPronunciation = !autoPlayPronunciation;
    autoPlayBtn.textContent = autoPlayPronunciation ? '?뵄' : '?뵁';
    autoPlayBtn.classList.toggle('active', autoPlayPronunciation);
    if (autoPlayPronunciation && swipeWords[swipeIndex]) {
       const parsed = parseWordData(swipeWords[swipeIndex]);
       playPronunciation(parsed.word);
    }
  });
}

// ??? Hide Toggles ?????????????????????????????????????????????????????????????
function updateHideToggleAvailability(words) {
  let hasExample = false;
  let hasRelated = false;
  
  for (const w of words) {
    const parsed = parseWordData(w);
    if (parsed.examples && parsed.examples.length > 0) hasExample = true;
    if (parsed.related && parsed.related.length > 0) hasRelated = true;
    if (hasExample && hasRelated) break;
  }
  
  document.querySelectorAll('.hide-toggle-btn[data-target]').forEach(btn => {
    const target = btn.dataset.target;
    let available = true;
    if (target === 'example') available = hasExample;
    else if (target === 'related') available = hasRelated;
    
    if (!available) {
      btn.disabled = true;
      btn.style.opacity = '0.3';
      btn.title = '?대떦 ?곗씠?곌? ?놁뒿?덈떎';
      if (hideState[target]) {
        hideState[target] = false;
        btn.classList.add('active');
        applyHideState();
      }
    } else {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.title = '';
    }
  });
}

function applyHideState() {
  const states = [
    { cls: 'hide-word-state', val: !hideState.word },
    { cls: 'hide-meaning-state', val: !hideState.meaning },
    { cls: 'hide-example-state', val: !hideState.example },
    { cls: 'hide-related-state', val: !hideState.related }
  ];
  
  states.forEach(s => {
    document.body.classList.toggle(s.cls, s.val);
    if (wordsCardView) wordsCardView.classList.toggle(s.cls, s.val);
    if (wordsSwipeView) wordsSwipeView.classList.toggle(s.cls, s.val);
  });
  
  // Force reflow for Safari bug
  if (wordsCardView) void wordsCardView.offsetHeight;
}

document.querySelectorAll('.hide-toggle-btn[data-target]').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    hideState[target] = !hideState[target];
    btn.classList.toggle('active', hideState[target]);
    applyHideState();
  });
});



// ??? Create Book / Chapter ????????????????????????????????????????????????????
addBookBtn.addEventListener('click', async () => {
  const name = await showPrompt('???⑥뼱?μ쓽 ?대쫫???낅젰?섏꽭??');
  if (!name || !name.trim()) return;
  try {
    await addDoc(collection(db, `users/${currentUser.uid}/books`), {
      name: name.trim(), createdAt: serverTimestamp()
    });
  } catch (e) {
    alert('?⑥뼱???앹꽦 ?ㅽ뙣: ' + e.message);
  }
});

addChapterBtn.addEventListener('click', async () => {
  const name = await showPrompt('???⑥썝(梨뺥꽣)???대쫫???낅젰?섏꽭??');
  if (!name || !name.trim() || !selectedBookId) return;
  try {
    await addDoc(collection(db, `users/${currentUser.uid}/books/${selectedBookId}/chapters`), {
      name: name.trim(), createdAt: serverTimestamp()
    });
  } catch (e) {
    alert('?⑥썝 ?앹꽦 ?ㅽ뙣: ' + e.message);
  }
});

// ??? CSV Export ???????????????????????????????????????????????????????????????
exportCsvBtn.addEventListener('click', () => {
  if (!currentLoadedWords.length) { alert('?대낫???⑥뼱媛 ?놁뒿?덈떎.'); return; }
  const csv = '\uFEFF' + currentLoadedWords.map(w => `${escapeCSV(w.front)},${escapeCSV(w.back)}`).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${crumbChapterName.textContent || 'words'}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ??? Multi-Delete ?????????????????????????????????????????????????????????????
function updateDeleteBtn() {
  const checked = document.querySelectorAll('.word-chk:checked').length;
  const total = document.querySelectorAll('.word-chk').length;
  deleteSelectedBtn.classList.toggle('hidden', checked === 0);
  selectAllWords.checked = (checked === total && total > 0);
}

selectAllWords.addEventListener('change', e => {
  document.querySelectorAll('.word-chk').forEach(chk => chk.checked = e.target.checked);
  updateDeleteBtn();
});

deleteSelectedBtn.addEventListener('click', async () => {
  const chks = document.querySelectorAll('.word-chk:checked');
  if (!chks.length) return;
  if (!await showConfirm(`?좏깮??${chks.length}媛쒖쓽 ?⑥뼱瑜???젣?섏떆寃좎뒿?덇퉴?`)) return;
  deleteSelectedBtn.disabled = true;
  deleteSelectedBtn.textContent = '??젣 以?..';
  try {
    await Promise.all(Array.from(chks).map(chk => deleteDoc(doc(db, chk.dataset.path))));
  } catch(e) {
    alert('??젣 ?ㅽ뙣: ' + e.message);
  } finally {
    deleteSelectedBtn.disabled = false;
    deleteSelectedBtn.textContent = '?뿊 ?좏깮 ??젣';
  }
});

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??// EXTRACT SECTION TOGGLE
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??
openExtractBtn.addEventListener('click', () => openModal(extractModal));
closeExtractBtn.addEventListener('click', () => closeModal(extractModal));

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??// PROMPT GENERATOR
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??
function updatePrompt() {
  if (!promptOutput) return;

  const prompt = `You are an expert vocabulary extraction assistant. Your task is to extract ALL English vocabulary words from the provided source.

CRITICAL EXTRACTION RULES:
1. DO NOT SKIP ANY MAIN VOCABULARY WORDS. You MUST extract EVERY SINGLE main vocabulary word present in the source.
2. If there are dozens of words, you MUST list them ALL. DO NOT give up after a few words.
3. For multiple images or columns, extract from top-to-bottom, left-to-right.

CRITICAL TRANSCRIBING RULES:
1. Act purely as an OCR engine, EXCEPT for the POS (Part of Speech). You MUST use your dictionary knowledge to infer and add the correct POS (e.g., 紐? ?? ?? for the main word, synonyms, antonyms, and related words if they are not explicitly present in the text.
2. For the "meaning" field, you MUST copy the text EXACTLY as it appears. DO NOT summarize.
3. DO NOT use the tilde symbol (~) anywhere in your output. If a Korean meaning requires a placeholder (like "~?섎떎"), use "..." instead (e.g., "...?섎떎"). Tildes cause markdown strikethrough bugs.

OUTPUT FORMAT:
You MUST output a valid JSON array of objects.
Each object MUST have the following keys:
- "word": The English vocabulary word (required)
- "pos": Part of speech (e.g., 紐? ?? ?? (required)
- "pronunciation": Pronunciation symbol (optional)
- "meaning": The Korean meaning exactly as written (required)
- "examples": Array of example sentences (optional)
- "synonyms": Array of strings (optional). MUST format as "English_word [POS]: Korean_meaning".
- "antonyms": Array of strings (optional). MUST format as "English_word [POS]: Korean_meaning".
- "related": Array of strings (optional). MUST format as "English_word [POS]: Korean_meaning".
- "etymology": Array of strings. MUST aggressively analyze the etymology (prefix/root/suffix) of the word. Format as "morpheme(meaning)". For example: ["re(?ㅼ떆)", "view(蹂대떎)"]. If absolutely no etymology can be found, use an empty array.

CRITICAL JSON FORMATTING:
1. Output MUST be a RAW, minified JSON array on a SINGLE LINE.
2. DO NOT use markdown code blocks (\`\`\`json ... \`\`\`).
3. DO NOT output any bullet points, hyphens, or conversational text.
4. Just output the raw JSON array starting exactly with [ and ending with ].`;

  promptOutput.value = prompt;
}

if (promptOutput) updatePrompt();

if (copyPromptBtn) {
  copyPromptBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(promptOutput.value);
      const orgText = copyPromptBtn.textContent;
      copyPromptBtn.textContent = '??蹂듭궗 ?꾨즺!';
      setTimeout(() => copyPromptBtn.textContent = orgText, 2000);
    } catch (e) {
      alert('蹂듭궗 ?ㅽ뙣! 釉뚮씪?곗? 沅뚰븳???뺤씤?댁＜?몄슂.');
    }
  });
}

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??// CONVERT HANDLER
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??
function parseResponse(text) {
  let c = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const s = c.indexOf('[');
  if (s === -1) throw new Error('JSON 諛곗뿴 ?쒖옉 遺遺꾩쓣 李얠쓣 ???놁뒿?덈떎.\nAI媛 以 ?묐떟?먯꽌 [...] ?뺥깭???곗씠?곕? 李얠? 紐삵뻽?듬땲??');
  c = c.slice(s);
  try {
    return JSON.parse(c);
  } catch (err) {
    let lastBrace = c.lastIndexOf('}');
    if (lastBrace !== -1) {
      let fixed = c.slice(0, lastBrace + 1) + ']';
      try { return JSON.parse(fixed); } catch (e) {}
    }
    try { return JSON.parse(c + ']'); } catch (e) {}
    throw new Error(`JSON ?뚯떛 ?ㅻ쪟: ${err.message}\n(AI媛 ?띾뵲?댄몴瑜??섎せ ?쇨굅???띿뒪?멸? ?섎졇?????덉뒿?덈떎)`);
  }
}

function formatCard(item, frontOpt, backOpt) {
  const ensureStringArray = (arr) => Array.isArray(arr) ? arr.map(x => typeof x === 'object' ? Object.values(x).join(' ') : String(x)) : [];

  let front = item.word || '';
  if (frontOpt === 'word_pos' && item.pos) front += `  ${item.pos}`;
  if (frontOpt === 'word_pron' && item.pronunciation) front += `  ${item.pronunciation}`;

  const parts = [];
  if (item.meaning) parts.push(`?뱦 ??n${item.pos ? item.pos + ' ' : ''}${item.meaning}`);
  if (backOpt === 'full') {
    const etys = ensureStringArray(item.etymology);
    const syns = ensureStringArray(item.synonyms);
    const ants = ensureStringArray(item.antonyms);
    const rels = ensureStringArray(item.related);
    if (etys.length) parts.push(`?㎥ ?댁썝\n??${etys.join(' + ')}`);
    if (syns.length) parts.push(`???좎쓽??n??${syns.join('\n??')}`);
    if (ants.length) parts.push(`??諛섏쓽??n??${ants.join('\n??')}`);
    if (rels.length) parts.push(`?뵕 愿?⑥뼱\n??${rels.join('\n??')}`);
  }
  const exs = ensureStringArray(item.examples);
  if (backOpt !== 'meaning_only' && exs.length) parts.push(`?뱰 ?덈Ц\n??${exs.join('\n??')}`);

  // Return full structured data + front/back for compatibility
  return {
    front: front.trim(),
    back: parts.join('\n\n').trim(),
    word: item.word || '',
    pos: item.pos || '',
    pronunciation: item.pronunciation || '',
    meaning: item.meaning || '',
    examples: ensureStringArray(item.examples),
    etymology: ensureStringArray(item.etymology),
    synonyms: ensureStringArray(item.synonyms),
    antonyms: ensureStringArray(item.antonyms),
    related: ensureStringArray(item.related),
  };
}

if (convertBtn) {
  convertBtn.addEventListener('click', async () => {
    hideError();
    const rawText = aiJsonInput.value.trim();
    if (!rawText) {
      alert("AI媛 以 寃곌낵瑜?遺숈뿬?ｌ뼱 二쇱꽭??");
      return;
    }

    // Use full options for the database internal representation
    const frontOpt = 'word_pos';
    const backOpt = 'full';

    convertBtn.disabled = true;
    const orgText = convertBtn.innerHTML;
    convertBtn.innerHTML = '<span class="btn-icon">??/span> 蹂??以?..';

    try {
      const allParsed = parseResponse(rawText);
      if (!Array.isArray(allParsed) || !allParsed.length) {
        throw new Error("寃곌낵?먯꽌 ?⑥뼱瑜?異붿텧?섏? 紐삵뻽?듬땲?? (諛곗뿴??鍮꾩뼱?덉쓬)");
      }

      const seen = new Set();
      const deduped = allParsed.filter(item => {
        const key = (item.word || '').toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      generatedData = deduped.map(item => formatCard(item, frontOpt, backOpt));
      await autoSaveToLibrary(generatedData);
      aiJsonInput.value = '';

    } catch(err) {
      console.error(err);
      showError("蹂???ㅻ쪟", err.message);
    } finally {
      convertBtn.disabled = false;
      convertBtn.innerHTML = orgText;
    }
  });
}

// ??? Auto Save ????????????????????????????????????????????????????????????????
async function autoSaveToLibrary(data) {
  if (!selectedBookId || !selectedChapterId) {
    alert('??ν븷 ?⑥썝??李얠? 紐삵뻽?듬땲?? ?⑥썝(梨뺥꽣) ?덉뿉??異붿텧?댁＜?몄슂.');
    return;
  }
  try {
    let maxOrder = currentLoadedWords.reduce((max, w) => Math.max(max, w.order || 0), -1);
    for (let i = 0; i < data.length; i++) {
      const wordRef = doc(collection(db, `users/${currentUser.uid}/books/${selectedBookId}/chapters/${selectedChapterId}/words`));
      await setDoc(wordRef, { ...data[i], order: maxOrder + 1 + i });
      if (convertBtn) {
        const percent = Math.floor(((i + 1) / data.length) * 100);
        convertBtn.innerHTML = `<span class="btn-icon">??/span> ???以?.. ${percent}%`;
      }
    }
    alert(`${data.length}媛??⑥뼱媛 ?깃났?곸쑝濡???λ릺?덉뒿?덈떎!`);
    if (extractModal) closeModal(extractModal);
  } catch (e) {
    console.error(e);
    alert('????ㅽ뙣: ' + e.message);
  }
}

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??// TEST MODE
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??
const testModal = $('test-modal');
const testSetup = $('test-setup');
const testFlash = $('test-flash');
const testQuiz = $('test-quiz');
const testShort = $('test-short');
const testTrace = $('test-trace');
const testResult = $('test-result');

// Setup options state
let selectedTestMode = 'flash';
let selectedTestDir = 'word2meaning';
let selectedTestOrder = 'sequential';

// Setup button groups
function setupToggleGroup(selector, onSelect) {
  document.querySelectorAll(selector).forEach(btn => {
    btn.addEventListener('click', () => {
      // If it's the direction selector and we're in trace mode, ignore it
      if (selector === '[data-dir]' && btn.classList.contains('disabled-option')) return;
      
      document.querySelectorAll(selector).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onSelect(btn.dataset.mode || btn.dataset.dir || btn.dataset.order);
      
      // Handle Trace mode special UI state
      if (selector === '[data-mode]') {
        const mode = btn.dataset.mode;
        const dirBtns = document.querySelectorAll('[data-dir]');
        if (mode === 'trace') {
          dirBtns.forEach(b => b.classList.add('disabled-option'));
        } else {
          dirBtns.forEach(b => b.classList.remove('disabled-option'));
        }
      }
    });
  });
}

setupToggleGroup('[data-mode]', val => { selectedTestMode = val; });
setupToggleGroup('[data-dir]', val => { selectedTestDir = val; });
setupToggleGroup('[data-order]', val => { selectedTestOrder = val; });

// Open test setup
if (startTestBtn) {
  startTestBtn.addEventListener('click', () => {
    if (currentLoadedWords.length < 1) {
      showToast('?뚯뒪?몃? 吏꾪뻾???⑥뼱媛 ?놁뒿?덈떎.');
      return;
    }
    $('test-word-count-info').textContent = `珥?${currentLoadedWords.length}媛??⑥뼱濡??뚯뒪?명빀?덈떎.`;
    showScreen('setup');
    openModal(testModal);
  });
}

$('test-cancel-btn').addEventListener('click', closeTest);
$('flash-close-btn').addEventListener('click', closeTest);
$('quiz-close-btn').addEventListener('click', closeTest);
$('short-close-btn').addEventListener('click', closeTest);
$('result-close-btn').addEventListener('click', closeTest);
$('result-retry-btn').addEventListener('click', () => startTest(testWords));
$('result-retry-wrong-btn').addEventListener('click', () => {
  const wrongWords = testWords.filter(w => testWrong.includes(parseWordData(w).word));
  startTest(wrongWords);
});

$('test-start-confirm-btn').addEventListener('click', () => {
  testMode = selectedTestMode;
  testDir = selectedTestDir;
  testOrder = selectedTestOrder;
  let words = [...currentLoadedWords];
  if (testOrder === 'random') words = words.sort(() => Math.random() - 0.5);
  startTest(words);
});

function showScreen(name) {
  [testSetup, testFlash, testQuiz, testShort, testTrace, testResult].forEach(s => {
    if (s) s.classList.add('hidden');
  });
  let activeScreen;
  if (name === 'setup') activeScreen = testSetup;
  else if (name === 'flash') activeScreen = testFlash;
  else if (name === 'quiz') activeScreen = testQuiz;
  else if (name === 'short') activeScreen = testShort;
  else if (name === 'trace') activeScreen = testTrace;
  else if (name === 'result') activeScreen = testResult;
  
  if (activeScreen) {
    activeScreen.classList.remove('hidden', 'screen-enter');
    void activeScreen.offsetWidth; // trigger reflow
    activeScreen.classList.add('screen-enter');
  }
}

function closeTest() {
  closeModal(testModal);
}

function startTest(words) {
  testWords = words;
  testIndex = 0;
  testCorrect = 0;
  testWrong = [];

  if (testMode === 'flash') {
    showScreen('flash');
    showFlashCard();
  } else if (testMode === 'quiz') {
    showScreen('quiz');
    showQuizCard();
  } else if (testMode === 'short') {
    showScreen('short');
    showShortCard();
  } else if (testMode === 'trace') {
    showScreen('trace');
    showTraceCard();
  }
}

// ??? Flashcard ????????????????????????????????????????????????????????????????
function showFlashCard() {
  if (testIndex >= testWords.length) {
    showTestResult();
    return;
  }
  const data = parseWordData(testWords[testIndex]);
  const total = testWords.length;
  const pct = (testIndex / total) * 100;

  $('test-progress-fill').style.width = pct + '%';
  $('test-progress-text').textContent = `${testIndex + 1} / ${total}`;

  const card = $('flashcard');
  card.classList.remove('flipped');
  testIsFlipped = false;

  const flashFront = $('flashcard-front');
  const flashBack = $('flashcard-back');
  $('flash-actions').classList.remove('show');
  $('flip-hint').style.display = '';

  if (testDir === 'word2meaning') {
    flashFront.textContent = data.word;
    flashBack.innerHTML = '';
    if (data.meaning) {
      const m = document.createElement('div');
      m.style.cssText = 'font-weight:700;font-size:1.1rem;margin-bottom:8px;';
      m.textContent = data.meaning;
      flashBack.appendChild(m);
    }
    if (data.examples.length) {
      const e = document.createElement('div');
      e.style.cssText = 'font-size:0.85rem;color:var(--text-secondary);font-style:italic;';
      e.textContent = data.examples[0];
      flashBack.appendChild(e);
    }
  } else {
    flashFront.textContent = data.meaning || data.back;
    const wb = document.createElement('div');
    wb.style.cssText = 'font-size:1.8rem;font-weight:700;font-family:var(--font-mono);';
    wb.textContent = data.word;
    flashBack.innerHTML = '';
    flashBack.appendChild(wb);
    if (data.pronunciation) {
      const p = document.createElement('div');
      p.style.cssText = 'font-size:0.9rem;color:var(--text-secondary);';
      p.textContent = data.pronunciation;
      flashBack.appendChild(p);
    }
  }

  // ?낆옣 ?좊땲硫붿씠??  const flashContainer = $('flashcard-container');
  flashContainer.classList.remove('card-slide-in');
  void flashContainer.offsetWidth;
  flashContainer.classList.add('card-slide-in');
}

// Global flip function (called from onclick in HTML)
window.flipCard = function() {
  const card = $('flashcard');
  if (!testIsFlipped) {
    card.classList.add('flipped');
    testIsFlipped = true;
    const actions = $('flash-actions');
    actions.classList.add('show');
    $('flip-hint').style.display = 'none';
  }
};

$('flash-correct-btn').addEventListener('click', () => {
  testCorrect++;
  const flashContainer = $('flashcard-container');
  flashContainer.classList.add('card-slide-out');
  setTimeout(() => {
    flashContainer.classList.remove('card-slide-out');
    testIndex++;
    showFlashCard();
  }, 180);
});

$('flash-wrong-btn').addEventListener('click', () => {
  const data = parseWordData(testWords[testIndex]);
  testWrong.push(data.word);
  const flashContainer = $('flashcard-container');
  flashContainer.classList.add('card-slide-out');
  setTimeout(() => {
    flashContainer.classList.remove('card-slide-out');
    testIndex++;
    showFlashCard();
  }, 180);
});

// ??? Quiz (4吏?좊떎) ???????????????????????????????????????????????????????????
function showQuizCard() {
  if (testIndex >= testWords.length) {
    showTestResult();
    return;
  }
  const data = parseWordData(testWords[testIndex]);
  const total = testWords.length;
  const pct = (testIndex / total) * 100;

  $('quiz-progress-fill').style.width = pct + '%';
  $('quiz-progress-text').textContent = `${testIndex + 1} / ${total}`;

  const questionWord = $('quiz-question-word');
  const choices = $('quiz-choices');
  const questionLabel = document.querySelector('.quiz-question-label');
  const qBox = document.querySelector('#test-quiz .quiz-question-box');
  const fb = $('quiz-feedback');
  if (fb) fb.classList.remove('show-feedback', 'correct-fb', 'wrong-fb');

  [qBox, choices].forEach(el => {
    if (el) {
      el.classList.remove('card-slide-in');
      void el.offsetWidth;
      el.classList.add('card-slide-in');
    }
  });

  // Build choices: 1 correct + 3 random from other words
  const allParsed = currentLoadedWords.map(parseWordData);
  let options;

  if (testDir === 'word2meaning') {
    questionLabel.textContent = '?ㅼ쓬 ?⑥뼱???살??';
    questionWord.textContent = data.word;
    const correctAnswer = data.meaning || data.back || '(???놁쓬)';
    const wrongPool = allParsed
      .filter(w => w.word !== data.word && (w.meaning || w.back))
      .map(w => w.meaning || w.back)
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    options = [correctAnswer, ...wrongPool].sort(() => Math.random() - 0.5);

    choices.innerHTML = '';
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'quiz-choice-btn';
      btn.textContent = opt;
      btn.addEventListener('click', () => handleQuizAnswer(btn, opt, correctAnswer, choices));
      choices.appendChild(btn);
    });
  } else {
    questionLabel.textContent = '?ㅼ쓬 ?살쓽 ?⑥뼱??';
    questionWord.textContent = data.meaning || data.back;
    const correctAnswer = data.word;
    const wrongPool = allParsed
      .filter(w => w.word !== data.word && w.word)
      .map(w => w.word)
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    options = [correctAnswer, ...wrongPool].sort(() => Math.random() - 0.5);

    choices.innerHTML = '';
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'quiz-choice-btn';
      btn.textContent = opt;
      btn.addEventListener('click', () => handleQuizAnswer(btn, opt, correctAnswer, choices));
      choices.appendChild(btn);
    });
  }

  // 紐⑤쫫 踰꾪듉 異붽?
  const dontKnowBtn = document.createElement('button');
  dontKnowBtn.className = 'quiz-choice-btn quiz-dontknow-btn';
  dontKnowBtn.textContent = '?쨺 紐⑤쫫';
  dontKnowBtn.addEventListener('click', () => {
    // 紐⑤뱺 ?좏깮吏 鍮꾪솢?깊솕
    choices.querySelectorAll('.quiz-choice-btn').forEach(b => b.disabled = true);
    // ?뺣떟 ?쒖떆
    const correctAnswer = (testDir === 'word2meaning')
      ? (parseWordData(testWords[testIndex]).meaning || parseWordData(testWords[testIndex]).back || '')
      : parseWordData(testWords[testIndex]).word;
    choices.querySelectorAll('.quiz-choice-btn').forEach(b => {
      if (b.textContent === correctAnswer) b.classList.add('correct');
    });
    dontKnowBtn.classList.add('wrong');
    testWrong.push(parseWordData(testWords[testIndex]).word);
    
    const fb = $('quiz-feedback');
    fb.innerHTML = `<span class="wrong-label">紐⑤쫫 泥섎━??/span><br>?뺣떟: <strong>${escapeHTML(correctAnswer)}</strong>`;
    fb.classList.remove('correct-fb');
    fb.classList.add('wrong-fb', 'show-feedback');
    
    setTimeout(() => { 
      fb.classList.remove('show-feedback');
      testIndex++; 
      animateAndShowQuizCard(); 
    }, 1200);
  });
  choices.appendChild(dontKnowBtn);

  // ?낆옣 ?좊땲硫붿씠??  const quizScreen = $('test-quiz');
  quizScreen.classList.remove('card-slide-in');
  void quizScreen.offsetWidth; // reflow
  quizScreen.classList.add('card-slide-in');
}

function animateAndShowQuizCard() {
  const quizScreen = $('test-quiz');
  quizScreen.classList.add('card-slide-out');
  setTimeout(() => {
    quizScreen.classList.remove('card-slide-out');
    showQuizCard();
  }, 200);
}

function handleQuizAnswer(clickedBtn, selected, correct, choicesEl) {
  // Disable all buttons
  choicesEl.querySelectorAll('.quiz-choice-btn').forEach(b => {
    b.disabled = true;
    if (b.textContent === correct) b.classList.add('correct');
  });

  const fb = $('quiz-feedback');
  if (selected === correct) {
    clickedBtn.classList.add('correct');
    testCorrect++;
    fb.innerHTML = `<span class="correct-label">?뺣떟?낅땲??</span>`;
    fb.classList.remove('wrong-fb');
    fb.classList.add('correct-fb', 'show-feedback');
  } else {
    clickedBtn.classList.add('wrong');
    const data = parseWordData(testWords[testIndex]);
    testWrong.push(data.word);
    fb.innerHTML = `<span class="wrong-label">??몄뒿?덈떎!</span><br>?뺣떟: <strong>${escapeHTML(correct)}</strong>`;
    fb.classList.remove('correct-fb');
    fb.classList.add('wrong-fb', 'show-feedback');
  }

  setTimeout(() => {
    fb.classList.remove('show-feedback');
    testIndex++;
    animateAndShowQuizCard();
  }, 1200);
}

// ??? Virtual Keyboard ???
let vkUseNative = false;
let vkIsShift = false;
let vkLayout = 'en';

const vkLayouts = {
  en: {
    normal: [
      ['q','w','e','r','t','y','u','i','o','p'],
      ['a','s','d','f','g','h','j','k','l'],
      ['Shift','z','x','c','v','b','n','m','??],
      ['EN/KR','Space','Enter']
    ],
    shift: [
      ['Q','W','E','R','T','Y','U','I','O','P'],
      ['A','S','D','F','G','H','J','K','L'],
      ['Shift','Z','X','C','V','B','N','M','??],
      ['EN/KR','Space','Enter']
    ]
  },
  ko: {
    normal: [
      ['??,'??,'??,'??,'??,'??,'??,'??,'??,'??],
      ['??,'??,'??,'??,'??,'??,'??,'??,'??],
      ['Shift','??,'??,'??,'??,'??,'??,'??,'??],
      ['EN/KR','Space','Enter']
    ],
    shift: [
      ['??,'??,'??,'??,'??,'??,'??,'??,'??,'??],
      ['??,'??,'??,'??,'??,'??,'??,'??,'??],
      ['Shift','??,'??,'??,'??,'??,'??,'??,'??],
      ['EN/KR','Space','Enter']
    ]
  }
};

function renderVirtualKeyboard() {
  const container = $('virtual-keyboard-container');
  if (vkUseNative) {
    container.classList.add('hidden');
    $('short-answer-input').removeAttribute('inputmode');
    return;
  }
  container.classList.remove('hidden');
  $('short-answer-input').setAttribute('inputmode', 'none');
  
  const layout = vkLayouts[vkLayout][vkIsShift ? 'shift' : 'normal'];
  container.innerHTML = '';
  
  layout.forEach(rowKeys => {
    const row = document.createElement('div');
    row.className = 'vk-row';
    rowKeys.forEach(key => {
      const btn = document.createElement('div');
      btn.className = 'vk-key';
      btn.textContent = key;
      if (key === 'Shift' || key === '?? || key === 'EN/KR') btn.classList.add('vk-wide');
      if (key === 'Space') btn.classList.add('vk-space');
      if (key === 'Enter') btn.classList.add('vk-enter');
      
      // Prevent default mousedown to avoid input losing focus natively
      btn.addEventListener('mousedown', e => e.preventDefault());
      
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        handleVkPress(key);
      });
      row.appendChild(btn);
    });
    container.appendChild(row);
  });
}

function handleVkPress(key) {
  const input = $('short-answer-input');
  if (key === 'Shift') {
    vkIsShift = !vkIsShift;
    renderVirtualKeyboard();
    return;
  }
  if (key === 'EN/KR') {
    vkLayout = vkLayout === 'en' ? 'ko' : 'en';
    vkIsShift = false;
    renderVirtualKeyboard();
    return;
  }
  
  let chars = typeof Hangul !== 'undefined' ? Hangul.disassemble(input.value) : input.value.split('');
  
  if (key === '??) {
    chars.pop();
  } else if (key === 'Space') {
    chars.push(' ');
  } else if (key === 'Enter') {
    if (!$('short-submit-btn').classList.contains('hidden')) {
      handleShortSubmit();
    }
    return;
  } else {
    chars.push(key);
    if (vkIsShift) {
      vkIsShift = false;
      renderVirtualKeyboard();
    }
  }
  
  input.value = typeof Hangul !== 'undefined' ? Hangul.assemble(chars) : chars.join('');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  
  if (!vkUseNative) input.focus();
}

if ($('native-kbd-switch')) {
  $('native-kbd-switch').addEventListener('change', (e) => {
    vkUseNative = e.target.checked;
    renderVirtualKeyboard();
    if (vkUseNative) $('short-answer-input').focus();
  });
}

// ??? Short Answer (二쇨??? ??????????????????????????????????????????????????????
let shortCorrectAnswer = [];
let shortCurrentData = null;

function showShortCard() {
  if (testIndex >= testWords.length) {
    showTestResult();
    return;
  }
  const data = parseWordData(testWords[testIndex]);
  shortCurrentData = data;
  const total = testWords.length;
  const pct = (testIndex / total) * 100;

  $('short-progress-fill').style.width = pct + '%';
  $('short-progress-text').textContent = `${testIndex + 1} / ${total}`;

  const questionLabel = $('short-question-label');
  const questionWord = $('short-question-word');

  const qBox = document.querySelector('#test-short .quiz-question-box');
  const ansWrap = document.querySelector('.short-answer-wrap');
  [qBox, ansWrap].forEach(el => {
    if (el) {
      el.classList.remove('card-slide-in');
      void el.offsetWidth;
      el.classList.add('card-slide-in');
    }
  });

  const input = $('short-answer-input');
  const feedback = $('short-feedback');
  const nextBtn = $('short-next-btn');
  const submitBtn = $('short-submit-btn');
  const appealBtn = $('short-appeal-btn');
  const dontKnowBtn = $('short-dontknow-btn');

  input.value = '';
  input.disabled = false;
  input.classList.remove('correct', 'wrong');
  submitBtn.disabled = false;
  submitBtn.classList.remove('hidden');
  nextBtn.classList.add('hidden');
  appealBtn.classList.add('hidden');
  feedback.classList.remove('show-feedback', 'correct-fb', 'wrong-fb');
  if (dontKnowBtn) dontKnowBtn.classList.remove('hidden');

  if (testDir === 'word2meaning') {
    questionLabel.textContent = '?ㅼ쓬 ?⑥뼱???살쓣 ?낅젰?섏꽭??;
    questionWord.textContent = data.word;
    const rawMeaning = data.meaning || data.back || '';
    shortCorrectAnswer = rawMeaning.split(/[,\n]/)
      .map(s => s.replace(/^[0-9]+/, '').trim())
      .filter(Boolean);
    if (!shortCorrectAnswer.length) shortCorrectAnswer = [rawMeaning];
  } else {
    questionLabel.textContent = '?ㅼ쓬 ?살쓽 ?⑥뼱瑜??낅젰?섏꽭??;
    questionWord.textContent = data.meaning || data.back;
    shortCorrectAnswer = [data.word.toLowerCase().trim()];
  }

  // ?낆옣 ?좊땲硫붿씠??  const shortScreen = $('test-short');
  shortScreen.classList.remove('card-slide-in');
  void shortScreen.offsetWidth;
  shortScreen.classList.add('card-slide-in');

  vkLayout = testDir === 'word2meaning' ? 'ko' : 'en';
  vkIsShift = false;
  renderVirtualKeyboard();

  setTimeout(() => {
    if (!vkUseNative) input.focus();
  }, 50);
}

function handleShortSubmit() {
  const input = $('short-answer-input');
  const feedback = $('short-feedback');
  const nextBtn = $('short-next-btn');
  const submitBtn = $('short-submit-btn');
  const dontKnowBtn = $('short-dontknow-btn');
  const val = input.value.trim().toLowerCase();

  if (!val) return;

  input.disabled = true;
  submitBtn.classList.add('hidden');
  if (dontKnowBtn) dontKnowBtn.classList.add('hidden');
  nextBtn.classList.remove('hidden');
  feedback.classList.add('show-feedback');

  let isCorrect = false;
  if (testDir === 'word2meaning') {
    isCorrect = shortCorrectAnswer.some(ans => {
      const cleanAns = ans.toLowerCase().replace(/\s+/g, '');
      const cleanVal = val.replace(/\s+/g, '');
      return cleanAns.includes(cleanVal) || cleanVal.includes(cleanAns);
    });
  } else {
    isCorrect = shortCorrectAnswer.includes(val);
  }

  if (isCorrect) {
    input.classList.add('correct');
    feedback.classList.add('correct-fb');
    feedback.innerHTML = `<span class="correct-label">?뺣떟?낅땲??</span><br>?먮옒 ?? ${escapeHTML(testDir === 'word2meaning' ? shortCurrentData.meaning : shortCurrentData.word)}`;
    testCorrect++;
  } else {
    input.classList.add('wrong');
    feedback.classList.add('wrong-fb');
    feedback.innerHTML = `<span class="wrong-label">??몄뒿?덈떎!</span><br>?뺣떟: <strong>${escapeHTML(testDir === 'word2meaning' ? shortCurrentData.meaning : shortCurrentData.word)}</strong>`;
    testWrong.push(shortCurrentData.word);
    if ($('short-appeal-btn')) {
      $('short-appeal-btn').classList.remove('hidden');
    }
  }
  
  input.blur();
}

$('short-submit-btn').addEventListener('click', handleShortSubmit);
// ?뷀꽣?? ?꾩쭅 submit ?④퀎???뚮쭔 泥섎━, ?ㅼ쓬(next) ?④퀎?먯꽌??臾댁떆
$('short-answer-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (!$('short-submit-btn').classList.contains('hidden')) {
      e.preventDefault();
      handleShortSubmit();
    }
    // submit??hidden?대㈃(?ㅼ쓬 踰꾪듉 ?곹깭) ?꾨Т寃껊룄 ?섏? ?딆쓬
  }
});

// 紐⑤쫫 踰꾪듉
if ($('short-dontknow-btn')) {
  $('short-dontknow-btn').addEventListener('click', () => {
    const input = $('short-answer-input');
    const feedback = $('short-feedback');
    const nextBtn = $('short-next-btn');
    const submitBtn = $('short-submit-btn');
    const dontKnowBtn = $('short-dontknow-btn');

    input.disabled = true;
    submitBtn.classList.add('hidden');
    dontKnowBtn.classList.add('hidden');
    nextBtn.classList.remove('hidden');
    feedback.classList.add('wrong-fb', 'show-feedback');
    feedback.innerHTML = `<span class="wrong-label">紐⑤쫫 泥섎━</span><br>?뺣떟: <strong>${escapeHTML(testDir === 'word2meaning' ? shortCurrentData.meaning : shortCurrentData.word)}</strong>`;
    testWrong.push(shortCurrentData.word);
    input.blur();
  });
}

// ??? AI Appeal (二쇨????댁쓽?쒓린) ??????????????????????????????????????????????????
if ($('short-appeal-btn')) {
  $('short-appeal-btn').addEventListener('click', async () => {
    if (!geminiApiKey) {
      alert("?ㅼ젙(?숋툘) 硫붾돱?먯꽌 Gemini API ?ㅻ? 癒쇱? ?깅줉?댁＜?몄슂.");
      return;
    }
    const appealBtn = $('short-appeal-btn');
    const input = $('short-answer-input');
    const val = input.value.trim().toLowerCase();
    if (!val) return;

    const correctAnswers = shortCorrectAnswer.join(', ');
    const targetWord = testDir === 'word2meaning' ? shortCurrentData.word : shortCurrentData.meaning;
    
    const originalText = appealBtn.innerHTML;
    appealBtn.innerHTML = '?쨼 梨꾩젏 以?..';
    appealBtn.disabled = true;

    try {
      // 1. Check Firebase Cache
      const appealsCol = collection(db, 'appeals');
      const q = query(appealsCol, where("userAnswer", "==", val), where("targetWord", "==", targetWord));
      const querySnapshot = await getDocs(q);
      
      let isApproved = false;
      let fromCache = false;
      
      if (!querySnapshot.empty) {
        // Cache Hit
        isApproved = querySnapshot.docs[0].data().isApproved;
        fromCache = true;
        console.log('Appeals cache hit:', isApproved);
      } else {
        // Cache Miss -> Call Gemini
        const apiKey = geminiApiKey.trim();
        const prompt = `?⑥뼱 '${targetWord}'???뺣떟? ?먮옒 '${correctAnswers}' ?낅땲?? ?ъ슜?먭? 二쇨????뺣떟?쇰줈 '${val}'??瑜? ?낅젰?덉뒿?덈떎. ???듬????섎????뺣떟?쇰줈 ?몄젙?????덈떎硫??ㅼ쭅 'true', ??몃떎硫?'false'?쇨퀬留???듯븯?몄슂.`;

        if (apiKey.startsWith('sk-')) {
          // Use OpenAI API
          console.log('Using OpenAI API');
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.1
            })
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OpenAI API ?몄텧 ?ㅽ뙣 (${response.status})\n${errText}`);
          }

          const json = await response.json();
          const text = json.choices[0].message.content.toLowerCase().trim();
          isApproved = text.includes('true');

        } else {
          // Use Gemini API
          console.log('Using Gemini API');
          // Fallback sequence: cheapest/most available -> older generation -> pro (expensive)
          let modelsToTry = [
            'gemini-3.1-flash-lite', // Cheapest and most available 2026 tier
            'gemini-2.5-flash-lite', // Legacy fallback (very cheap)
            'gemini-3.5-flash',      // Current generation Flash
            'gemini-2.5-flash',      // Legacy generation Flash
            'gemini-3.1-pro-preview' // Pro tier (most expensive, last resort)
          ];
          
          let response = null;
          let currentModel = '';

          for (const model of modelsToTry) {
            currentModel = model;
            console.log(`Trying Gemini API with model: ${currentModel}`);
            response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${encodeURIComponent(apiKey)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
              })
            });

            // If success (200 OK), break the loop and use this response
            if (response.ok) {
              break;
            }
            
            // If it's a 404 (Not Found) or 503 (Unavailable), log it and let the loop try the next model
            console.log(`${currentModel} returned ${response.status}. Trying next model...`);
          }

          if (!response || !response.ok) {
            const errText = response ? await response.text() : 'No response';
            console.error("Gemini API Error:", errText);
            if (response && response.status === 503) {
              throw new Error("?꾩옱 援ш? AI ?쒕쾭 ?꾩껜???ъ슜?먭? ?덈Т 留롮븘 ?쇱떆?곸쑝濡??쇱옟?⑸땲??(503). 紐⑤뱺 紐⑤뜽 ?몄텧???ㅽ뙣?덉뒿?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄??二쇱꽭??");
            } else {
              throw new Error(`Gemini API ?몄텧 ?ㅽ뙣 (${response ? response.status : 'Unknown'})\n${errText}`);
            }
          }
          
          const json = await response.json();
          const text = json.candidates[0].content.parts[0].text.toLowerCase().trim();
          isApproved = text.includes('true');
        }
        
        // Save to Firebase Cache
        await addDoc(appealsCol, {
          targetWord,
          correctAnswers,
          userAnswer: val,
          isApproved,
          createdAt: serverTimestamp()
        });
      }

      const prefix = fromCache ? "??[?댁쟾 ?먮떒 湲곕컲]" : "?쨼 [AI ?덈줈???먮떒]";
      const feedback = $('short-feedback');
      
      if (isApproved) {
        // Mark as Correct
        input.classList.remove('wrong');
        input.classList.add('correct');
        feedback.classList.remove('wrong-fb');
        feedback.classList.add('correct-fb');
        feedback.innerHTML = `<span class="correct-label">${prefix} ?뺣떟?쇰줈 ?몄젙?덉뒿?덈떎!</span><br>?먮옒 ?? ${escapeHTML(testDir === 'word2meaning' ? shortCurrentData.meaning : shortCurrentData.word)}`;
        
        testWrong = testWrong.filter(w => w !== shortCurrentData.word);
        testCorrect++;
        appealBtn.classList.add('hidden');
      } else {
        feedback.innerHTML += `<br><span style="color:var(--danger); font-size:0.95em; font-weight:600; display:inline-block; margin-top:8px;">${prefix} ?ㅻ떟 泥섎━ ?좎? ?삟</span>`;
        appealBtn.classList.add('hidden');
      }
    } catch (err) {
      console.error(err);
      const feedback = $('short-feedback');
      feedback.innerHTML += `<br><span style="color:var(--warning); font-size:0.9em; display:inline-block; margin-top:8px;">?좑툘 ?ㅻ쪟: ${err.message}</span>`;
    } finally {
      appealBtn.innerHTML = originalText;
      appealBtn.disabled = false;
    }
  });
}

$('short-next-btn').addEventListener('click', () => {
  const shortScreen = $('test-short');
  shortScreen.classList.add('card-slide-out');
  setTimeout(() => {
    shortScreen.classList.remove('card-slide-out');
    testIndex++;
    showShortCard();
  }, 200);
});

// ??? Result ???????????????????????????????????????????????????????????????????
function showTestResult() {
  showScreen('result');
  const total = testWords.length;
  const pct = Math.round((testCorrect / total) * 100);

  $('result-pct').textContent = pct + '%';
  $('result-title').textContent = pct >= 80 ? '?럦 ?뚮??댁슂!' : pct >= 50 ? '?몟 ???덉뼱??' : '?뮞 ???곗뒿?댁슂!';
  $('result-desc').textContent = `${total}媛?以?${testCorrect}媛??뺣떟 (?ㅻ떟 ${testWrong.length}媛?`;

  // Animate circle
  const circumference = 327;
  const offset = circumference - (pct / 100) * circumference;
  setTimeout(() => {
    $('result-circle-dash').style.strokeDashoffset = offset;
  }, 100);

  // Wrong words list
  const wrongList = $('result-wrong-list');
  if (testWrong.length > 0) {
    wrongList.innerHTML = '<strong style="color:var(--danger);">?由??⑥뼱:</strong><br>' + testWrong.join(', ');
    $('result-retry-wrong-btn').classList.remove('hidden');
  } else {
    wrongList.innerHTML = '';
    $('result-retry-wrong-btn').classList.add('hidden');
  }

  // Save to History
  if (selectedBookId && selectedChapterId) {
    const historyRef = collection(db, `users/${currentUser.uid}/books/${selectedBookId}/chapters/${selectedChapterId}/testHistory`);
    addDoc(historyRef, {
      timestamp: serverTimestamp(),
      mode: testMode, // flash, quiz, short
      dir: testDir,
      correct: testCorrect,
      total: total,
      wrongWords: testWrong
    }).catch(e => console.error('History save error:', e));
  }
}

// ??? View Test History ????????????????????????????????????????????????????????
if (viewHistoryBtn) {
  viewHistoryBtn.addEventListener('click', async () => {
    if (!selectedBookId || !selectedChapterId) return;
    
    historyList.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:2rem;">湲곕줉 遺덈윭?ㅻ뒗 以?..</p>';
    openModal(historyModal);

    try {
      const q = query(
        collection(db, `users/${currentUser.uid}/books/${selectedBookId}/chapters/${selectedChapterId}/testHistory`),
        orderBy('timestamp', 'desc')
      );
      const snap = await getDocs(q);
      
      historyList.innerHTML = '';
      chapterHistoryRecords = [];
      if (snap.empty) {
        historyList.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:2rem;">?꾩쭅 ?뚯뒪??湲곕줉???놁뒿?덈떎.</p>';
        return;
      }

      snap.forEach(doc => {
        const data = doc.data();
        chapterHistoryRecords.push(data);
        const dateStr = data.timestamp ? data.timestamp.toDate().toLocaleString() : '諛⑷툑 ??;
        const modeLabel = data.mode === 'flash' ? '?깗 ?뚮옒?쒖뭅?? : data.mode === 'quiz' ? '?륅툘 4吏?좊떎' : data.mode === 'trace' ? '?륅툘 ?곕씪?곌린' : '?랃툘 二쇨???;
        const pct = Math.round((data.correct / data.total) * 100) || 0;
        
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
          <div class="history-summary">
            <div class="history-header">
              <span class="history-title">${modeLabel} <span style="font-size:0.8rem; font-weight:normal; color:var(--text-muted);">(${data.dir === 'word2meaning' ? '?⑥뼱?믩쑜' : '?삘넂?⑥뼱'})</span></span>
              <span class="history-date">${dateStr}</span>
            </div>
          </div>
        `;
        item.onclick = () => {
          historyDetailTitle.innerHTML = `${modeLabel} <span style="font-size:0.8rem; font-weight:normal; color:var(--text-muted);">(${data.dir === 'word2meaning' ? '?⑥뼱?믩쑜' : '?삘넂?⑥뼱'})</span>`;
          historyDetailDate.textContent = dateStr;
          historyDetailScore.innerHTML = `${data.correct} / ${data.total} ?뺣떟 <span style="color:${pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--primary-light)' : 'var(--danger)'}">(${pct}%)</span>`;
          
          if (data.wrongWords && data.wrongWords.length > 0) {
            historyDetailWrong.innerHTML = `<strong>?由??⑥뼱:</strong><br/>${escapeHTML(data.wrongWords.join(', '))}`;
            historyDetailWrong.classList.remove('hidden');
          } else {
            historyDetailWrong.classList.add('hidden');
            historyDetailWrong.innerHTML = '';
          }
          currentTestRecord = data;
          historyAiReportContainer.classList.add('hidden');
          historyAiReportContainer.innerHTML = '';
          openModal(historyDetailModal);
        };
        historyList.appendChild(item);
      });
    } catch (e) {
      console.error(e);
      historyList.innerHTML = `<p style="text-align:center; color:var(--danger); padding:2rem;">?ㅻ쪟: ${e.message}</p>`;
    }
  });
}

if (historyCloseBtn) {
  historyCloseBtn.addEventListener('click', () => {
    closeModal(historyModal);
  });
}

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??// ERROR HELPERS
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??
function showError(title, msg) {
  errorTitle.textContent = title;
  errorMsg.textContent = msg;
  errorSection.classList.remove('hidden');
}
function hideError() { errorSection.classList.add('hidden'); }

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??// VERSION BADGE (from GitHub)
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??
async function fetchLatestVersion() {
  try {
    const res = await fetch('https://api.github.com/repos/JunHyuk1203/goodnotesword/commits/main');
    if (!res.ok) return;
    const data = await res.json();
    const date = new Date(data.commit.author.date);
    const badge = $('build-time');
    if (badge) {
      badge.textContent = `留덉?留??낅뜲?댄듃: ${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
      badge.title = data.commit.message;
    }
  } catch (e) { console.error('Version fetch failed:', e); }
}

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??// INIT
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??
// --- Firebase Auth & UI Logic ---
const landingScreen = document.getElementById('landing-screen');
const landingStartBtn = document.getElementById('landing-start-btn');
const authScreen = document.getElementById('auth-screen');
const libraryContent = document.getElementById('library-content');
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authGoogleBtn = document.getElementById('auth-google-btn');
const authResetBtn = document.getElementById('auth-reset-btn');
const authError = document.getElementById('auth-error');
const privacyCheckboxContainer = document.getElementById('privacy-checkbox-container');
const privacyCheckbox = document.getElementById('privacy-agree');
const privacyViewBtn = document.getElementById('privacy-view-btn');
const privacyModal = document.getElementById('privacy-modal');
const privacyCloseBtn = document.getElementById('privacy-close-btn');
const settingsUserEmail = document.getElementById('settings-user-email');
const settingsAdminBadge = document.getElementById('settings-admin-badge');
const settingsLogoutBtn = document.getElementById('settings-logout-btn');

let isLoginMode = true;

function getKoreanAuthError(code) {
  switch (code) {
    case 'auth/invalid-email': return "?좏슚?섏? ?딆? ?대찓???뺤떇?낅땲??";
    case 'auth/user-not-found': return "媛?낅릺吏 ?딆? ?대찓?쇱씠嫄곕굹 ??젣??怨꾩젙?낅땲??";
    case 'auth/wrong-password': return "鍮꾨?踰덊샇媛 ??몄뒿?덈떎.";
    case 'auth/invalid-credential': return "?대찓???먮뒗 鍮꾨?踰덊샇媛 ?щ컮瑜댁? ?딆뒿?덈떎.";
    case 'auth/email-already-in-use': return "?대? 媛?낅맂 ?대찓?쇱엯?덈떎.";
    case 'auth/weak-password': return "鍮꾨?踰덊샇??6?먮━ ?댁긽?댁뼱???⑸땲??";
    case 'auth/too-many-requests': return "?덈Т 留롮? 濡쒓렇???쒕룄媛 ?덉뿀?듬땲?? ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.";
    case 'auth/network-request-failed': return "?ㅽ듃?뚰겕 ?곌껐???ㅽ뙣?덉뒿?덈떎.";
    case 'auth/credential-already-in-use': return "??怨꾩젙? ?대? ?ㅻⅨ ?ъ슜?먯? ?곕룞?섏뼱 ?덉뒿?덈떎.";
    case 'auth/requires-recent-login': return "蹂댁븞???꾪빐 ?ㅼ떆 濡쒓렇?명븳 ???쒕룄?댁＜?몄슂.";
    default: return "?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎. (" + code + ")";
  }
}

function showAuthError(msg) {
  if (!authError) return;
  authError.textContent = msg;
  authError.classList.remove('hidden');
}
if (privacyViewBtn) {
  privacyViewBtn.addEventListener('click', () => {
    if (privacyModal) {
      privacyModal.classList.remove('hidden');
      requestAnimationFrame(() => privacyModal.classList.add('show'));
    }
  });
}
if (privacyCloseBtn) {
  privacyCloseBtn.addEventListener('click', () => {
    if (privacyModal) {
      privacyModal.classList.remove('show');
      setTimeout(() => privacyModal.classList.add('hidden'), 300);
    }
  });
}

function hideAuthError() {
  if (!authError) return;
  authError.classList.add('hidden');
}

if (tabLogin && tabSignup) {
  tabLogin.addEventListener('click', () => {
    isLoginMode = true;
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    if (authSubmitBtn) authSubmitBtn.textContent = '濡쒓렇??;
    if (privacyCheckboxContainer) privacyCheckboxContainer.classList.add('hidden');
    hideAuthError();
  });
  tabSignup.addEventListener('click', () => {
    isLoginMode = false;
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    if (authSubmitBtn) authSubmitBtn.textContent = '?뚯썝媛??;
    if (privacyCheckboxContainer) privacyCheckboxContainer.classList.remove('hidden');
    hideAuthError();
  });
}

if (authForm) {
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = authEmail.value.trim();
    const password = authPassword.value.trim();
    hideAuthError();
    
    try {
      if (isLoginMode) {
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        if (!userCred.user.emailVerified) {
          alert("?대찓???몄쬆???꾨즺?섏? ?딆븯?듬땲?? 硫붿씪?⑥쓣 ?뺤씤?댁＜?몄슂.");
          await signOut(auth);
          return;
        }
      } else {
        if (privacyCheckbox && !privacyCheckbox.checked) {
          showAuthError('媛쒖씤?뺣낫 ?섏쭛 諛??댁슜???숈쓽?댁＜?몄슂.');
          return;
        }
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCred.user);
        alert("?뚯썝媛?낆씠 ?꾨즺?섏뿀?듬땲?? ?대찓???몄쬆 留곹겕瑜?諛쒖넚?덉쑝?? 硫붿씪?⑥쓣 ?뺤씤?섏떊 ???ㅼ떆 濡쒓렇?명빐二쇱꽭??");
        await signOut(auth);
      }
    } catch (err) {
      showAuthError(getKoreanAuthError(err.code) || err.message);
    }
  });
}

if (authGoogleBtn) {
  authGoogleBtn.addEventListener('click', async () => {
    hideAuthError();
    if (!isLoginMode && privacyCheckbox && !privacyCheckbox.checked) {
      showAuthError('媛쒖씤?뺣낫 ?섏쭛 諛??댁슜???숈쓽?댁＜?몄슂.');
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const additionalInfo = getAdditionalUserInfo(result);
      if (isLoginMode && additionalInfo && additionalInfo.isNewUser) {
        await deleteUser(result.user);
        showAuthError("媛?낅릺吏 ?딆? 援ш? 怨꾩젙?낅땲?? '?뚯썝媛?? ??뿉??媛쒖씤?뺣낫 ?섏쭛 ?숈쓽 ??吏꾪뻾?댁＜?몄슂.");
        return;
      }
    } catch (err) {
      showAuthError(getKoreanAuthError(err.code) || err.message);
    }
  });
}

if (authResetBtn) {
  authResetBtn.addEventListener('click', async () => {
    const email = authEmail.value.trim();
    if (!email) {
      showAuthError("鍮꾨?踰덊샇瑜??ъ꽕?뺥븷 ?대찓?쇱쓣 ?꾩뿉 ?낅젰?댁＜?몄슂.");
      return;
    }
    try {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      if (methods.length === 0) {
        showAuthError("媛?낅릺吏 ?딆? ?대찓?쇱엯?덈떎.");
        return;
      }
      await sendPasswordResetEmail(auth, email);
      alert("鍮꾨?踰덊샇 ?ъ꽕???대찓?쇱씠 諛쒖넚?섏뿀?듬땲?? ?뺤씤 ???ㅼ떆 濡쒓렇?명빐二쇱꽭??");
    } catch (err) {
      showAuthError(getKoreanAuthError(err.code) || err.message);
    }
  });
}

if (settingsLogoutBtn) {
  settingsLogoutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
      const closeBtn = document.getElementById('settings-close-btn');
      if (closeBtn) closeBtn.click();
    } catch (err) {
      console.error("Logout Error:", err);
    }
  });
}

const addPasswordBtn = document.getElementById('settings-add-password-btn');
if (addPasswordBtn) {
  addPasswordBtn.addEventListener('click', async () => {
    const newPassword = prompt("?덈줈 ?ㅼ젙???쇰컲 濡쒓렇??鍮꾨?踰덊샇瑜??낅젰?댁＜?몄슂 (6?먮━ ?댁긽):");
    if (!newPassword) return;
    if (newPassword.length < 6) {
      alert("鍮꾨?踰덊샇??6?먮━ ?댁긽?댁뼱???⑸땲??");
      return;
    }
    try {
      await updatePassword(auth.currentUser, newPassword);
      alert("鍮꾨?踰덊샇媛 ?깃났?곸쑝濡??ㅼ젙?섏뿀?듬땲?? 蹂댁븞???꾪빐 ?ㅼ떆 濡쒓렇?명빐二쇱꽭??");
      document.getElementById('settings-add-password-container').classList.add('hidden');
      await signOut(auth);
      const closeBtn = document.getElementById('settings-close-btn');
      if (closeBtn) closeBtn.click();
    } catch (err) {
      alert(getKoreanAuthError(err.code) || err.message);
    }
  });
}

const linkGoogleBtn = document.getElementById('settings-link-google-btn');
if (linkGoogleBtn) {
  linkGoogleBtn.addEventListener('click', async () => {
    try {
      const provider = new GoogleAuthProvider();
      await linkWithPopup(auth.currentUser, provider);
      alert("Google 怨꾩젙???깃났?곸쑝濡??곕룞?섏뿀?듬땲?? ?댁젣 Google 濡쒓렇??踰꾪듉?쇰줈???묒냽?섏떎 ???덉뒿?덈떎!");
      document.getElementById('settings-link-google-container').classList.add('hidden');
    } catch (err) {
      alert(getKoreanAuthError(err.code) || err.message);
    }
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    if (user.email === 'tntgame1203@gmail.com') {
      currentUser = { uid: "default_user", email: user.email };
    } else {
      currentUser = { uid: user.uid, email: user.email };
    }
    
    if (settingsUserEmail) settingsUserEmail.textContent = user.email;
    if (settingsAdminBadge) {
        if (user.email === 'tntgame1203@gmail.com') {
          settingsAdminBadge.classList.remove('hidden');
        } else {
          settingsAdminBadge.classList.add('hidden');
        }
      }
    
    // Check providers to show/hide account management UI
    const providers = user.providerData.map(p => p.providerId);
    const hasPassword = providers.includes('password');
    const hasGoogle = providers.includes('google.com');
    
    const providersContainer = document.getElementById('settings-user-providers');
    if (providersContainer) {
      providersContainer.innerHTML = '';
      if (hasPassword) {
        providersContainer.innerHTML += '<span style="background:var(--bg-tertiary); color:var(--text-secondary); padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600;">?대찓???곕룞??/span>';
      }
      if (hasGoogle) {
        providersContainer.innerHTML += '<span style="background:var(--bg-tertiary); color:var(--text-secondary); padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600;">Google ?곕룞??/span>';
      }
    }
    
    const pwContainer = document.getElementById('settings-add-password-container');
    const googleContainer = document.getElementById('settings-link-google-container');
    
    if (pwContainer) {
      if (!hasPassword) pwContainer.classList.remove('hidden');
      else pwContainer.classList.add('hidden');
    }
    
    if (googleContainer) {
      if (!hasGoogle) googleContainer.classList.remove('hidden');
      else googleContainer.classList.add('hidden');
    }
    
    if (authScreen) authScreen.classList.add('hidden');
    if (landingScreen) landingScreen.classList.add('hidden');
    if (libraryContent) libraryContent.classList.remove('hidden');
    
    loadBooks();
  } else {
    currentUser = null;
    if (landingScreen) landingScreen.classList.remove('hidden');
    if (authScreen) authScreen.classList.add('hidden');
    if (libraryContent) libraryContent.classList.add('hidden');
    
    if (typeof unsubBooks !== "undefined" && unsubBooks) { unsubBooks(); unsubBooks = null; }
    if (typeof unsubChapters !== "undefined" && unsubChapters) { unsubChapters(); unsubChapters = null; }
    if (typeof unsubWords !== "undefined" && unsubWords) { unsubWords(); unsubWords = null; }
  }
});

fetchLatestVersion();



function showToast(msg) {
  let toast = document.getElementById('custom-toast-el');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'custom-toast-el';
    toast.className = 'custom-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  if (toast.timer) clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// Global Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return;
  
  const promptModal = document.getElementById('custom-prompt-modal');
  if (promptModal && !promptModal.classList.contains('hidden')) return;
  
  const inShorts = document.body.classList.contains('shorts-mode-active');
  const flashScreen = document.getElementById('flash-screen');
  const inFlash = flashScreen && !flashScreen.classList.contains('hidden');
  
  if (e.code === 'Space') {
    if (inShorts) {
      e.preventDefault();
      if (typeof navigateSwipe === 'function') navigateSwipe(1);
    } else if (inFlash) {
      e.preventDefault();
      const flipHint = document.getElementById('flip-hint');
      const flashFront = document.getElementById('flashcard-front');
      // Click the card to flip
      if (flipHint && flipHint.style.display !== 'none') {
         if (flashFront) flashFront.click();
      }
    }
  } else if (e.code === 'ArrowRight') {
    if (inShorts) {
      e.preventDefault();
      if (typeof navigateSwipe === 'function') navigateSwipe(1);
    }
  } else if (e.code === 'ArrowLeft') {
    if (inShorts) {
      e.preventDefault();
      if (typeof navigateSwipe === 'function') navigateSwipe(-1);
    }
  } else if (e.code === 'Digit1' || e.code === 'Numpad1') {
    if (inFlash) {
      e.preventDefault();
      const knowBtn = document.getElementById('flash-correct-btn');
      if (knowBtn && !knowBtn.disabled && window.getComputedStyle(knowBtn).display !== 'none') knowBtn.click();
    }
  } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
    if (inFlash) {
      e.preventDefault();
      const dontKnowBtn = document.getElementById('flash-wrong-btn');
      if (dontKnowBtn && !dontKnowBtn.disabled && window.getComputedStyle(dontKnowBtn).display !== 'none') dontKnowBtn.click();
    }
  }
});


// --- History API Routing ---
var isPopState = false;

window.addEventListener('popstate', (e) => {
  // Check if any modals are open. If so, close them.
  const openModals = document.querySelectorAll('.modal-screen:not(.hidden)');
  if (openModals.length > 0) {
    openModals.forEach(m => m.classList.add('hidden'));
    
    // Re-push current state to negate the pop
    if (currentLibraryLevel === 0) {
      history.pushState({ level: 0 }, '');
    } else if (currentLibraryLevel === 1) {
      history.pushState({ level: 1, bookId: selectedBookId, bookName: currentBookNameStore }, '');
    } else if (currentLibraryLevel === 2) {
      const cName = document.getElementById('ios-nav-title-inline') ? document.getElementById('ios-nav-title-inline').textContent : '';
      history.pushState({ level: 2, bookId: selectedBookId, chapterId: selectedChapterId, chapterName: cName }, ''); 
    }
    return;
  }

  isPopState = true;
  const state = e.state;
  if (!state || state.level === 0) {
    loadBooks();
  } else if (state.level === 1) {
    loadChapters(state.bookId, state.bookName);
  } else if (state.level === 2) {
    loadWords(state.bookId, state.chapterId, state.chapterName);
  } else {
    loadBooks();
  }
  setTimeout(() => { isPopState = false; }, 50);
});

function pushHistoryState(level, data) {
  if (isPopState) return;
  const current = history.state || { level: -1 };
  if (current.level === level && current.chapterId === data.chapterId && current.bookId === data.bookId) return;
  history.pushState(Object.assign({ level: level }, data), '');
}

// Push initial state if none exists
if (!history.state) {
  history.replaceState({ level: 0 }, '');
}

if (landingStartBtn) {
  landingStartBtn.addEventListener('click', () => {
    if (landingScreen) landingScreen.classList.add('hidden');
    if (authScreen) authScreen.classList.remove('hidden');
  });
}


// -----------------------------------------------------------------------------
// Trace (?곕씪?곌린) Test Implementation
// -----------------------------------------------------------------------------
let traceFailCount = 0;
let currentTraceData = null;

const traceEnCanvas = document.getElementById('trace-en-canvas');
const traceKoCanvas = document.getElementById('trace-ko-canvas');
const traceEnCtx = traceEnCanvas?.getContext('2d', { willReadFrequently: true });
const traceKoCtx = traceKoCanvas?.getContext('2d', { willReadFrequently: true });

function initTraceCanvas(canvas, ctx) {
  if (!canvas) return null;
  
  // Clone to remove old event listeners
  const clone = canvas.cloneNode(true);
  canvas.parentNode.replaceChild(clone, canvas);
  ctx = clone.getContext('2d', { willReadFrequently: true });
  
  // Handle high DPI displays for crisp drawing
  const rect = clone.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = rect.width || 400;
  const cssHeight = rect.height || 150;
  
  // Always set physical width/height and apply scale on the NEW context
  clone.width = cssWidth * dpr;
  clone.height = cssHeight * dpr;
  clone.style.width = `${cssWidth}px`;
  clone.style.height = `${cssHeight}px`;
  ctx.scale(dpr, dpr);
  
  // Setup drawing state
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;

  function getPos(e) {
    const r = clone.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - r.left,
      y: clientY - r.top
    };
  }

  function startDrawing(e) {
    isDrawing = true;
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(lastX, lastY); // dot
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6; // Make user stroke thicker
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#ffffff';
    ctx.stroke();
  }

  function draw(e) {
    if (!isDrawing) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#ffffff';
    ctx.stroke();
    lastX = pos.x;
    lastY = pos.y;
  }

  function stopDrawing() {
    isDrawing = false;
    ctx.beginPath();
  }

  // Add pointer events (works for mouse, touch, and pen)
  clone.addEventListener('pointerdown', startDrawing);
  clone.addEventListener('pointermove', draw);
  clone.addEventListener('pointerup', stopDrawing);
  clone.addEventListener('pointerout', stopDrawing);
  clone.addEventListener('pointercancel', stopDrawing);
  
  // Prevent scrolling on touch
  clone.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  clone.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  
  return { canvas: clone, ctx: ctx };
}

let activeEnCtx = null;
let activeKoCtx = null;
let activeEnCanvas = null;
let activeKoCanvas = null;

// Renders the guide text and stores the target pixel mask
let targetMaskEn = [];
let targetMaskKo = [];

function renderTraceGuide(canvas, ctx, text, isKo) {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  
  ctx.clearRect(0, 0, w, h);
  
  // Draw guide text
  ctx.fillStyle = 'rgba(180, 180, 180, 0.4)'; // Light gray guide (thicker)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  let fontSize = 120;
  // Scale down if text is too long
  ctx.font = `900 ${fontSize}px var(--font-main)`;
  let textWidth = ctx.measureText(text).width;
  while (textWidth > w - 40 && fontSize > 20) {
    fontSize -= 2;
    ctx.font = `900 ${fontSize}px var(--font-main)`;
    textWidth = ctx.measureText(text).width;
  }
  
  ctx.fillText(text, w / 2, h / 2);
  
  // Create a mask of the guide pixels for accuracy calculation
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const mask = new Uint8Array(canvas.width * canvas.height);
  let targetPixelCount = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a > 20) { // If pixel is somewhat opaque
      mask[i / 4] = 1;
      targetPixelCount++;
    }
  }
  
  return { mask, targetPixelCount, w, h };
}

function showTraceCard() {
  if (testIndex >= testWords.length) {
    showTestResult();
    return;
  }
  
  traceFailCount = 0;
  $('trace-skip-btn').classList.add('hidden');
  $('trace-feedback').textContent = '';
  $('trace-feedback').className = 'short-feedback';
  $('trace-en-acc-bar').style.width = '0%';
  $('trace-ko-acc-bar').style.width = '0%';
  $('trace-en-acc-text').textContent = '0%';
  $('trace-ko-acc-text').textContent = '0%';
  
  const data = parseWordData(testWords[testIndex]);
  currentTraceData = data;
  const total = testWords.length;
  const pct = (testIndex / total) * 100;

  $('trace-progress-fill').style.width = pct + '%';
  $('trace-progress-text').textContent = `${testIndex + 1} / ${total}`;
  
  // Re-init canvases
  const enRes = initTraceCanvas(document.getElementById('trace-en-canvas'), traceEnCtx);
  activeEnCanvas = enRes.canvas;
  activeEnCtx = enRes.ctx;
  
  const koRes = initTraceCanvas(document.getElementById('trace-ko-canvas'), traceKoCtx);
  activeKoCanvas = koRes.canvas;
  activeKoCtx = koRes.ctx;
  
  const meaningText = data.meaning ? data.meaning.split(',')[0].trim() : data.back || '';
  
  const enMaskData = renderTraceGuide(activeEnCanvas, activeEnCtx, data.word, false);
  targetMaskEn = enMaskData;
  
  const koMaskData = renderTraceGuide(activeKoCanvas, activeKoCtx, meaningText, true);
  targetMaskKo = koMaskData;
  
  // Animate in
  const traceScreen = $('test-trace');
  traceScreen.classList.remove('card-slide-in');
  void traceScreen.offsetWidth;
  traceScreen.classList.add('card-slide-in');
}

function clearTraceCanvas(canvas, ctx, targetMaskData, text, isKo) {
  renderTraceGuide(canvas, ctx, text, isKo);
}

document.getElementById('trace-en-clear-btn')?.addEventListener('click', () => {
  clearTraceCanvas(activeEnCanvas, activeEnCtx, targetMaskEn, currentTraceData.word, false);
});

document.getElementById('trace-ko-clear-btn')?.addEventListener('click', () => {
  const meaningText = currentTraceData.meaning ? currentTraceData.meaning.split(',')[0].trim() : currentTraceData.back || '';
  clearTraceCanvas(activeKoCanvas, activeKoCtx, targetMaskKo, meaningText, true);
});

function calculateTraceAccuracy(canvas, ctx, maskData) {
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  
  let hitCount = 0;
  let falsePositiveCount = 0;
  let userPixelCount = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    // We look for pixels that are drawn by user.
    // The guide is rgba(150,150,150,0.25) which has alpha ~63. User draws with alpha 255.
    // So if alpha > 100, it's a user pixel.
    if (a > 100) {
      userPixelCount++;
      if (maskData.mask[i / 4] === 1) {
        hitCount++; // User drew on the guide
      } else {
        falsePositiveCount++; // User drew outside the guide
      }
    }
  }
  
  if (maskData.targetPixelCount === 0) return 100;
  if (userPixelCount === 0) return 0;
  
  // Coverage: how much of the guide did they cover?
  // We cap coverage at 1.0 (sometimes they can't cover 100% due to stroke width differences)
  // We will assume 60% coverage of pixels is practically "fully covered" for tracing
  let coverage = hitCount / (maskData.targetPixelCount * 0.6); 
  if (coverage > 1) coverage = 1;
  
  // Precision penalty: drawing too much outside the guide reduces accuracy
  // We allow some false positives because the stroke is thick.
  // If false positives exceed 2x the target pixel count, it's scribbling.
  let penalty = 0;
  const allowedOverflow = maskData.targetPixelCount * 1.5;
  if (falsePositiveCount > allowedOverflow) {
    penalty = ((falsePositiveCount - allowedOverflow) / maskData.targetPixelCount) * 0.5;
  }
  
  let finalAcc = (coverage - penalty) * 100;
  return Math.max(0, Math.min(100, Math.round(finalAcc)));
}

function updateTraceBar(barId, textId, acc) {
  const bar = document.getElementById(barId);
  const txt = document.getElementById(textId);
  if (!bar || !txt) return;
  
  bar.style.width = acc + '%';
  txt.textContent = acc + '%';
  
  if (acc < 50) bar.style.backgroundColor = '#ef4444'; // red
  else if (acc < 80) bar.style.backgroundColor = '#f59e0b'; // yellow
  else bar.style.backgroundColor = '#10b981'; // green
}

document.getElementById('trace-submit-btn')?.addEventListener('click', () => {
  const enAcc = calculateTraceAccuracy(activeEnCanvas, activeEnCtx, targetMaskEn);
  const koAcc = calculateTraceAccuracy(activeKoCanvas, activeKoCtx, targetMaskKo);
  
  updateTraceBar('trace-en-acc-bar', 'trace-en-acc-text', enAcc);
  updateTraceBar('trace-ko-acc-bar', 'trace-ko-acc-text', koAcc);
  
  const fb = document.getElementById('trace-feedback');
  if (enAcc >= 80 && koAcc >= 80) {
    fb.textContent = '???뺥솗?섍쾶 ???곕씪 ?쇱뒿?덈떎!';
    fb.className = 'short-feedback show-feedback correct-fb';
    testCorrect++;
    
    setTimeout(() => {
      const traceScreen = $('test-trace');
      traceScreen.classList.add('card-slide-out');
      setTimeout(() => {
        traceScreen.classList.remove('card-slide-out');
        testIndex++;
        showTraceCard();
      }, 200);
    }, 1000);
  } else {
    traceFailCount++;
    fb.textContent = `???뺥솗??誘몃떖 (?곸뼱: ${enAcc}%, ?쒓?: ${koAcc}%)`;
    fb.className = 'short-feedback show-feedback wrong-fb';
    
    if (traceFailCount >= 3) {
      document.getElementById('trace-skip-btn').classList.remove('hidden');
    }
  }
});

document.getElementById('trace-skip-btn')?.addEventListener('click', () => {
  testWrong.push(currentTraceData.word);
  const traceScreen = $('test-trace');
  traceScreen.classList.add('card-slide-out');
  setTimeout(() => {
    traceScreen.classList.remove('card-slide-out');
    testIndex++;
    showTraceCard();
  }, 200);
});

document.getElementById('trace-close-btn')?.addEventListener('click', closeTest);

