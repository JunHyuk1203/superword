// ═══════════════════════════════════════════════════════════════════════════════
// superword - app.js v3.0 (Study Edition)
// ═══════════════════════════════════════════════════════════════════════════════
console.log("GoodNotes Vocab App Loaded - v11.0 (Apple HIG Design System)");

// ── Apple HIG Theme System ──
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
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";
import {
  getFirestore, collection, doc, setDoc, getDocs, addDoc,
  query, orderBy, serverTimestamp, deleteDoc, updateDoc,
  onSnapshot, initializeFirestore, memoryLocalCache, where, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged,
  sendPasswordResetEmail, browserLocalPersistence, setPersistence,
  sendEmailVerification, updatePassword, linkWithPopup, EmailAuthProvider,
  fetchSignInMethodsForEmail, getAdditionalUserInfo, deleteUser
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// ─── Firebase Init ────────────────────────────────────────────────────────────
const firebaseApp = initializeApp({
  apiKey: "AIzaSyDToPgxyeRpAfYUqSlweugc7M5vwCwagsU",
  authDomain: "goodnotesword-454fa.firebaseapp.com",
  projectId: "goodnotesword-454fa",
  storageBucket: "goodnotesword-454fa.firebasestorage.app",
  messagingSenderId: "509235514160",
  appId: "1:509235514160:web:87282a03a70ec2041696f5",
  measurementId: "G-Z0C9CQT4T7"
});
const isIOSWebKit = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const db = initializeFirestore(firebaseApp, {
  localCache: memoryLocalCache(),
  // Avoid a stalled streaming transport on iOS, including iPad desktop mode.
  ...(isIOSWebKit ? { experimentalForceLongPolling: true } : {})
});
const auth = getAuth(firebaseApp);
const callStudyAi = httpsCallable(getFunctions(firebaseApp, 'asia-northeast3'), 'studyAi', {timeout: 60000});
setPersistence(auth, browserLocalPersistence);

// ─── Global State ─────────────────────────────────────────────────────────────
let currentUser = null;
let authSessionVersion = 0;
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

// ─── Utility ──────────────────────────────────────────────────────────────────
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

function escapeHTML(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function escapeCSV(s) {
  if (s == null) return '';
  let value = String(s);
  // CSV quoting alone does not prevent formulas when opened in a spreadsheet.
  if (/^[\s\uFEFF]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value)) value = "'" + value;
  const v = value.replace(/"/g, '""');
  return /[,\r\n"]/.test(v) ? `"${v}"` : v;
}

const modalCloseTimers = new WeakMap();

function openModal(modalEl) {
  clearTimeout(modalCloseTimers.get(modalEl));
  modalCloseTimers.delete(modalEl);
  document.body.classList.add('modal-open');
  // Use visibility instead of display:none removal to avoid layout flash
  modalEl.classList.remove('hidden');
  // Double rAF ensures browser has painted 1 frame before starting transition
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (modalEl.classList.contains('hidden') || modalCloseTimers.has(modalEl)) return;
      modalEl.classList.add('show');
    });
  });
}
function closeModal(modalEl) {
  clearTimeout(modalCloseTimers.get(modalEl));
  modalEl.classList.remove('show');
  if (modalEl.id === 'test-modal') document.body.classList.remove('test-open');
  modalCloseTimers.set(modalEl, setTimeout(() => {
    modalEl.classList.add('hidden');
    modalCloseTimers.delete(modalEl);
    if (!document.querySelector('.modal-screen.show')) {
      document.body.classList.remove('modal-open');
    }
  }, 400));
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const modals = [...document.querySelectorAll('.modal-screen.show')];
  const topModal = modals.sort((a, b) =>
    Number(getComputedStyle(a).zIndex) - Number(getComputedStyle(b).zIndex)
  ).pop();
  if (topModal) closeModal(topModal);
});

// ── Apple Bottom Sheet Dismissal Logic ──
document.querySelectorAll('.modal-screen').forEach(modal => {
  const title = modal.querySelector('.sheet-title, h2');
  if (title) {
    title.id ||= `${modal.id}-title`;
    modal.setAttribute('aria-labelledby', title.id);
  }
  modal.querySelectorAll('.sheet-close-btn').forEach(button => {
    button.setAttribute('aria-label', '닫기');
  });
  // Tap outside to dismiss
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });
  
  // Swipe down to dismiss
  let sheetStartY = null;
  let sheetStartX = null;
  let sheetCurrentY = null;
  let isSwipeIntent = false; // true only once we're sure it's a downward swipe, not a tap
  const content = modal.querySelector('.modal-screen-content');
  
  if (content) {
    content.addEventListener('touchstart', (e) => {
      // If the touch starts on a canvas (trace drawing area), never trigger swipe-to-dismiss
      if (e.target.tagName === 'CANVAS') {
        sheetStartY = null;
        return;
      }
      if (content.scrollTop === 0) {
        sheetStartY = e.touches[0].clientY;
        sheetStartX = e.touches[0].clientX;
        sheetCurrentY = sheetStartY;
        isSwipeIntent = false;
      }
    }, { passive: true });
    
    content.addEventListener('touchmove', (e) => {
      if (sheetStartY === null) return;
      sheetCurrentY = e.touches[0].clientY;
      const deltaY = sheetCurrentY - sheetStartY;
      const deltaX = Math.abs(e.touches[0].clientX - sheetStartX);
      
      // Only commit to swipe intent if: moving down, clearly vertical, and moved at least 10px
      if (!isSwipeIntent) {
        if (deltaY > 10 && deltaY > deltaX * 3) {
          isSwipeIntent = true;
        } else if (deltaX > 10 || (deltaY < 0 && Math.abs(deltaY) > 5)) {
          // Horizontal or upward movement → cancel, treat as tap
          sheetStartY = null;
          return;
        }
      }
      
      if (isSwipeIntent && deltaY > 0) {
        content.style.transform = `translateY(${deltaY}px)`;
        content.style.transition = 'none';
      }
    }, { passive: true });
    
    content.addEventListener('touchend', (e) => {
      if (sheetStartY === null) return;
      const deltaY = sheetCurrentY - sheetStartY;
      content.style.transform = '';
      content.style.transition = '';
      // Only close if we clearly swiped down with intent (not just a tap)
      if (isSwipeIntent && deltaY > 100) {
        closeModal(modal);
      }
      sheetStartY = null;
      sheetStartX = null;
      sheetCurrentY = null;
      isSwipeIntent = false;
    });
  }
});

// ─── Custom Modals ────────────────────────────────────────────────────────────
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

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
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
  const previousIndex = currentLibraryLevel;
  currentLibraryLevel = newIndex;
  const inWords = newIndex === 2;
  document.body.dataset.libraryLevel = String(newIndex);
  hideToggleBar.classList.toggle('hidden', !inWords);
  if (!inWords) {
    hideToggleBar.classList.remove('active-view', 'idle-left', 'idle-right');
    document.body.classList.remove('shorts-mode-active');
    window.speechSynthesis?.cancel();
  }
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
  if (previousIndex !== newIndex) pendingLibraryNavDirection = newIndex > previousIndex ? 1 : -1;
}
const iosBackBtn = $('ios-back-btn');
const iosBackText = $('ios-back-text');
const iosNavTitleInline = $('ios-nav-title-inline');
const iosLargeTitleText = $('ios-large-title-text');

// Move the actual title into the inline slot: never show two copies.
const iosNavBar = document.querySelector('.ios-nav-bar');
let navFrame = 0;
let libraryNavAnimations = [];
let libraryNavGhost = null;
let libraryNavExit = null;
let libraryNavSnapshot = null;
let pendingLibraryNavDirection = 0;
let libraryNavEpoch = 0;
let libraryNavRevealTimer = null;
let libraryNavTransfer = null;
let libraryNavHandoffFrame = 0;
function clearLibraryNavigationMotion() {
  libraryNavEpoch++;
  cancelAnimationFrame(libraryNavHandoffFrame);
  libraryNavHandoffFrame = 0;
  clearTimeout(libraryNavRevealTimer);
  libraryNavAnimations.forEach(animation => { animation.onfinish = null; animation.cancel(); });
  libraryNavAnimations = [];
  libraryNavGhost?.remove();
  libraryNavGhost = null;
  libraryNavExit?.remove();
  libraryNavExit = null;
  libraryNavTransfer = null;
  [iosBackText, iosLargeTitleText].forEach(label => label.classList.remove('library-nav-pending'));
}
function setLibraryTitle(title) {
  iosNavTitleInline.textContent = title;
  const label = document.createElement('span');
  label.className = 'ios-title-label';
  label.textContent = title;
  iosLargeTitleText.replaceChildren(label);
}
function libraryTransferKeyframes(from, returning) {
  const destination = returning ? iosLargeTitleText : iosBackText;
  const to = destination.getBoundingClientRect();
  const style = getComputedStyle(destination);
  // Render with the destination's final font throughout. Android WebView may
  // autosize/re-rasterize interpolated font sizes differently from resting text.
  Object.assign(libraryNavGhost.style, Object.fromEntries([
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch',
    'fontFeatureSettings', 'fontVariationSettings', 'fontKerning', 'fontOpticalSizing',
    'letterSpacing', 'wordSpacing', 'lineHeight', 'textTransform', 'textRendering'
  ].map(key => [key, style[key]])));
  libraryNavGhost.style.width = `${to.width}px`;
  const scale = to.height > 0 ? from.height / to.height : 1;
  const clippedRight = Math.max(0, to.width - from.width / Math.max(scale, 0.01));
  const frames = [
    { transform: `translate(0, 0) scale(${scale})`, clipPath: `inset(0px ${clippedRight}px 0px 0px)` },
    { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(1)`,
      clipPath: 'inset(0px 0px 0px 0px)', color: style.color }
  ];
  // On iOS pushes, keep the same title transfer without animating a clip mask
  // on the moving text layer. Its fixed overflow box already clips long labels.
  if (isIOSWebKit && !returning) frames.forEach(frame => { delete frame.clipPath; });
  return frames;
}
function animateLibraryNavigation(direction) {
  if (!iosNavBar || !currentUser || !iosNavBar.getClientRects().length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const timing = { duration: 520, easing: 'cubic-bezier(0.32, 0, 0.2, 1)', fill: 'both' };
  const epoch = libraryNavEpoch;
  const returning = direction < 0 && libraryNavSnapshot?.backVisible;
  const backVisible = iosBackBtn.style.visibility !== 'hidden';
  const advancing = direction > 0 && backVisible && libraryNavSnapshot?.titleText === iosBackText.textContent;
  // The title reused as a back label already has its own transfer animation.
  // Otherwise retain the outgoing title in a clipped layer until it slides away.
  if (!advancing && libraryNavSnapshot?.titleBounds.width > 0) {
    const from = libraryNavSnapshot.titleBounds;
    const bar = iosNavBar.getBoundingClientRect();
    const barStyle = getComputedStyle(iosNavBar);
    const exit = document.createElement('span');
    exit.className = 'library-nav-exit';
    exit.setAttribute('aria-hidden', 'true');
    Object.assign(exit.style, {
      left: `${from.left - bar.left - parseFloat(barStyle.borderLeftWidth)}px`,
      top: `${from.top - bar.top - parseFloat(barStyle.borderTopWidth)}px`,
      width: `${from.width}px`, height: `${from.height}px`
    });
    const label = document.createElement('span');
    label.textContent = libraryNavSnapshot.titleText;
    Object.assign(label.style, libraryNavSnapshot.titleStyle);
    exit.appendChild(label);
    iosNavBar.appendChild(exit);
    libraryNavExit = exit;
    const departure = label.animate([
      { transform: 'translate(0, 0)' },
      { transform: libraryNavSnapshot.compact ? 'translate(0, -100%)' : 'translate(-100%, 0)' }
    ], timing);
    departure.onfinish = () => {
      exit.remove();
      if (libraryNavExit === exit) libraryNavExit = null;
      departure.cancel();
    };
    libraryNavAnimations.push(departure);
  }
  const slideIn = label => {
    const animation = label.animate([{ transform: 'translate(-100%, 0)' }, { transform: 'translate(0, 0)' }], timing);
    animation.onfinish = () => animation.cancel();
    libraryNavAnimations.push(animation);
  };
  if (!returning) slideIn(iosLargeTitleText.querySelector('.ios-title-label'));
  if (backVisible && !advancing) slideIn(iosBackText);
  // WebView's compositor can start late or pause while JS timers keep ticking.
  // A wall-clock deadline must not replace a label before its actual arrival.
  const clearWhenSettled = () => {
    if (epoch !== libraryNavEpoch) return;
    const inFlight = libraryNavAnimations.some(animation =>
      animation.pending || animation.playState === 'running' || animation.playState === 'paused');
    if (!document.hidden && inFlight) {
      libraryNavRevealTimer = setTimeout(clearWhenSettled, 200);
    } else clearLibraryNavigationMotion();
  };
  libraryNavRevealTimer = setTimeout(clearWhenSettled, timing.duration + 80);
  if (!returning && !advancing) return;
  const from = returning ? libraryNavSnapshot.backBounds : libraryNavSnapshot.titleBounds;
  const destination = returning ? iosLargeTitleText : iosBackText;
  destination.classList.add('library-nav-pending');
  const ghost = document.createElement('span');
  ghost.className = 'library-nav-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.textContent = returning ? libraryNavSnapshot.backText : libraryNavSnapshot.titleText;
  Object.assign(ghost.style, {
    left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`,
    color: returning ? 'var(--primary)' : 'var(--text)'
  });
  document.body.appendChild(ghost);
  libraryNavGhost = ghost;
  const keyframes = libraryTransferKeyframes(from, returning);
  const movement = ghost.animate(keyframes, timing);
  movement.onfinish = () => {
    if (epoch !== libraryNavEpoch) return;
    destination.classList.remove('library-nav-pending');
    if (libraryNavTransfer?.movement === movement) libraryNavTransfer = null;
    // Keep the filled final frame until WebKit has painted the real label.
    libraryNavHandoffFrame = requestAnimationFrame(() => {
      libraryNavHandoffFrame = requestAnimationFrame(() => {
        libraryNavHandoffFrame = 0;
        if (epoch !== libraryNavEpoch) return;
        ghost.remove();
        movement.cancel();
      });
    });
  };
  libraryNavAnimations.push(movement);
  libraryNavTransfer = { movement, from, returning, keyframeSignature: JSON.stringify(keyframes) };
}
function positionLibraryTitle() {
  navFrame = 0;
  if (!iosNavBar || !iosLargeTitleText || !iosNavTitleInline) return;
  const shorts = currentLibraryLevel === 2 && currentViewMode === 'swipe';
  // Shorts always uses the compact header; other views retain scroll hysteresis.
  if (shorts || window.scrollY > 96) iosNavBar.classList.add('compact');
  else if (window.scrollY < 16) iosNavBar.classList.remove('compact');
  const compact = iosNavBar.classList.contains('compact');
  const target = (compact ? iosNavTitleInline : document.querySelector('.ios-title-slot')).getBoundingClientRect();
  const origin = document.querySelector('.ios-nav-bar-inner').getBoundingClientRect();
  iosLargeTitleText.style.transform = `translate(${target.left - origin.left}px, ${target.top - origin.top}px)`;
  iosLargeTitleText.style.width = `${target.width}px`;
  if (libraryNavTransfer) {
    const { movement, from, returning } = libraryNavTransfer;
    const frames = libraryTransferKeyframes(from, returning);
    const signature = JSON.stringify(frames);
    // Avoid replacing an unchanged active effect on iOS's moving text layer.
    if (!isIOSWebKit || returning || signature !== libraryNavTransfer.keyframeSignature) {
      movement.effect.setKeyframes(frames);
      libraryNavTransfer.keyframeSignature = signature;
    }
  }
  if (pendingLibraryNavDirection) {
    const direction = pendingLibraryNavDirection;
    pendingLibraryNavDirection = 0;
    animateLibraryNavigation(direction);
  }
  if (shorts) adjustSwipeViewHeight();
}
function scheduleLibraryTitle() {
  if (!navFrame) navFrame = requestAnimationFrame(positionLibraryTitle);
}
function resetLibraryNavigation() {
  clearLibraryNavigationMotion();
  pendingLibraryNavDirection = 0;
  const titleStyle = getComputedStyle(iosLargeTitleText);
  libraryNavSnapshot = {
    compact: iosNavBar.classList.contains('compact'),
    backVisible: iosBackBtn.style.visibility !== 'hidden',
    backText: iosBackText.textContent,
    titleText: iosLargeTitleText.textContent,
    backBounds: iosBackText.parentElement.getBoundingClientRect().toJSON(),
    titleBounds: iosLargeTitleText.getBoundingClientRect().toJSON(),
    titleFontSize: titleStyle.fontSize,
    titleStyle: Object.fromEntries(['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'color'].map(key => [key, titleStyle[key]]))
  };
  // Each screen owns its listener. Re-entering must create a fresh subscription,
  // even after a failed or cancelled initial snapshot.
  if (unsubBooks) { unsubBooks(); unsubBooks = null; }
  if (unsubChapters) { unsubChapters(); unsubChapters = null; }
  if (unsubWords) { unsubWords(); unsubWords = null; }
  iosNavBar?.classList.remove('compact');
  window.scrollTo({ top: 0, behavior: 'instant' });
  scheduleLibraryTitle();
}
document.addEventListener('scroll', scheduleLibraryTitle, { passive: true });
window.addEventListener('resize', scheduleLibraryTitle);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    clearLibraryNavigationMotion();
    scheduleLibraryTitle();
  }
});
window.addEventListener('pageshow', event => {
  if (event.persisted) {
    clearLibraryNavigationMotion();
    scheduleLibraryTitle();
  }
});
new ResizeObserver(() => {
  const inner = document.querySelector('.ios-nav-bar-inner');
  const contentHeight = inner.getBoundingClientRect().height;
  if (contentHeight > 0) {
    const style = getComputedStyle(iosNavBar);
    const height = contentHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    // Keep a numeric target so changes caused by hidden actions, wrapping and
    // compact titles can all transition from the currently displayed height.
    iosNavBar.style.height = `${height}px`;
  }
  scheduleLibraryTitle();
}).observe(document.querySelector('.ios-nav-bar-inner'));
// Shorts must follow the animated outer edge, including the final settling frames.
new ResizeObserver(scheduleLibraryTitle).observe(iosNavBar);
new ResizeObserver(() => {
  if (currentLibraryLevel === 2 && currentViewMode === 'swipe') adjustSwipeViewHeight();
}).observe($('hide-toggle-bar'));
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
// Old client credentials are removed; the shared key is available only to the server.
localStorage.removeItem('gemini_api_key');
sessionStorage.removeItem('superword_ai_key');
if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    window.setTheme(document.body.getAttribute('data-theme') || 'dark');
    openModal(settingsModal);
  });
  settingsCloseBtn.addEventListener('click', () => closeModal(settingsModal));
  settingsSaveBtn.addEventListener('click', () => closeModal(settingsModal));
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
    if (!currentUser || !currentTestRecord || !selectedBookId || !selectedChapterId) return;
    const requestSession = authSessionVersion;
    generateAiReportBtn.disabled = true;
    generateAiReportBtn.textContent = '🤖 리포트 생성 중...';
    historyAiReportContainer.classList.remove('hidden');
    historyAiReportContainer.textContent = 'AI가 학습 성취도를 분석하고 있습니다...';
    try {
      const result = await callStudyAi({action: 'report', bookId: selectedBookId, chapterId: selectedChapterId,
        record: {correct: currentTestRecord.correct, total: currentTestRecord.total, wrongWords: currentTestRecord.wrongWords || []}});
      if (requestSession !== authSessionVersion) return;
      historyAiReportContainer.innerHTML = renderSimpleMarkdown(result.data.text || '');
    } catch (error) {
      if (requestSession !== authSessionVersion) return;
      historyAiReportContainer.textContent = error.message || 'AI 리포트를 생성하지 못했습니다.';
    } finally {
      generateAiReportBtn.disabled = false;
      generateAiReportBtn.textContent = '🤖 AI 학습 리포트 다시 생성';
    }
  });
}

let swipeIndex = 0;
let swipeWords = [];
let autoPlayPronunciation = true; // Enabled by default in Shorts mode

// ─── Pronunciation ────────────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════════
// LIBRARY: Books → Chapters → Words
// ═══════════════════════════════════════════════════════════════════════════════

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
let backSwipeHorizontal = false;
// Extend the former atan(1/2) cone by 30 degrees above and below horizontal.
const backSwipeMaxSlope = Math.tan(Math.atan(0.5) + Math.PI / 6);
function cancelBackSwipe() {
  backSwipeStartX = null;
  backSwipeStartY = null;
  backSwipeHorizontal = false;
}

document.addEventListener('touchstart', (e) => {
  cancelBackSwipe();
  // Block back-swipe when a modal or test is open
  if (document.body.classList.contains('modal-open')) return;
  if (document.body.classList.contains('test-open')) return;
  // Only trigger from left half (up to 45% of screen width)
  if (e.touches.length === 1 && e.touches[0].clientX <= window.innerWidth * 0.45) {
    backSwipeStartX = e.touches[0].clientX;
    backSwipeStartY = e.touches[0].clientY;
  }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (backSwipeStartX === null) return;
  if (e.touches.length !== 1 || document.body.classList.contains('modal-open') || document.body.classList.contains('test-open')) {
    cancelBackSwipe();
    return;
  }
  const deltaX = e.touches[0].clientX - backSwipeStartX;
  const deltaY = Math.abs(e.touches[0].clientY - backSwipeStartY);
  if (Math.max(Math.abs(deltaX), deltaY) < 10) return;
  // Once a scroll/diagonal gesture is detected, it cannot turn into Back later.
  if (deltaX < 0 || deltaY > Math.abs(deltaX) * backSwipeMaxSlope) {
    cancelBackSwipe();
    return;
  }
  if (deltaX > 0 && deltaY <= deltaX * backSwipeMaxSlope) backSwipeHorizontal = true;
}, { passive: true });

document.addEventListener('touchend', (e) => {
  if (backSwipeStartX === null) return;
  if (!e.changedTouches.length || document.body.classList.contains('modal-open') || document.body.classList.contains('test-open')) {
    cancelBackSwipe();
    return;
  }
  const deltaX = e.changedTouches[0].clientX - backSwipeStartX;
  const deltaY = Math.abs(e.changedTouches[0].clientY - backSwipeStartY);
  const goBack = backSwipeHorizontal && deltaX > 80 && deltaY <= deltaX * backSwipeMaxSlope;
  cancelBackSwipe();
  if (goBack) {
    if (currentLibraryLevel === 2 && selectedBookId) {
      loadChapters(selectedBookId, currentBookNameStore);
    } else if (currentLibraryLevel === 1) {
      loadBooks();
    }
  }
});
document.addEventListener('touchcancel', cancelBackSwipe, { passive: true });

// ─── Load Books ───────────────────────────────────────────────────────────────
function subscribeLibrarySnapshot(reference, render, showError, container, retry) {
  let active = true;
  let retryButton = null;
  const fail = error => {
    if (!active) return;
    clearTimeout(timer);
    retryButton?.remove();
    showError(error);
    retryButton = document.createElement('button');
    retryButton.type = 'button';
    retryButton.className = 'small-btn library-retry';
    retryButton.textContent = '다시 시도';
    retryButton.onclick = retry;
    container.appendChild(retryButton);
  };
  const timer = setTimeout(() => fail(new Error('연결이 지연되고 있습니다. 네트워크를 확인하고 다시 시도해 주세요.')), 15000);
  const unsubscribe = onSnapshot(reference, snapshot => {
    if (!active) return;
    clearTimeout(timer);
    retryButton?.remove();
    render(snapshot);
  }, fail);
  return () => {
    active = false;
    clearTimeout(timer);
    retryButton?.remove();
    unsubscribe();
  };
}

function loadBooks() {
  resetLibraryNavigation();
  if (typeof pushHistoryState === 'function') pushHistoryState(0, {});
  if (unsubChapters) { unsubChapters(); unsubChapters = null; }
  if (unsubWords) { unsubWords(); unsubWords = null; }
  selectedBookId = null;
  selectedChapterId = null;

  setLibraryLevel(0);

  document.getElementById('words-action-wrapper')?.classList.add('hidden');
  
  if (iosBackBtn) iosBackBtn.style.visibility = 'hidden';
  setLibraryTitle('단어장 목록');

  
  hideToggleBar.classList.add('hidden');

  if (!unsubBooks) {
    viewBooks.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-secondary);">로딩 중...</p>';
    unsubBooks = subscribeLibrarySnapshot(collection(db, `users/${currentUser.uid}/books`), (snap) => {
      viewBooks.innerHTML = '';
      if (snap.empty) {
        viewBooks.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;">저장된 단어장이 없습니다. 위의 [+ 새 단어장 만들기] 버튼을 눌러 시작하세요!</p>';
        return;
      }
      let idx = 0;
      snap.forEach(d => {
        const data = d.data();
        const div = document.createElement('div');
        div.className = 'lib-card list-item-enter';
        div.style.animationDelay = `${idx * 0.04}s`;
        div.innerHTML = `<div class="lib-icon">📘</div><div class="lib-title">${escapeHTML(data.name)}</div><button class="lib-delete-btn" title="단어장 삭제" style="position:absolute;top:8px;right:8px;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.2rem;">✕</button>`;
        div.onclick = () => loadChapters(d.id, data.name);
        div.querySelector('.lib-delete-btn').onclick = async (e) => {
          e.stopPropagation();
          if (await showConfirm('이 단어장을 삭제하시겠습니까? (모든 단원과 함께 삭제됩니다)')) {
            try { await deleteDoc(doc(db, `users/${currentUser.uid}/books`, d.id)); }
            catch(err) { alert('삭제 실패: ' + err.message); }
          }
        };
        viewBooks.appendChild(div);
        idx++;
      });
    }, (e) => {
      console.error(e);
      viewBooks.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--danger);">오류: ${escapeHTML(e.message)}</p>`;
    }, viewBooks, loadBooks);
  }
}

// ─── Load Chapters ────────────────────────────────────────────────────────────
function loadChapters(bookId, bookName) {
  resetLibraryNavigation();
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
    iosBackText.textContent = '단어장 목록';
  }
  setLibraryTitle(bookName);


  if (!unsubChapters) {
    viewChapters.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-secondary);">로딩 중...</p>';
    unsubChapters = subscribeLibrarySnapshot(collection(db, `users/${currentUser.uid}/books/${bookId}/chapters`), (snap) => {
      viewChapters.innerHTML = '';
      if (snap.empty) {
        viewChapters.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">
  <div class="empty-state-icon">📂</div>
  <p class="empty-state-title">등록된 단원이 없습니다</p>
  <p class="empty-state-desc">+ 버튼을 눌러 첫 단원을 추가해 보세요.</p>
</div>`;
        return;
      }
      let idx = 0;
      snap.forEach(d => {
        const data = d.data();
        const div = document.createElement('div');
        div.className = 'lib-card list-item-enter';
        div.style.animationDelay = `${idx * 0.04}s`;
        div.innerHTML = `<div class="lib-icon">📂</div><div class="lib-title">${escapeHTML(data.name)}</div><button class="lib-delete-btn" title="단원 삭제" style="position:absolute;top:8px;right:8px;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.2rem;">✕</button>`;
        div.onclick = () => loadWords(bookId, d.id, data.name);
        div.querySelector('.lib-delete-btn').onclick = async (e) => {
          e.stopPropagation();
          if (await showConfirm('이 단원을 삭제하시겠습니까? (모든 단어와 함께 삭제됩니다)')) {
            try { await deleteDoc(doc(db, `users/${currentUser.uid}/books/${bookId}/chapters`, d.id)); }
            catch(err) { alert('삭제 실패: ' + err.message); }
          }
        };
        viewChapters.appendChild(div);
        idx++;
      });
    }, (e) => {
      console.error(e);
      viewChapters.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--danger);">오류: ${escapeHTML(e.message)}</p>`;
    }, viewChapters, () => loadChapters(bookId, bookName));
  }
}

// ─── Load Words ───────────────────────────────────────────────────────────────
function loadWords(bookId, chapterId, chapterName) {
  resetLibraryNavigation();
  currentLoadedWords = [];
  wordsEditView.replaceChildren();
  wordsSwipeView.replaceChildren();
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
    iosBackText.textContent = currentBookNameStore || '단원';
  }
  setLibraryTitle(chapterName);


  // Show hide bar and reset to card mode
  hideToggleBar.classList.remove('hidden');
  setViewMode('card');

  if (!unsubWords) {
    wordsCardView.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:2rem;">로딩 중...</p>';
    wordsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">로딩 중...</td></tr>';

    const q = query(collection(db, `users/${currentUser.uid}/books/${bookId}/chapters/${chapterId}/words`), orderBy('order'));
    unsubWords = subscribeLibrarySnapshot(q, (snap) => {
      currentLoadedWords = [];
      if (selectAllWords) selectAllWords.checked = false;
      if (deleteSelectedBtn) deleteSelectedBtn.classList.add('hidden');

      wordCountBadge.textContent = `${snap.size} 단어`;
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
      wordsCardView.innerHTML = `<p style="text-align:center;color:var(--danger);padding:2rem;">오류: ${escapeHTML(e.message)}</p>`;
      wordsTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger);">오류: ${escapeHTML(e.message)}</td></tr>`;
    }, wordsCardView, () => loadWords(bookId, chapterId, chapterName));
  }
}

// ─── Parse Word Data ──────────────────────────────────────────────────────────
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

  // Parse front: "word  ⓐ  [pronunciation]"
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
    if (trimmed.startsWith('📌 뜻')) {
      meaning = trimmed.replace(/^📌 뜻\n?/, '').trim();
    } else if (trimmed.startsWith('📖 예문')) {
      examples = trimmed.replace(/^📖 예문\n?/, '').split('\n').map(s => s.replace(/^•\s*/, '').trim()).filter(Boolean);
    } else if (trimmed.startsWith('🧩 어원')) {
      etymology = trimmed.replace(/^🧩 어원\n?/, '').replace(/^•\s*/, '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
    } else if (trimmed.startsWith('✅ 유의어')) {
      synonyms = trimmed.replace(/^✅ 유의어\n?/, '').split('\n').map(s => s.replace(/^•\s*/, '').trim()).filter(Boolean);
    } else if (trimmed.startsWith('❌ 반의어')) {
      antonyms = trimmed.replace(/^❌ 반의어\n?/, '').split('\n').map(s => s.replace(/^•\s*/, '').trim()).filter(Boolean);
    } else if (trimmed.startsWith('🔗 관련어')) {
      related = trimmed.replace(/^🔗 관련어\n?/, '').split('\n').map(s => s.replace(/^•\s*/, '').trim()).filter(Boolean);
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

// ─── Render Card View ─────────────────────────────────────────────────────────
function renderCardView(docs) {
  if (docs.length === 0) {
    wordsCardView.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:3rem;">단어가 없습니다. [✨ 단어 추출하기] 버튼으로 추가하세요!</p>';
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
        const match = s.match(/^([^\[\(:：\-]+)(?:\[(.*?)\]|\((.*?)\))?(?:\s*[:：\-]\s*)(.*)$/);
        
        if (match) {
          word = match[1].trim();
          pos = (match[2] || match[3] || '').trim();
          meaning = match[4].trim();
          
          let posHtml = pos ? `<span class="related-item-pos" style="color:var(--primary);font-size:0.8rem;margin-left:4px;">[${escapeHTML(pos)}]</span>` : '';
          return `<div class="related-item"><span class="related-item-word">${escapeHTML(word)}</span>${posHtml}<span class="related-item-colon">:</span><span class="related-item-meaning"> ${escapeHTML(meaning)}</span></div>`;
        }
        
        // Fallback for simple "word: meaning" without proper colon but spaces?
        const spaceMatch = s.match(/^([A-Za-z0-9_]+)\s+(\[[^\]]+\]|\([^)]+\))?\s*(.*)$/);
        if (spaceMatch && !s.includes(':') && !s.includes('-') && !s.includes('：')) {
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
        <div class="word-card-section-label" style="color:var(--primary); font-weight:600; margin-bottom:6px;">🧩 어원 결합 블록</div>
        <div class="ety-container">
          ${lines}
          <div class="ety-result-wrap">
            <span class="ety-arrow">➔</span>
            <span class="ety-result">${escapeHTML(targetWord)}</span>
          </div>
        </div>
      </div>`;
    };

    const etySection = buildEtymologySection(parsed.etymology, parsed.word);
    const synSection = buildRelatedSection(parsed.synonyms, '✅', '유의어');
    const antSection = buildRelatedSection(parsed.antonyms, '❌', '반의어');
    const relSection = buildRelatedSection(parsed.related, '🔗', '관련어');
    const hasRelated = (parsed.synonyms?.length || parsed.antonyms?.length || parsed.related?.length);

    card.innerHTML = `
      <div class="word-card-header">
        <span class="word-card-word word-section-word">${escapeHTML(parsed.word)}</span>
        <button class="pronounce-btn" data-word="${escapeHTML(parsed.word)}" title="발음 듣기" style="background:none;border:none;cursor:pointer;font-size:1.1rem;margin-left:4px;vertical-align:middle;padding:2px;opacity:0.8;transition:opacity 0.2s;">🔊</button>
        ${parsed.pos ? `<span class="word-card-pos word-section-meaning">${escapeHTML(parsed.pos)}</span>` : ''}
        ${parsed.pronunciation ? `<span class="word-card-pron word-section-word">${escapeHTML(parsed.pronunciation)}</span>` : ''}
        <span class="word-card-num">${idx + 1}</span>
      </div>
      ${parsed.meaning ? `
        <div class="word-card-section word-section-meaning">
          <div class="word-card-section-label">📌 뜻</div>
          <div class="word-card-meaning">${escapeHTML(parsed.meaning)}</div>
        </div>
      ` : ''}
      ${etySection}
      ${parsed.examples.length ? `
        <div class="word-card-section word-section-example">
          <div class="word-card-section-label">📖 예문</div>
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
        <button class="word-card-edit-btn">✏️ 수정</button>
        <button class="word-card-delete-btn">🗑 삭제</button>
      </div>
    `;

    card.querySelector('.word-card-edit-btn').onclick = () => openEditModal(data);

    card.querySelector('.word-card-delete-btn').onclick = async () => {
      if (await showConfirm('이 단어를 삭제하시겠습니까?')) {
        try { await deleteDoc(data._ref); }
        catch(err) { alert('삭제 실패: ' + err.message); }
      }
    };

    grid.appendChild(card);
  });

  wordsCardView.innerHTML = '';
  wordsCardView.appendChild(grid);
  applyHideState();
}

// ─── Render Table View ────────────────────────────────────────────────────────
function renderTableView(docs) {
  wordsTbody.innerHTML = '';
  if (docs.length === 0) {
    wordsTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:3rem 0;"><div class="empty-state">
  <div class="empty-state-icon">📖</div>
  <p class="empty-state-title">등록된 단어가 없습니다</p>
  <p class="empty-state-desc">+ 버튼을 눌러 첫 단어를 추가해 보세요.</p>
</div></td></tr>`;
    return;
  }
  docs.forEach((data, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'list-item-enter';
    tr.style.animationDelay = `${idx * 0.02}s`;
    tr.innerHTML = `<td><input type="checkbox" class="word-chk" data-path="${escapeHTML(data._path)}" /></td><td>${idx+1}</td><td style="font-weight:600;color:var(--primary-light);">${escapeHTML(data.front)}</td><td style="white-space:pre-wrap;font-size:0.82rem;color:var(--text-secondary);">${escapeHTML(data.back)}</td>
      <td><div style="display:flex;gap:4px;">
        <button class="word-card-edit-btn" style="font-size:0.78rem;padding:4px 10px;">수정</button>
        <button class="word-card-delete-btn" style="font-size:0.78rem;padding:4px 10px;">삭제</button>
      </div></td>`;
    tr.querySelector('.word-card-edit-btn').onclick = () => openEditModal(data);
    tr.querySelector('.word-card-delete-btn').onclick = async () => {
      if (await showConfirm('이 단어를 삭제하시겠습니까?')) {
        try { await deleteDoc(data._ref); }
        catch(err) { alert('삭제 실패: ' + err.message); }
      }
    };
    tr.querySelector('.word-chk').addEventListener('change', updateDeleteBtn);
    wordsTbody.appendChild(tr);
  });
}

// ─── Edit Word Modal ──────────────────────────────────────────────────────────
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
  if (meaning) parts.push(`📌 뜻\n${pos ? pos + ' ' : ''}${meaning}`);
  if (etymology.length) parts.push(`🧩 어원\n• ${etymology.join(' + ')}`);
  if (synonyms.length) parts.push(`✅ 유의어\n• ${synonyms.join('\n• ')}`);
  if (antonyms.length) parts.push(`❌ 반의어\n• ${antonyms.join('\n• ')}`);
  if (related.length) parts.push(`🔗 관련어\n• ${related.join('\n• ')}`);
  if (examples.length) parts.push(`📖 예문\n• ${examples.join('\n• ')}`);
  const back = parts.join('\n\n');

  const updatedData = {
    word, pos, pronunciation: pron, meaning, examples, synonyms, antonyms, related, etymology, front, back
  };

  try {
    const org = editWordSave.textContent;
    editWordSave.textContent = '저장 중...';
    editWordSave.disabled = true;
    await updateDoc(currentEditDocRef, updatedData);
    editWordModal.classList.add('hidden');
    editWordSave.textContent = org;
    editWordSave.disabled = false;
  } catch(e) {
    alert('수정 실패: ' + e.message);
    editWordSave.disabled = false;
    editWordSave.textContent = '저장';
  }
});

// ─── View Toggle (Card / Edit / Swipe) ───────────────────────────────────────
function setViewMode(mode) {
  const oldMode = currentViewMode;
  currentViewMode = mode;
  const shortsControls = document.querySelector('.shorts-controls');
  if (shortsControls) {
    shortsControls.inert = mode !== 'swipe';
    shortsControls.setAttribute('aria-hidden', String(mode !== 'swipe'));
  }
  
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
  scheduleLibraryTitle();
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
  const barTop = hideToggleBar.getBoundingClientRect().top;
  const bottom = hideToggleBar.classList.contains('hidden') ? vph - 16 : Math.min(vph, barTop) - 14;
  swipeView.style.height = Math.max(bottom - rect.top, 120) + 'px';
  fitSwipeCard();
}

// Re-adjust if window/viewport size changes (mobile address bar show/hide)
window.visualViewport?.addEventListener('resize', () => {
  if (document.body.classList.contains('shorts-mode-active')) adjustSwipeViewHeight();
});



// ─── Swipe (Shorts) View ──────────────────────────────────────────────────────
function buildSwipeCardHTML(parsed, originalIdx) {
  const buildRelatedSection = (items, emoji, label) => {
    if (!items || !items.length) return '';
    const lines = items.map(s => {
      const match = s.match(/^([^\[\(:：\-]+)(?:\[(.*?)\]|\((.*?)\))?(?:\s*[:：\-]\s*)(.*)$/);
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
      <div class="word-card-section-label" style="color:var(--primary); font-weight:600; margin-bottom:6px;">🧩 어원 결합 블록</div>
      <div class="ety-container">
        ${lines}
        <div class="ety-result-wrap">
          <span class="ety-arrow">➔</span>
          <span class="ety-result">${escapeHTML(targetWord)}</span>
        </div>
      </div>
    </div>`;
  };

  const etySection = buildEtymologySection(parsed.etymology, parsed.word);
  const synSection = buildRelatedSection(parsed.synonyms, '✅', '유의어');
  const antSection = buildRelatedSection(parsed.antonyms, '❌', '반의어');
  const relSection = buildRelatedSection(parsed.related, '🔗', '관련어');
  const hasRelated = (parsed.synonyms?.length || parsed.antonyms?.length || parsed.related?.length);

  return `
    <div class="swipe-card-content">
      <div class="word-card-header" style="border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:0.8rem;display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
        <span class="word-card-word word-section-word">${escapeHTML(parsed.word)}</span>
        <button class="pronounce-btn" data-word="${escapeHTML(parsed.word)}" title="발음 듣기" style="background:none;border:none;cursor:pointer;margin-left:2px;vertical-align:middle;padding:4px;opacity:0.8;">🔊</button>
        ${parsed.pos ? `<span class="word-card-pos word-section-meaning">${escapeHTML(parsed.pos)}</span>` : ''}
        ${parsed.pronunciation ? `<span class="word-card-pron word-section-word">${escapeHTML(parsed.pronunciation)}</span>` : ''}
        <span class="word-card-num">${originalIdx + 1}</span>
      </div>
      ${parsed.meaning ? `<div class="word-card-section word-section-meaning">
        <div class="word-card-section-label">📌 뜻</div>
        <div class="word-card-meaning">${escapeHTML(parsed.meaning)}</div>
      </div>` : ''}
      ${etySection}
      ${parsed.examples.length ? `<div class="word-card-section word-section-example">
        <div class="word-card-section-label">📖 예문</div>
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
  <div class="empty-state-icon">📖</div>
  <p class="empty-state-title">등록된 단어가 없습니다</p>
  <p class="empty-state-desc">+ 버튼을 눌러 첫 단어를 추가해 보세요.</p>
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

// ─── Peek Mode: Click on hidden element to reveal for 2s ────────────────────────────────────
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
  if (!wrap || wrap.dataset.animating === 'true') return;
  const newIdx = swipeIndex + dir;
  if (newIdx < 0 || newIdx >= swipeWords.length) return;
  wrap.dataset.animating = 'true';

  const outClass = dir === 1 ? 'slide-out-top' : 'slide-out-bottom';
  const inClass = dir === 1 ? 'slide-from-bottom' : 'slide-from-top';

  wrap.classList.remove('slide-in-top', 'slide-in-bottom');
  wrap.classList.add(outClass);

  setTimeout(() => {
    if (!wrap.isConnected || currentViewMode !== 'swipe' || currentLibraryLevel !== 2) {
      delete wrap.dataset.animating;
      return;
    }
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
    setTimeout(() => { delete wrap.dataset.animating; }, 220);
  }, 180);
}

let swipeDidOccur = false;
let swipeGesturesReady = false;

function setupSwipeGestures() {
  if (swipeGesturesReady) return;
  swipeGesturesReady = true;
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
  if (!currentLoadedWords.length) { alert('내보낼 단어가 없습니다.'); return; }
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
    if (!wrap || wrap.dataset.animating === 'true') return;
    wrap.dataset.animating = 'true';

    shuffleBtn.style.transform = 'scale(0.9)';
    setTimeout(() => shuffleBtn.style.transform = 'scale(1)', 150);

    wrap.style.transition = 'none';
    wrap.classList.add('shuffle-anim');
    
    setTimeout(() => {
      if (!wrap.isConnected || currentViewMode !== 'swipe' || currentLibraryLevel !== 2) return;
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
      delete wrap.dataset.animating;
    }, 400);
  });
}

const autoPlayBtn = document.getElementById('auto-play-toggle');
if (autoPlayBtn) {
  // Set initial active state
  if (autoPlayPronunciation) autoPlayBtn.classList.add('active');
  autoPlayBtn.setAttribute('aria-pressed', String(autoPlayPronunciation));
  autoPlayBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    autoPlayPronunciation = !autoPlayPronunciation;
    autoPlayBtn.setAttribute('aria-pressed', String(autoPlayPronunciation));
    autoPlayBtn.title = autoPlayPronunciation ? '자동 발음 끄기' : '자동 발음 켜기';
    autoPlayBtn.classList.toggle('active', autoPlayPronunciation);
    if (autoPlayPronunciation && swipeWords[swipeIndex]) {
       const parsed = parseWordData(swipeWords[swipeIndex]);
       playPronunciation(parsed.word);
    }
  });
}

// ─── Hide Toggles ─────────────────────────────────────────────────────────────
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
      btn.title = '해당 데이터가 없습니다';
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
  document.querySelectorAll('.hide-toggle-btn[data-target]').forEach(btn => {
    btn.setAttribute('aria-pressed', String(hideState[btn.dataset.target]));
  });
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
  btn.setAttribute('aria-pressed', String(hideState[btn.dataset.target]));
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    hideState[target] = !hideState[target];
    btn.classList.toggle('active', hideState[target]);
    btn.setAttribute('aria-pressed', String(hideState[target]));
    applyHideState();
  });
});



// ─── Create Book / Chapter ────────────────────────────────────────────────────
addBookBtn.addEventListener('click', async () => {
  const name = await showPrompt('새 단어장의 이름을 입력하세요:');
  if (!name || !name.trim()) return;
  try {
    await addDoc(collection(db, `users/${currentUser.uid}/books`), {
      name: name.trim(), createdAt: serverTimestamp()
    });
  } catch (e) {
    alert('단어장 생성 실패: ' + e.message);
  }
});

addChapterBtn.addEventListener('click', async () => {
  const name = await showPrompt('새 단원(챕터)의 이름을 입력하세요:');
  if (!name || !name.trim() || !selectedBookId) return;
  try {
    await addDoc(collection(db, `users/${currentUser.uid}/books/${selectedBookId}/chapters`), {
      name: name.trim(), createdAt: serverTimestamp()
    });
  } catch (e) {
    alert('단원 생성 실패: ' + e.message);
  }
});

// ─── CSV Export ───────────────────────────────────────────────────────────────
exportCsvBtn.addEventListener('click', () => {
  if (!currentLoadedWords.length) { alert('내보낼 단어가 없습니다.'); return; }
  const csv = '\uFEFF' + currentLoadedWords.map(w => `${escapeCSV(w.front)},${escapeCSV(w.back)}`).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${crumbChapterName.textContent || 'words'}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ─── Multi-Delete ─────────────────────────────────────────────────────────────
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
  if (!await showConfirm(`선택한 ${chks.length}개의 단어를 삭제하시겠습니까?`)) return;
  deleteSelectedBtn.disabled = true;
  deleteSelectedBtn.textContent = '삭제 중...';
  try {
    await Promise.all(Array.from(chks).map(chk => deleteDoc(doc(db, chk.dataset.path))));
  } catch(e) {
    alert('삭제 실패: ' + e.message);
  } finally {
    deleteSelectedBtn.disabled = false;
    deleteSelectedBtn.textContent = '🗑 선택 삭제';
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACT SECTION TOGGLE
// ═══════════════════════════════════════════════════════════════════════════════

openExtractBtn.addEventListener('click', () => openModal(extractModal));
closeExtractBtn.addEventListener('click', () => closeModal(extractModal));

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

function updatePrompt() {
  if (!promptOutput) return;

  const prompt = `You are an expert vocabulary extraction assistant. Your task is to extract ALL English vocabulary words from the provided source.

CRITICAL EXTRACTION RULES:
1. DO NOT SKIP ANY MAIN VOCABULARY WORDS. You MUST extract EVERY SINGLE main vocabulary word present in the source.
2. If there are dozens of words, you MUST list them ALL. DO NOT give up after a few words.
3. For multiple images or columns, extract from top-to-bottom, left-to-right.

CRITICAL TRANSCRIBING RULES:
1. Act purely as an OCR engine, EXCEPT for the POS (Part of Speech). You MUST use your dictionary knowledge to infer and add the correct POS (e.g., 명, 동, 형) for the main word, synonyms, antonyms, and related words if they are not explicitly present in the text.
2. For the "meaning" field, you MUST copy the text EXACTLY as it appears. DO NOT summarize.
3. DO NOT use the tilde symbol (~) anywhere in your output. If a Korean meaning requires a placeholder (like "~하다"), use "..." instead (e.g., "...하다"). Tildes cause markdown strikethrough bugs.
4. For the "examples" field: If the source includes a Korean translation for an example sentence, copy it EXACTLY and format as "English sentence (한국어 해석)". If the source has NO Korean translation for an example, you MUST GENERATE a natural Korean translation yourself and append it in the same format. Every example MUST include a Korean translation.

OUTPUT FORMAT:
You MUST output a valid JSON array of objects.
Each object MUST have the following keys:
- "word": The English vocabulary word (required)
- "pos": Part of speech (e.g., 명, 동, 형) (required)
- "pronunciation": Pronunciation symbol (optional)
- "meaning": The Korean meaning exactly as written (required)
- "examples": Array of example sentences. Format MUST be "English sentence (한국어 해석)" — ALWAYS include translation.
- "synonyms": Array of strings (optional). MUST format as "English_word [POS]: Korean_meaning".
- "antonyms": Array of strings (optional). MUST format as "English_word [POS]: Korean_meaning".
- "related": Array of strings (optional). MUST format as "English_word [POS]: Korean_meaning".
- "etymology": Array of strings. MUST aggressively analyze the etymology (prefix/root/suffix) of the word. Format as "morpheme(meaning)". For example: ["re(다시)", "view(보다)"]. If absolutely no etymology can be found, use an empty array.

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
      copyPromptBtn.textContent = '✅ 복사 완료!';
      setTimeout(() => copyPromptBtn.textContent = orgText, 2000);
    } catch (e) {
      alert('복사 실패! 브라우저 권한을 확인해주세요.');
    }
  });
}

// ─── ENRICHED PROMPT (AI generates rich vocab data from bare word list) ───
const enrichPromptOutput = document.getElementById('enrich-prompt-output');
const copyEnrichPromptBtn = document.getElementById('copy-enrich-prompt-btn');

const ENRICH_PROMPT = `You are an expert English vocabulary educator creating premium study cards for Korean learners.

I will give you a list of English words. For EACH word, you MUST generate rich, high-quality vocabulary data entirely from your own knowledge - do NOT extract from images; CREATE the data.

FOR EACH WORD, generate:
- "word": The exact English word
- "pos": Part of speech in Korean abbreviation (명, 동, 형, 부, 전, 접, 감)
- "pronunciation": IPA phonetic symbol (e.g., /wərd/)
- "meaning": Clear Korean meaning (2-3 words per sense; add multiple senses if important)
- "examples": Array of 2 English sentences each with Korean translation. Format: "English. / 한국어."
- "synonyms": 2-3 synonyms. Format: "word [POS]: Korean"
- "antonyms": 1-2 antonyms if exist. Format: "word [POS]: Korean"
- "related": 2-3 related words or collocations. Format: "word [POS]: Korean"
- "etymology": Array of morphemes. Format: "morpheme(Korean_meaning)". E.g. for 'preview': ["pre(미리)","view(보다)"]. Use [] if none.

CRITICAL RULES:
1. Generate data for EVERY word - skip NONE.
2. NEVER use the tilde (~) character. Use "..." instead (e.g. "...하다").
3. Output MUST be a RAW minified JSON array on a SINGLE LINE.
4. NO markdown code blocks, NO explanatory text.
5. Output starts with [ and ends with ].

Here are the words (paste one per line below):
[단어 목록을 여기에 붙여넣으세요 — 예: apple / banana / surrender]`;

if (enrichPromptOutput) enrichPromptOutput.value = ENRICH_PROMPT;

if (copyEnrichPromptBtn) {
  copyEnrichPromptBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(ENRICH_PROMPT);
      const orgText = copyEnrichPromptBtn.textContent;
      copyEnrichPromptBtn.textContent = '✅ 복사 완료!';
      setTimeout(() => copyEnrichPromptBtn.textContent = orgText, 2000);
    } catch (e) {
      alert('복사 실패! 브라우저 권한을 확인해주세요.');
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERT HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

function parseResponse(text) {
  let c = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const s = c.indexOf('[');
  if (s === -1) throw new Error('JSON 배열 시작 부분을 찾을 수 없습니다.\nAI가 준 응답에서 [...] 형태의 데이터를 찾지 못했습니다.');
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
    throw new Error(`JSON 파싱 오류: ${err.message}\n(AI가 쌍따옴표를 잘못 썼거나 텍스트가 잘렸을 수 있습니다)`);
  }
}

function formatCard(item, frontOpt, backOpt) {
  const ensureStringArray = (arr) => Array.isArray(arr) ? arr.map(x => typeof x === 'object' ? Object.values(x).join(' ') : String(x)) : [];

  let front = item.word || '';
  if (frontOpt === 'word_pos' && item.pos) front += `  ${item.pos}`;
  if (frontOpt === 'word_pron' && item.pronunciation) front += `  ${item.pronunciation}`;

  const parts = [];
  if (item.meaning) parts.push(`📌 뜻\n${item.pos ? item.pos + ' ' : ''}${item.meaning}`);
  if (backOpt === 'full') {
    const etys = ensureStringArray(item.etymology);
    const syns = ensureStringArray(item.synonyms);
    const ants = ensureStringArray(item.antonyms);
    const rels = ensureStringArray(item.related);
    if (etys.length) parts.push(`🧩 어원\n• ${etys.join(' + ')}`);
    if (syns.length) parts.push(`✅ 유의어\n• ${syns.join('\n• ')}`);
    if (ants.length) parts.push(`❌ 반의어\n• ${ants.join('\n• ')}`);
    if (rels.length) parts.push(`🔗 관련어\n• ${rels.join('\n• ')}`);
  }
  const exs = ensureStringArray(item.examples);
  if (backOpt !== 'meaning_only' && exs.length) parts.push(`📖 예문\n• ${exs.join('\n• ')}`);

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
      alert("AI가 준 결과를 붙여넣어 주세요.");
      return;
    }

    // Use full options for the database internal representation
    const frontOpt = 'word_pos';
    const backOpt = 'full';

    convertBtn.disabled = true;
    const orgText = convertBtn.innerHTML;
    convertBtn.innerHTML = '<span class="btn-icon">⚡</span> 변환 중...';

    try {
      const allParsed = parseResponse(rawText);
      if (!Array.isArray(allParsed) || !allParsed.length) {
        throw new Error("결과에서 단어를 추출하지 못했습니다. (배열이 비어있음)");
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
      showError("변환 오류", err.message);
    } finally {
      convertBtn.disabled = false;
      convertBtn.innerHTML = orgText;
    }
  });
}

// ─── Auto Save ────────────────────────────────────────────────────────────────
async function autoSaveToLibrary(data) {
  if (!currentUser || !selectedBookId || !selectedChapterId) {
    alert('저장할 단원을 찾지 못했습니다. 단원(챕터) 안에서 추출해주세요.');
    return;
  }
  const requestSession = authSessionVersion;
  const wordsPath = `users/${currentUser.uid}/books/${selectedBookId}/chapters/${selectedChapterId}/words`;
  try {
    let maxOrder = currentLoadedWords.reduce((max, w) => Math.max(max, w.order || 0), -1);
    for (let i = 0; i < data.length; i++) {
      if (requestSession !== authSessionVersion) return;
      const wordRef = doc(collection(db, wordsPath));
      await setDoc(wordRef, { ...data[i], order: maxOrder + 1 + i });
      if (convertBtn) {
        const percent = Math.floor(((i + 1) / data.length) * 100);
        convertBtn.innerHTML = `<span class="btn-icon">⚡</span> 저장 중... ${percent}%`;
      }
    }
    alert(`${data.length}개 단어가 성공적으로 저장되었습니다!`);
    if (extractModal) closeModal(extractModal);
  } catch (e) {
    console.error(e);
    alert('저장 실패: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST MODE
// ═══════════════════════════════════════════════════════════════════════════════

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
      document.querySelectorAll(selector).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onSelect(btn.dataset.mode || btn.dataset.dir || btn.dataset.order);
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
      showToast('테스트를 진행할 단어가 없습니다.');
      return;
    }
    $('test-word-count-info').textContent = `총 ${currentLoadedWords.length}개 단어로 테스트합니다.`;
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
  [testSetup, testFlash, testQuiz, testShort, testTrace, testResult].forEach(s => s.classList.add('hidden'));
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
  document.body.classList.remove('test-open');
  closeModal(testModal);
}

function startTest(words) {
  testWords = words;
  testIndex = 0;
  testCorrect = 0;
  testWrong = [];
  document.body.classList.add('test-open');

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

// ─── Flashcard ────────────────────────────────────────────────────────────────
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

  // 입장 애니메이션
  const flashContainer = $('flashcard-container');
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

// ─── Quiz (4지선다) ───────────────────────────────────────────────────────────
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
    questionLabel.textContent = '다음 단어의 뜻은?';
    questionWord.textContent = data.word;
    const correctAnswer = data.meaning || data.back || '(뜻 없음)';
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
    questionLabel.textContent = '다음 뜻의 단어는?';
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

  // 모름 버튼 추가
  const dontKnowBtn = document.createElement('button');
  dontKnowBtn.className = 'quiz-choice-btn quiz-dontknow-btn';
  dontKnowBtn.textContent = '🤔 모름';
  dontKnowBtn.addEventListener('click', () => {
    // 모든 선택지 비활성화
    choices.querySelectorAll('.quiz-choice-btn').forEach(b => b.disabled = true);
    // 정답 표시
    const correctAnswer = (testDir === 'word2meaning')
      ? (parseWordData(testWords[testIndex]).meaning || parseWordData(testWords[testIndex]).back || '')
      : parseWordData(testWords[testIndex]).word;
    choices.querySelectorAll('.quiz-choice-btn').forEach(b => {
      if (b.textContent === correctAnswer) b.classList.add('correct');
    });
    dontKnowBtn.classList.add('wrong');
    testWrong.push(parseWordData(testWords[testIndex]).word);
    
    const fb = $('quiz-feedback');
    fb.innerHTML = `<span class="wrong-label">모름 처리됨</span><br>정답: <strong>${escapeHTML(correctAnswer)}</strong>`;
    fb.classList.remove('correct-fb');
    fb.classList.add('wrong-fb', 'show-feedback');
    
    setTimeout(() => { 
      fb.classList.remove('show-feedback');
      testIndex++; 
      animateAndShowQuizCard(); 
    }, 1200);
  });
  choices.appendChild(dontKnowBtn);

  // 입장 애니메이션
  const quizScreen = $('test-quiz');
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
    fb.innerHTML = `<span class="correct-label">정답입니다!</span>`;
    fb.classList.remove('wrong-fb');
    fb.classList.add('correct-fb', 'show-feedback');
  } else {
    clickedBtn.classList.add('wrong');
    const data = parseWordData(testWords[testIndex]);
    testWrong.push(data.word);
    fb.innerHTML = `<span class="wrong-label">틀렸습니다!</span><br>정답: <strong>${escapeHTML(correct)}</strong>`;
    fb.classList.remove('correct-fb');
    fb.classList.add('wrong-fb', 'show-feedback');
  }

  setTimeout(() => {
    fb.classList.remove('show-feedback');
    testIndex++;
    animateAndShowQuizCard();
  }, 1200);
}

// ─── Virtual Keyboard ───
let vkUseNative = false;
let vkIsShift = false;
let vkLayout = 'en';

const vkLayouts = {
  en: {
    normal: [
      ['q','w','e','r','t','y','u','i','o','p'],
      ['a','s','d','f','g','h','j','k','l'],
      ['Shift','z','x','c','v','b','n','m','⌫'],
      ['EN/KR','Space','Enter']
    ],
    shift: [
      ['Q','W','E','R','T','Y','U','I','O','P'],
      ['A','S','D','F','G','H','J','K','L'],
      ['Shift','Z','X','C','V','B','N','M','⌫'],
      ['EN/KR','Space','Enter']
    ]
  },
  ko: {
    normal: [
      ['ㅂ','ㅈ','ㄷ','ㄱ','ㅅ','ㅛ','ㅕ','ㅑ','ㅐ','ㅔ'],
      ['ㅁ','ㄴ','ㅇ','ㄹ','ㅎ','ㅗ','ㅓ','ㅏ','ㅣ'],
      ['Shift','ㅋ','ㅌ','ㅊ','ㅍ','ㅠ','ㅜ','ㅡ','⌫'],
      ['EN/KR','Space','Enter']
    ],
    shift: [
      ['ㅃ','ㅉ','ㄸ','ㄲ','ㅆ','ㅛ','ㅕ','ㅑ','ㅒ','ㅖ'],
      ['ㅁ','ㄴ','ㅇ','ㄹ','ㅎ','ㅗ','ㅓ','ㅏ','ㅣ'],
      ['Shift','ㅋ','ㅌ','ㅊ','ㅍ','ㅠ','ㅜ','ㅡ','⌫'],
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
      if (key === 'Shift' || key === '⌫' || key === 'EN/KR') btn.classList.add('vk-wide');
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
  
  if (key === '⌫') {
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

// ─── Short Answer (주관식) ──────────────────────────────────────────────────────
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
    questionLabel.textContent = '다음 단어의 뜻을 입력하세요';
    questionWord.textContent = data.word;
    const rawMeaning = data.meaning || data.back || '';
    shortCorrectAnswer = rawMeaning.split(/[,\n]/)
      .map(s => s.replace(/^[0-9]+/, '').trim())
      .filter(Boolean);
    if (!shortCorrectAnswer.length) shortCorrectAnswer = [rawMeaning];
  } else {
    questionLabel.textContent = '다음 뜻의 단어를 입력하세요';
    questionWord.textContent = data.meaning || data.back;
    shortCorrectAnswer = [data.word.toLowerCase().trim()];
  }

  // 입장 애니메이션
  const shortScreen = $('test-short');
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
    feedback.innerHTML = `<span class="correct-label">정답입니다!</span><br>원래 답: ${escapeHTML(testDir === 'word2meaning' ? shortCurrentData.meaning : shortCurrentData.word)}`;
    testCorrect++;
  } else {
    input.classList.add('wrong');
    feedback.classList.add('wrong-fb');
    feedback.innerHTML = `<span class="wrong-label">틀렸습니다!</span><br>정답: <strong>${escapeHTML(testDir === 'word2meaning' ? shortCurrentData.meaning : shortCurrentData.word)}</strong>`;
    testWrong.push(shortCurrentData.word);
    if ($('short-appeal-btn')) {
      $('short-appeal-btn').classList.remove('hidden');
    }
  }
  
  input.blur();
}

$('short-submit-btn').addEventListener('click', handleShortSubmit);
// 엔터키: 아직 submit 단계일 때만 처리, 다음(next) 단계에서는 무시
$('short-answer-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (!$('short-submit-btn').classList.contains('hidden')) {
      e.preventDefault();
      handleShortSubmit();
    }
    // submit이 hidden이면(다음 버튼 상태) 아무것도 하지 않음
  }
});

// 모름 버튼
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
    feedback.innerHTML = `<span class="wrong-label">모름 처리</span><br>정답: <strong>${escapeHTML(testDir === 'word2meaning' ? shortCurrentData.meaning : shortCurrentData.word)}</strong>`;
    testWrong.push(shortCurrentData.word);
    input.blur();
  });
}

// ─── AI Appeal (server-side shared credential) ────────────────────────────────
if ($('short-appeal-btn')) {
  $('short-appeal-btn').addEventListener('click', async () => {
    if (!currentUser || !shortCurrentData || !selectedBookId || !selectedChapterId) return;
    const requestSession = authSessionVersion;
    const appealBtn = $('short-appeal-btn');
    const input = $('short-answer-input');
    const answer = input.value.trim();
    const wordId = shortCurrentData._path?.split('/').pop();
    if (!answer || !wordId) return;
    const originalText = appealBtn.textContent;
    appealBtn.textContent = '🤖 채점 중...';
    appealBtn.disabled = true;
    try {
      const result = await callStudyAi({action: 'appeal', bookId: selectedBookId, chapterId: selectedChapterId,
        wordId, direction: testDir, userAnswer: answer});
      if (requestSession !== authSessionVersion) return;
      const feedback = $('short-feedback');
      if (result.data.isApproved === true) {
        input.classList.remove('wrong');
        input.classList.add('correct');
        feedback.classList.remove('wrong-fb');
        feedback.classList.add('correct-fb');
        feedback.textContent = '🤖 정답으로 인정했습니다!';
        testWrong = testWrong.filter(word => word !== shortCurrentData.word);
        testCorrect++;
      } else {
        feedback.append(document.createTextNode(' 🤖 오답 처리를 유지합니다.'));
      }
      appealBtn.classList.add('hidden');
    } catch (error) {
      if (requestSession !== authSessionVersion) return;
      $('short-feedback').append(document.createTextNode(' ⚠️ ' + (error.message || 'AI 채점에 실패했습니다.')));
    } finally {
      appealBtn.textContent = originalText;
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

// ─── Result ───────────────────────────────────────────────────────────────────
function showTestResult() {
  showScreen('result');
  const total = testWords.length;
  const pct = Math.round((testCorrect / total) * 100);

  $('result-pct').textContent = pct + '%';
  $('result-title').textContent = pct >= 80 ? '🎉 훌륭해요!' : pct >= 50 ? '👍 잘 했어요!' : '💪 더 연습해요!';
  $('result-desc').textContent = `${total}개 중 ${testCorrect}개 정답 (오답 ${testWrong.length}개)`;

  // Animate circle
  const circumference = 327;
  const offset = circumference - (pct / 100) * circumference;
  setTimeout(() => {
    $('result-circle-dash').style.strokeDashoffset = offset;
  }, 100);

  // Wrong words list
  const wrongList = $('result-wrong-list');
  if (testWrong.length > 0) {
    wrongList.innerHTML = '<strong style="color:var(--danger);">틀린 단어:</strong><br>' + escapeHTML(testWrong.join(', '));
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

// ─── View Test History ────────────────────────────────────────────────────────
if (viewHistoryBtn) {
  viewHistoryBtn.addEventListener('click', async () => {
    if (!currentUser || !selectedBookId || !selectedChapterId) return;
    const requestSession = authSessionVersion;
    
    historyList.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:2rem;">기록 불러오는 중...</p>';
    openModal(historyModal);

    try {
      const q = query(
        collection(db, `users/${currentUser.uid}/books/${selectedBookId}/chapters/${selectedChapterId}/testHistory`),
        orderBy('timestamp', 'desc')
      );
      const snap = await getDocs(q);
      if (requestSession !== authSessionVersion) return;
      
      historyList.innerHTML = '';
      chapterHistoryRecords = [];
      if (snap.empty) {
        historyList.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:2rem;">아직 테스트 기록이 없습니다.</p>';
        return;
      }

      snap.forEach(doc => {
        const data = doc.data();
        chapterHistoryRecords.push(data);
        const dateStr = data.timestamp ? data.timestamp.toDate().toLocaleString() : '방금 전';
        const modeLabel = data.mode === 'flash' ? '🃏 플래시카드' : data.mode === 'quiz' ? '✏️ 4지선다' : '✍️ 주관식';
        const pct = Math.round((data.correct / data.total) * 100) || 0;
        
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
          <div class="history-summary">
            <div class="history-header">
              <span class="history-title">${modeLabel} <span style="font-size:0.8rem; font-weight:normal; color:var(--text-muted);">(${data.dir === 'word2meaning' ? '단어→뜻' : '뜻→단어'})</span></span>
              <span class="history-date">${escapeHTML(dateStr)}</span>
            </div>
          </div>
        `;
        item.onclick = () => {
          historyDetailTitle.innerHTML = `${modeLabel} <span style="font-size:0.8rem; font-weight:normal; color:var(--text-muted);">(${data.dir === 'word2meaning' ? '단어→뜻' : '뜻→단어'})</span>`;
          historyDetailDate.textContent = dateStr;
          historyDetailScore.innerHTML = `${escapeHTML(data.correct)} / ${escapeHTML(data.total)} 정답 <span style="color:${pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--primary-light)' : 'var(--danger)'}">(${pct}%)</span>`;
          
          if (data.wrongWords && data.wrongWords.length > 0) {
            historyDetailWrong.innerHTML = `<strong>틀린 단어:</strong><br/>${escapeHTML(data.wrongWords.join(', '))}`;
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
      if (requestSession === authSessionVersion) {
        historyList.innerHTML = `<p style="text-align:center; color:var(--danger); padding:2rem;">오류: ${escapeHTML(e.message)}</p>`;
      }
    }
  });
}

if (historyCloseBtn) {
  historyCloseBtn.addEventListener('click', () => {
    closeModal(historyModal);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function showError(title, msg) {
  errorTitle.textContent = title;
  errorMsg.textContent = msg;
  errorSection.classList.remove('hidden');
}
function hideError() { errorSection.classList.add('hidden'); }

// ═══════════════════════════════════════════════════════════════════════════════
// VERSION BADGE (from GitHub)
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchLatestVersion() {
  try {
    const res = await fetch('https://api.github.com/repos/JunHyuk1203/goodnotesword/commits/main');
    if (!res.ok) return;
    const data = await res.json();
    const date = new Date(data.commit.author.date);
    const badge = $('build-time');
    if (badge) {
      badge.textContent = `마지막 업데이트: ${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
      badge.title = data.commit.message;
    }
  } catch (e) { console.error('Version fetch failed:', e); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════

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
    case 'auth/invalid-email': return "유효하지 않은 이메일 형식입니다.";
    case 'auth/user-not-found': return "가입되지 않은 이메일이거나 삭제된 계정입니다.";
    case 'auth/wrong-password': return "비밀번호가 틀렸습니다.";
    case 'auth/invalid-credential': return "이메일 또는 비밀번호가 올바르지 않습니다.";
    case 'auth/email-already-in-use': return "이미 가입된 이메일입니다.";
    case 'auth/weak-password': return "비밀번호는 6자리 이상이어야 합니다.";
    case 'auth/too-many-requests': return "너무 많은 로그인 시도가 있었습니다. 잠시 후 다시 시도해주세요.";
    case 'auth/network-request-failed': return "네트워크 연결에 실패했습니다.";
    case 'auth/credential-already-in-use': return "이 계정은 이미 다른 사용자와 연동되어 있습니다.";
    case 'auth/requires-recent-login': return "보안을 위해 다시 로그인한 후 시도해주세요.";
    default: return "오류가 발생했습니다. (" + code + ")";
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
    if (authSubmitBtn) authSubmitBtn.textContent = '로그인';
    if (privacyCheckboxContainer) privacyCheckboxContainer.classList.add('hidden');
    hideAuthError();
  });
  tabSignup.addEventListener('click', () => {
    isLoginMode = false;
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    if (authSubmitBtn) authSubmitBtn.textContent = '회원가입';
    if (privacyCheckboxContainer) privacyCheckboxContainer.classList.remove('hidden');
    hideAuthError();
  });
}

if (authForm) {
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = authEmail.value.trim();
    const password = authPassword.value;
    hideAuthError();
    
    try {
      if (isLoginMode) {
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        if (!userCred.user.emailVerified) {
          alert("이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요.");
          await signOut(auth);
          return;
        }
      } else {
        if (privacyCheckbox && !privacyCheckbox.checked) {
          showAuthError('개인정보 수집 및 이용에 동의해주세요.');
          return;
        }
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCred.user);
        alert("회원가입이 완료되었습니다. 이메일 인증 링크를 발송했으니, 메일함을 확인하신 후 다시 로그인해주세요.");
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
      showAuthError('개인정보 수집 및 이용에 동의해주세요.');
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const additionalInfo = getAdditionalUserInfo(result);
      if (isLoginMode && additionalInfo && additionalInfo.isNewUser) {
        await deleteUser(result.user);
        showAuthError("가입되지 않은 구글 계정입니다. '회원가입' 탭에서 개인정보 수집 동의 후 진행해주세요.");
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
      showAuthError("비밀번호를 재설정할 이메일을 위에 입력해주세요.");
      return;
    }
    try {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      if (methods.length === 0) {
        showAuthError("가입되지 않은 이메일입니다.");
        return;
      }
      await sendPasswordResetEmail(auth, email);
      alert("비밀번호 재설정 이메일이 발송되었습니다. 확인 후 다시 로그인해주세요.");
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
    const newPassword = prompt("새로 설정할 일반 로그인 비밀번호를 입력해주세요 (6자리 이상):");
    if (!newPassword) return;
    if (newPassword.length < 6) {
      alert("비밀번호는 6자리 이상이어야 합니다.");
      return;
    }
    try {
      await updatePassword(auth.currentUser, newPassword);
      alert("비밀번호가 성공적으로 설정되었습니다. 보안을 위해 다시 로그인해주세요.");
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
      alert("Google 계정이 성공적으로 연동되었습니다. 이제 Google 로그인 버튼으로도 접속하실 수 있습니다!");
      document.getElementById('settings-link-google-container').classList.add('hidden');
    } catch (err) {
      alert(getKoreanAuthError(err.code) || err.message);
    }
  });
}

function handleAuthStateChanged(user) {
  authSessionVersion++;
  // The observer runs before the login submit handler checks verification.
  if (user && user.emailVerified) {
    const nextUserId = user.email === 'tntgame1203@gmail.com' ? 'default_user' : user.uid;
    // Account replacement can happen without an intermediate signed-out event.
    if (currentUser && currentUser.uid !== nextUserId) handleAuthStateChanged(null);
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
        providersContainer.innerHTML += '<span style="background:var(--bg-tertiary); color:var(--text-secondary); padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600;">이메일 연동됨</span>';
      }
      if (hasGoogle) {
        providersContainer.innerHTML += '<span style="background:var(--bg-tertiary); color:var(--text-secondary); padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600;">Google 연동됨</span>';
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
    sessionStorage.removeItem('superword_ai_key');
    currentLoadedWords = [];
    generatedData = [];
    testWords = [];
    testWrong = [];
    swipeWords = [];
    chapterHistoryRecords = [];
    currentTestRecord = null;
    selectedBookId = null;
    selectedChapterId = null;
    currentBookNameStore = '';
    currentEditDocRef = null;
    shortCurrentData = null;
    testIndex = 0;
    testCorrect = 0;
    [viewBooks, viewChapters, wordsCardView, wordsEditView, wordsSwipeView,
      wordsTbody, historyList, historyDetailTitle, historyDetailDate,
      historyDetailScore, historyDetailWrong, historyAiReportContainer].forEach(el => el?.replaceChildren());
    ['flashcard-front', 'flashcard-back', 'quiz-question-word', 'quiz-choices',
      'quiz-feedback', 'short-question-word', 'short-feedback', 'trace-feedback',
      'result-desc', 'result-wrong-list', 'test-word-count-info', 'settings-user-email']
      .forEach(id => $(id)?.replaceChildren());
    document.querySelectorAll('#edit-word-modal input, #edit-word-modal textarea, #ai-json-input, #short-answer-input, #auth-password')
      .forEach(input => { input.value = ''; });
    document.querySelectorAll('#test-modal canvas').forEach(canvas => {
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    });
    document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.add('hidden'));
    document.querySelectorAll('.modal-screen').forEach(modal => closeModal(modal));
    setLibraryLevel(0);
    if (_ttsAudio) { _ttsAudio.pause(); _ttsAudio = null; }
    if (landingScreen) landingScreen.classList.remove('hidden');
    if (authScreen) authScreen.classList.add('hidden');
    if (libraryContent) libraryContent.classList.add('hidden');
    
    if (typeof unsubBooks !== "undefined" && unsubBooks) { unsubBooks(); unsubBooks = null; }
    if (typeof unsubChapters !== "undefined" && unsubChapters) { unsubChapters(); unsubChapters = null; }
    if (typeof unsubWords !== "undefined" && unsubWords) { unsubWords(); unsubWords = null; }
  }
}
onAuthStateChanged(auth, handleAuthStateChanged);

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
    openModals.forEach(m => closeModal(m));
    
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
// Trace (따라쓰기) Test Implementation
// -----------------------------------------------------------------------------
let traceFailCount = 0;
let currentTraceData = null;

const traceEnCanvas = document.getElementById('trace-en-canvas');
const traceKoCanvas = document.getElementById('trace-ko-canvas');
const traceEnCtx = traceEnCanvas?.getContext('2d', { willReadFrequently: true });
const traceKoCtx = traceKoCanvas?.getContext('2d', { willReadFrequently: true });

function initTraceCanvas(canvas) {
  if (!canvas) return null;
  
  // Clone to remove old event listeners
  const clone = canvas.cloneNode(true);
  canvas.parentNode.replaceChild(clone, canvas);
  const ctx = clone.getContext('2d', { willReadFrequently: true });
  
  // Handle high DPI displays for crisp drawing
  const rect = clone.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = rect.width || 400;
  const cssHeight = rect.height || 150;
  
  // Always set physical width/height and apply scale on the NEW context
  clone.width = cssWidth * dpr;
  clone.height = cssHeight * dpr;
  ctx.scale(dpr, dpr);
  
  // Only the draw layer needs touch events
  if (clone.classList.contains('trace-draw-layer')) {
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    let lastUpdateTime = 0;

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
      ctx.lineWidth = 15; // Make user stroke thicker
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
      ctx.lineWidth = 15;
      ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#ffffff';
      ctx.stroke();
      lastX = pos.x;
      lastY = pos.y;
      
      if (Date.now() - lastUpdateTime > 100) {
        if (typeof updateRealtimeAccuracy === "function") updateRealtimeAccuracy();
        lastUpdateTime = Date.now();
      }
    }

    function stopDrawing() {
      isDrawing = false;
      ctx.beginPath();
      if (typeof updateRealtimeAccuracy === "function") updateRealtimeAccuracy();
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
  }
  
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
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  
  ctx.clearRect(0, 0, w, h);
  
  const fontFamily = isKo ? "'Nanum Pen Script', cursive, sans-serif" : "'Comic Neue', cursive, sans-serif";
  const fontWeight = isKo ? "400" : "700";
  
  ctx.font = `${fontWeight} 100px ${fontFamily}`;
  const baseWidth = ctx.measureText(text).width;
  
  const maxFontSizeWidth = ((w - 20) / baseWidth) * 100;
  const maxFontSizeHeight = h - 20;
  
  let fontSize = Math.min(maxFontSizeWidth, maxFontSizeHeight);
  fontSize = Math.max(10, Math.min(fontSize, 600));
  
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  ctx.fillStyle = 'rgba(255, 255, 255, 1)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  // === 1. Skeleton Mask (Length metric) ===
  // A thin 1px core of the font. Used to measure if the user traced the entire length.
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 1;
  ctx.fillText(text, w / 2, h / 2);
  ctx.strokeText(text, w / 2, h / 2); // Thin stroke to ensure continuous skeleton
  
  let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const skeletonMask = new Uint8Array(canvas.width * canvas.height);
  let skeletonTotal = 0;
  for (let i = 0; i < imgData.data.length; i += 4) {
    if (imgData.data[i + 3] > 20) {
      skeletonMask[i / 4] = 1;
      skeletonTotal++;
    }
  }

  // === 2. Expected Area (15px brush) ===
  // Represents the ideal area if traced perfectly with the user's 15px brush.
  // Used to detect if the user is scribbling/coloring in.
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 15;
  ctx.fillText(text, w / 2, h / 2);
  ctx.strokeText(text, w / 2, h / 2);
  
  imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let expectedArea = 0;
  for (let i = 0; i < imgData.data.length; i += 4) {
    if (imgData.data[i + 3] > 20) {
      expectedArea++;
    }
  }
  
  // === 3. Allow Mask (25px boundary) ===
  // Generous boundary to prevent penalizing natural hand jitter
  ctx.lineWidth = 25;
  ctx.strokeText(text, w / 2, h / 2);
  
  imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const allowMask = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    if (imgData.data[i + 3] > 20) {
      allowMask[i / 4] = 1;
    }
  }
  
  // === 4. Draw the VISUAL guide (thin, semi-transparent) ===
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(150, 150, 150, 0.6)';
  ctx.fillText(text, w / 2, h / 2);
  
  return { skeletonMask, skeletonTotal, allowMask, expectedArea, w, h, fontSize };
}

// Global auto-grading function
function updateRealtimeAccuracy() {
  if (!activeEnCanvas || !activeEnCtx || !targetMaskEn) return;
  const enAcc = calculateTraceAccuracy(activeEnCanvas, activeEnCtx, targetMaskEn);
  updateTraceBar('trace-en-acc-bar', 'trace-en-acc-text', enAcc);
  
  let koAcc = 100;
  if (targetMaskKo) {
    koAcc = calculateTraceAccuracy(activeKoCanvas, activeKoCtx, targetMaskKo);
    updateTraceBar('trace-ko-acc-bar', 'trace-ko-acc-text', koAcc);
  }
  
  // Enable next button if both are >= 80
  const nextBtn = document.getElementById('trace-next-btn');
  if (enAcc >= 80 && koAcc >= 80) {
    const fb = document.getElementById('trace-feedback');
    if (!fb.classList.contains('correct-fb')) { // Prevent multiple triggers
      fb.textContent = '✅ 잘 썼습니다! 다음으로 넘어가세요.';
      fb.className = 'short-feedback show-feedback correct-fb';
      if (nextBtn) nextBtn.disabled = false;
    }
  } else {
    if (nextBtn) nextBtn.disabled = true;
    const fb = document.getElementById('trace-feedback');
    fb.className = 'short-feedback'; // Hide if drops below 80
  }
}

function showTraceCard() {
  const traceScreen = document.getElementById('test-trace');
  traceScreen.classList.remove('card-slide-in');
  void traceScreen.offsetWidth;
  traceScreen.classList.add('card-slide-in');
  
  if (testIndex >= testWords.length) {
    showTestResult();
    return;
  }
  
  traceFailCount = 0;
  document.getElementById('trace-feedback').textContent = '';
  document.getElementById('trace-feedback').className = 'short-feedback';
  document.getElementById('trace-en-acc-bar').style.width = '0%';
  document.getElementById('trace-ko-acc-bar').style.width = '0%';
  document.getElementById('trace-en-acc-text').textContent = '0%';
  document.getElementById('trace-ko-acc-text').textContent = '0%';
  
  const data = parseWordData(testWords[testIndex]);
  currentTraceData = data;
  const total = testWords.length;
  const pct = (testIndex / total) * 100;

  document.getElementById('trace-progress-fill').style.width = pct + '%';
  document.getElementById('trace-progress-text').textContent = `${testIndex + 1} / ${total}`;
  
  // Re-init guide canvases (no events)
  const enGuideRes = initTraceCanvas(document.getElementById('trace-en-guide'));
  const koGuideRes = initTraceCanvas(document.getElementById('trace-ko-guide'));
  
  // Re-init draw canvases (has events)
  const enRes = initTraceCanvas(document.getElementById('trace-en-draw'));
  activeEnCanvas = enRes.canvas;
  activeEnCtx = enRes.ctx;
  
  const koRes = initTraceCanvas(document.getElementById('trace-ko-draw'));
  activeKoCanvas = koRes.canvas;
  activeKoCtx = koRes.ctx;
  
  const meaningText = data.meaning ? data.meaning.split(',')[0].trim() : data.back || '';
  
  // Render guides and save masks
  targetMaskEn = renderTraceGuide(enGuideRes.canvas, enGuideRes.ctx, data.word, false);
  if (data.meaning) {
    document.getElementById('trace-ko-draw').parentNode.style.display = 'flex';
    targetMaskKo = renderTraceGuide(koGuideRes.canvas, koGuideRes.ctx, meaningText, true);
  } else {
    document.getElementById('trace-ko-draw').parentNode.style.display = 'none';
    targetMaskKo = null;
  }
  
  // Clear the drawing layers for the new word
  clearTraceCanvas(activeEnCanvas, activeEnCtx);
  clearTraceCanvas(activeKoCanvas, activeKoCtx);
  

}

function clearTraceCanvas(canvas, ctx) {
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
}

document.getElementById('trace-en-clear-btn')?.addEventListener('click', () => {
  clearTraceCanvas(activeEnCanvas, activeEnCtx);
});

document.getElementById('trace-ko-clear-btn')?.addEventListener('click', () => {
  clearTraceCanvas(activeKoCanvas, activeKoCtx);
  if (typeof updateRealtimeAccuracy === "function") updateRealtimeAccuracy();
});

// Trace Next Button
document.getElementById('trace-next-btn')?.addEventListener('click', () => {
  testCorrect++; // They passed
  const traceScreen = document.getElementById('test-trace');
  traceScreen.classList.add('card-slide-out');
  setTimeout(() => {
    traceScreen.classList.remove('card-slide-out');
    testIndex++;
    showTraceCard();
  }, 200);
});

// Global modal close button fix
document.addEventListener('click', (e) => {
  const closeBtn = e.target.closest('.sheet-close-btn');
  if (closeBtn) {
    const modal = closeBtn.closest('.modal-screen');
    if (modal) {
      if (modal.id === 'test-modal') {
        closeTest();
      } else {
        closeModal(modal);
      }
    }
  }
});

function calculateTraceAccuracy(canvas, ctx, maskData) {
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  
  let validUserArea = 0;
  let overflowArea = 0;
  let hitSkeleton = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a > 100) {
      const idx = i / 4;
      if (maskData.allowMask[idx] === 1) {
        validUserArea++;
      } else {
        overflowArea++;
      }
      if (maskData.skeletonMask && maskData.skeletonMask[idx] === 1) {
        hitSkeleton++;
      }
    }
  }
  
  if (!maskData.skeletonTotal || maskData.skeletonTotal === 0) return 100;
  if (validUserArea + overflowArea === 0) return 0;
  
  // 1. Completion: How much of the skeleton did they touch?
  // Capped at 1.0. An 85% hit is considered a perfect trace due to skipped serifs/natural handwriting flow.
  let completion = hitSkeleton / maskData.skeletonTotal;
  completion = Math.min(1.0, completion / 0.85);
  
  // 2. Overflow penalty: Deduct points for drawing outside the generous allowMask (25px boundary).
  const overflowPenalty = (overflowArea / maskData.expectedArea) * 1.5;
  
  // 3. Excess ink penalty (Anti-coloring): Deduct points heavily if they scribble to artificially fill the area.
  // 1.3x expectedArea is a normal margin for overlapping natural strokes.
  const excessPenalty = Math.max(0, (validUserArea - maskData.expectedArea * 1.3) / maskData.expectedArea) * 3.0;
  
  // Final calculation
  let rawScore = completion - overflowPenalty - excessPenalty;
  
  return Math.max(0, Math.min(100, Math.round(rawScore * 100)));
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
  // Lowered threshold to 60 because F1-Score is much stricter than simple coverage
  if (enAcc >= 60 && koAcc >= 60) {
    fb.textContent = '✅ 정확하게 잘 따라 썼습니다!';
    fb.className = 'short-feedback show-feedback correct-fb';
    testCorrect++;
    
    setTimeout(() => {
      const traceScreen = document.getElementById('test-trace');
      traceScreen.classList.add('card-slide-out');
      setTimeout(() => {
        traceScreen.classList.remove('card-slide-out');
        testIndex++;
        showTraceCard();
      }, 200);
    }, 1000);
  } else {
    traceFailCount++;
    fb.textContent = `❌ 정확도 미달 (영어: ${enAcc}%, 한글: ${koAcc}%)`;
    fb.className = 'short-feedback show-feedback wrong-fb';
    
    if (traceFailCount >= 3) {
      document.getElementById('trace-skip-btn').classList.remove('hidden');
    }
  }
});

document.getElementById('trace-skip-btn')?.addEventListener('click', () => {
  testWrong.push(currentTraceData.word);
  const traceScreen = document.getElementById('test-trace');
  traceScreen.classList.add('card-slide-out');
  setTimeout(() => {
    traceScreen.classList.remove('card-slide-out');
    testIndex++;
    showTraceCard();
  }, 200);
});

document.getElementById('trace-close-btn')?.addEventListener('click', closeTest);

// End Trace
