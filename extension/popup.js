/**
 * popup.js — Vibe Mini Player popup
 *
 * SECURITY:
 *  - All DOM writes use textContent / setAttribute (never innerHTML with external data)
 *  - Tab origin is read from chrome.tabs API, not from the page
 *  - Permission requests triggered only by direct user click (satisfies user activation requirement)
 */

'use strict';

// ─── Status messages ──────────────────────────────────────────────────────────

const STATUS_MESSAGES = {
  open:             'Mini player is open',
  closed:           'Ready — click to open mini player',
  'no-video':       'No video found on this page',
  'not-ready':      'Video is still loading',
  'disabled-by-site': 'This site has disabled Picture-in-Picture',
  error:            'Could not open mini player — try clicking the video first',
  disabled:         'Extension is disabled on this tab',
  'not-supported':  'Picture-in-Picture is not supported in this browser',
  checking:         'Checking…',
  'site-not-enabled': 'Enable the extension on this site first',
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const statusDot   = document.getElementById('statusDot');
const statusText  = document.getElementById('statusText');
const btnOpenPip  = document.getElementById('btnOpenPip');
const btnLabel    = document.getElementById('btnLabel');
const toggleEnabled  = document.getElementById('toggleEnabled');
const toggleAutoPip  = document.getElementById('toggleAutoPip');
const siteSection    = document.getElementById('siteSection');
const siteDesc       = document.getElementById('siteDesc');
const btnEnableSite  = document.getElementById('btnEnableSite');

// ─── State ────────────────────────────────────────────────────────────────────

let activeTabId   = null;
let activeOrigin  = null; // e.g. "https://example.com"
let siteGranted   = false;
let isYouTube     = false;
let currentStatus = 'checking';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setStatus(key, dotClass) {
  currentStatus = key;
  // Use textContent — never interpolate page data
  statusText.textContent = STATUS_MESSAGES[key] ?? key;
  statusDot.className = 'status-dot ' + (dotClass ?? '');
}

function isContentScriptPage(url) {
  if (!url) return false;
  return url.startsWith('https://') || url.startsWith('http://localhost');
}

// ─── Initialisation ───────────────────────────────────────────────────────────

async function init() {
  setStatus('checking');

  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  activeTabId = tab.id;

  try {
    const url = new URL(tab.url);
    activeOrigin = url.origin; // "https://www.youtube.com"
    isYouTube = url.hostname === 'www.youtube.com';
  } catch {
    activeOrigin = null;
  }

  // Load settings from background
  let settings = { enabled: true, autoPip: false };
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (resp && typeof resp.enabled === 'boolean') settings = resp;
  } catch { /* defaults */ }

  toggleEnabled.checked = settings.enabled;
  toggleAutoPip.checked = settings.autoPip;

  // Check if we have permission for the current site
  await updateSiteSection();

  // Get content script status
  if (isContentScriptPage(tab.url)) {
    try {
      const status = await chrome.tabs.sendMessage(activeTabId, { type: 'GET_STATUS' });
      if (status) applyContentStatus(status);
    } catch {
      if (isYouTube) {
        setStatus('closed', '');
      } else if (!siteGranted) {
        setStatus('site-not-enabled', 'warning');
      }
    }
  } else {
    setStatus('no-video');
    btnOpenPip.disabled = true;
  }
}

function applyContentStatus(status) {
  if (!status.enabled) {
    setStatus('disabled');
    return;
  }
  if (!status.hasVideo) {
    setStatus('no-video');
    return;
  }
  if (status.inPip) {
    setStatus('open', 'open');
    btnLabel.textContent = 'Close mini player';
  } else {
    setStatus('closed', '');
    btnLabel.textContent = 'Open mini player';
  }
}

async function updateSiteSection() {
  if (!activeOrigin) {
    siteSection.hidden = true;
    return;
  }

  if (isYouTube) {
    // YouTube is always enabled — hide per-site section
    siteSection.hidden = true;
    siteGranted = true;
    return;
  }

  // Check optional permission
  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'GET_PERMISSION_STATUS',
      origin: activeOrigin + '/*',
    });
    siteGranted = resp?.granted ?? false;
  } catch {
    siteGranted = false;
  }

  if (siteGranted) {
    siteSection.hidden = true;
  } else {
    siteSection.hidden = false;
    // Use textContent — activeOrigin comes from chrome.tabs API (trusted)
    siteDesc.textContent = 'This site is not enabled. Click below to allow the mini player here.';
    btnEnableSite.textContent = 'Enable on this site';
  }
}

// ─── Event handlers ───────────────────────────────────────────────────────────

btnOpenPip.addEventListener('click', async () => {
  if (!activeTabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      func: () => {
        if (typeof window.__vibeTogglePip === 'function') {
          window.__vibeTogglePip();
          return;
        }
        const video = document.querySelector('#movie_player video, video.html5-main-video, video.video-stream') || document.querySelector('video');
        if (!video) return;
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture().catch(() => {});
        } else {
          video.requestPictureInPicture().catch(() => {});
        }
      },
    });
    window.close();
  } catch {
    setStatus('error', 'error');
  }
});

toggleEnabled.addEventListener('change', async () => {
  const enabled = toggleEnabled.checked;
  try {
    await chrome.runtime.sendMessage({ type: 'SET_SETTINGS', enabled });
    if (!enabled && activeTabId) {
      await chrome.tabs.sendMessage(activeTabId, { type: 'DISABLE' }).catch(() => {});
    }
    setStatus(enabled ? 'closed' : 'disabled');
  } catch { /* ignore */ }
});

toggleAutoPip.addEventListener('change', async () => {
  try {
    await chrome.runtime.sendMessage({ type: 'SET_SETTINGS', autoPip: toggleAutoPip.checked });
  } catch { /* ignore */ }
});

btnEnableSite.addEventListener('click', async () => {
  if (!activeOrigin) return;
  btnEnableSite.disabled = true;
  btnEnableSite.textContent = 'Requesting permission…';
  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'REQUEST_PERMISSION',
      origin: activeOrigin + '/*',
    });
    if (resp?.granted) {
      siteGranted = true;
      siteSection.hidden = true;
      setStatus('closed', '');
    } else {
      btnEnableSite.disabled = false;
      btnEnableSite.textContent = 'Enable on this site';
      setStatus('site-not-enabled', 'warning');
    }
  } catch {
    btnEnableSite.disabled = false;
    btnEnableSite.textContent = 'Enable on this site';
  }
});

// Listen for status updates from content script
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'STATUS_UPDATE') return;
  const status = message.status;
  const dotClass = status === 'open' ? 'open' : status === 'error' ? 'error' : '';
  setStatus(status, dotClass);
  if (status === 'open') {
    btnLabel.textContent = 'Close mini player';
  } else {
    btnLabel.textContent = 'Open mini player';
  }
});

// Prevent navigation to chrome:// from shortcut link (it would be blocked anyway)
document.getElementById('shortcutLink')?.addEventListener('click', (e) => {
  e.preventDefault();
  // Open in a new tab via chrome.tabs — the only way from a popup
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

init();

