/**
 * content/pip.js — Vibe Mini Player content script
 *
 * Runs in the ISOLATED world (default).
 *
 * Responsibilities:
 *  - Find the main playing video on the page
 *  - Open / close native PiP (video.requestPictureInPicture)
 *  - Register Media Session controls (seek, enterpictureinpicture best-effort)
 *  - Attach / detach on YouTube SPA navigation (yt-navigate-finish)
 *  - Render an optional in-page button (closed Shadow DOM)
 *  - Tear down cleanly when disabled
 *
 * ISOLATED WORLD NOTE:
 *  navigator.mediaSession handlers set here share the mediaSession object with
 *  the page but YouTube's main-world scripts may overwrite our
 *  'enterpictureinpicture' handler. This is a known limit documented in
 *  docs/KNOWN_LIMITS.md. The manual button and keyboard shortcut are the
 *  guaranteed PiP path on YouTube.
 *
 * SECURITY:
 *  - All DOM writes use textContent / DOM API (never innerHTML with page data)
 *  - Injected UI lives in a closed Shadow DOM
 *  - chrome.runtime.sendMessage is used only for extension-internal comms
 *  - window.postMessage from the page is never trusted for privileged actions
 */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  enabled: true,
  autoPip: false,
  pipSize: { width: 480, height: 270 },
  attached: false,       // Are our listeners on the current video?
  currentVideo: null,    // The <video> element we last attached to
  inPageButton: null,    // Shadow host element for the in-page button
  shadowRoot: null,      // Closed shadow root
  ytNavListener: null,   // yt-navigate-finish listener reference
  mutationObserver: null,// MutationObserver for non-YouTube SPA fallback
};

// ─── Main video selection ─────────────────────────────────────────────────────

/**
 * Find the best candidate <video> element to open PiP for.
 * Priority: largest visible, currently playing, not muted-autoplay-tiny.
 * @returns {HTMLVideoElement|null}
 */
function findMainVideo() {
  // On YouTube, prioritize the primary watch player video
  if (typeof location !== 'undefined' && location.hostname.endsWith('youtube.com')) {
    const ytVideo = document.querySelector('#movie_player video, video.html5-main-video, video.video-stream');
    if (ytVideo && !ytVideo.disablePictureInPicture && ytVideo.readyState >= 1) {
      return ytVideo;
    }
  }

  const videos = Array.from(document.querySelectorAll('video'));
  let bestPlaying = null;
  let bestPlayingArea = 0;
  let bestFallback = null;
  let bestFallbackArea = 0;

  for (const v of videos) {
    if (v.disablePictureInPicture) continue;
    if (v.readyState < 1) continue; // No metadata yet

    const rect = v.getBoundingClientRect();
    const area = rect.width * rect.height;

    // Exclude tiny autoplay muted previews
    if (area < 200 * 150 && v.muted) continue;

    const isPlaying = !v.paused && !v.ended;
    if (isPlaying) {
      if (area > bestPlayingArea) {
        bestPlaying = v;
        bestPlayingArea = area;
      }
    } else {
      if (area > bestFallbackArea) {
        bestFallback = v;
        bestFallbackArea = area;
      }
    }
  }

  return bestPlaying || bestFallback;
}

// ─── PiP control ─────────────────────────────────────────────────────────────

/**
 * Open Picture-in-Picture for the given video.
 * Does NOT pass preferInitialWindowPlacement — browser remembers position.
 * @param {HTMLVideoElement} video
 * @returns {Promise<void>}
 */
async function openMini(video) {
  if (!video) {
    updateStatus('no-video');
    return;
  }
  if (video.readyState === 0) {
    updateStatus('not-ready');
    return;
  }
  // Clear disablePictureInPicture if present so playback is not blocked
  if (video.disablePictureInPicture) {
    try { video.disablePictureInPicture = false; } catch { /* ignore */ }
  }
  // If already in PiP, exit (toggle behaviour).
  if (document.pictureInPictureElement === video) {
    document.exitPictureInPicture().catch(() => {});
    return;
  }
  // If a different video is in PiP, close it without awaiting to avoid losing transient user activation.
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(() => {});
  }
  try {
    const promise = video.requestPictureInPicture();
    if (promise && typeof promise.then === 'function') {
      promise
        .then(() => updateStatus('open'))
        .catch((err) => {
          console.warn('[VibeMiniPlayer] requestPictureInPicture failed:', err?.message || err?.name || err);
          updateStatus('error');
        });
    }
  } catch (err) {
    // Log complete error details to extension console for clear diagnostics
    console.warn('[VibeMiniPlayer] requestPictureInPicture failed:', err?.message || err?.name || err);
    updateStatus('error');
  }
}

/**
 * Toggle PiP: open if not in PiP, close if already in PiP.
 */
async function togglePip() {
  if (!state.enabled) return;
  const video = findMainVideo();
  await openMini(video);
}

// Expose on window object in content script isolated scope for direct execution via scripting API
window.__vibeTogglePip = togglePip;

// ─── Media Session controls ───────────────────────────────────────────────────

/**
 * Register Media Session action handlers on the current video.
 * Wrapped in try/catch — unsupported actions throw on some browsers.
 * @param {HTMLVideoElement} video
 */
function registerMediaSessionControls(video) {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;

  const safe = (action, fn) => {
    try { ms.setActionHandler(action, fn); } catch { /* unsupported or blocked */ }
  };

  // Auto-PiP: browser fires this when user switches tabs (Chrome 134+, best-effort)
  safe('enterpictureinpicture', () => openMini(video));

  // Seek controls shown in the PiP window
  safe('seekbackward', () => {
    video.currentTime = Math.max(0, video.currentTime - 10);
  });
  safe('seekforward', () => {
    video.currentTime = Math.min(video.duration ?? Infinity, video.currentTime + 10);
  });
}

/**
 * Clear Media Session handlers we registered.
 */
function clearMediaSessionControls() {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  const safe = (action) => {
    try { ms.setActionHandler(action, null); } catch { /* ignore */ }
  };
  safe('enterpictureinpicture');
  safe('seekbackward');
  safe('seekforward');
}

// ─── Attachment to a video element ───────────────────────────────────────────

/**
 * Detach listeners from the previous video, then attach to the new one.
 * Idempotent — safe to call multiple times.
 * @param {HTMLVideoElement|null} video
 */
function attachToVideo(video) {
  if (state.currentVideo === video && state.attached) return;

  detachFromCurrentVideo();

  if (!video) {
    state.attached = false;
    state.currentVideo = null;
    return;
  }

  state.currentVideo = video;
  state.attached = true;

  registerMediaSessionControls(video);
}

/**
 * Remove our listeners from the current video.
 */
function detachFromCurrentVideo() {
  if (!state.attached) return;
  clearMediaSessionControls();
  state.attached = false;
  state.currentVideo = null;
}

// ─── SPA re-attachment (YouTube) ─────────────────────────────────────────────

/**
 * Called on every YouTube SPA navigation (yt-navigate-finish).
 * Finds the new video and re-attaches.
 */
function onYouTubeNavigate() {
  // Small delay to let the player DOM settle after navigation
  setTimeout(() => {
    const video = findMainVideo();
    attachToVideo(video);
    renderInPageButton();
  }, 500);
}

/**
 * Start watching for YouTube SPA navigation events.
 */
function startYouTubeNavigationWatcher() {
  if (state.ytNavListener) return;
  state.ytNavListener = onYouTubeNavigate;
  document.addEventListener('yt-navigate-finish', state.ytNavListener);

  // Fallback: MutationObserver on the player container
  const playerContainer = document.getElementById('movie_player');
  if (playerContainer && !state.mutationObserver) {
    state.mutationObserver = new MutationObserver(() => {
      const video = findMainVideo();
      if (video && video !== state.currentVideo) {
        attachToVideo(video);
      }
    });
    state.mutationObserver.observe(playerContainer, { childList: true, subtree: true });
  }
}

/**
 * Stop watching YouTube navigation.
 */
function stopYouTubeNavigationWatcher() {
  if (state.ytNavListener) {
    document.removeEventListener('yt-navigate-finish', state.ytNavListener);
    state.ytNavListener = null;
  }
  if (state.mutationObserver) {
    state.mutationObserver.disconnect();
    state.mutationObserver = null;
  }
}

// ─── In-page button (closed Shadow DOM) ──────────────────────────────────────

/**
 * Render (or update) an in-page toggle button inside a closed Shadow DOM.
 * The button is appended to document.body so it is unaffected by page layout.
 */
function renderInPageButton() {
  if (!state.enabled) {
    removeInPageButton();
    return;
  }

  // Create host element once
  if (!state.inPageButton) {
    const host = document.createElement('div');
    host.id = 'vibe-pip-host';
    // Closed shadow DOM — page JS cannot access it
    const shadow = host.attachShadow({ mode: 'closed' });
    state.shadowRoot = shadow;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    // Styles are injected via manifest content_scripts css entry, but Shadow DOM
    // needs its own sheet. We rebuild styles inline here using safe DOM API.
    shadow.appendChild(buildButtonStyles());
    shadow.appendChild(buildButton());

    document.body.appendChild(host);
    state.inPageButton = host;
  }
}

/**
 * Build the <style> element for the shadow DOM.
 * All values are literals — no page data interpolated.
 */
function buildButtonStyles() {
  const style = document.createElement('style');
  // Using textContent to set CSS — safe; not affected by page CSP for shadow DOM
  style.textContent = `
    :host { position: fixed; bottom: 20px; right: 20px; z-index: 2147483647; }
    button {
      width: 40px; height: 40px;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.3);
      background: rgba(24,24,24,0.85);
      backdrop-filter: blur(8px);
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, transform 0.1s;
      padding: 0;
    }
    button:hover { background: rgba(60,60,60,0.95); transform: scale(1.08); }
    button:focus-visible {
      outline: 2px solid #4a90e8;
      outline-offset: 2px;
    }
    svg { width: 20px; height: 20px; fill: none; stroke: #fff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    @media (prefers-color-scheme: light) {
      button { background: rgba(240,240,240,0.9); border-color: rgba(0,0,0,0.2); }
      button:hover { background: rgba(220,220,220,0.95); }
      svg { stroke: #222; }
    }
    @media (prefers-reduced-motion: reduce) {
      button { transition: none; }
    }
  `;
  return style;
}

/**
 * Build the PiP toggle <button> element.
 */
function buildButton() {
  const btn = document.createElement('button');
  btn.setAttribute('aria-label', 'Toggle mini player');
  btn.setAttribute('aria-pressed', 'false');
  btn.setAttribute('title', 'Vibe Mini Player — Toggle (Alt+L)');
  btn.setAttribute('type', 'button');

  // SVG icon: picture-in-picture symbol (built via DOM API — no innerHTML)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');

  const rect1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect1.setAttribute('x', '2'); rect1.setAttribute('y', '3');
  rect1.setAttribute('width', '20'); rect1.setAttribute('height', '14');
  rect1.setAttribute('rx', '2');

  const rect2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect2.setAttribute('x', '13'); rect2.setAttribute('y', '11');
  rect2.setAttribute('width', '8'); rect2.setAttribute('height', '5');
  rect2.setAttribute('rx', '1');

  svg.appendChild(rect1);
  svg.appendChild(rect2);
  btn.appendChild(svg);

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const video = findMainVideo();
    await openMini(video);
    // Update aria-pressed to reflect PiP state
    btn.setAttribute('aria-pressed', document.pictureInPictureElement ? 'true' : 'false');
  });

  return btn;
}

/**
 * Remove the in-page button and clean up.
 */
function removeInPageButton() {
  if (state.inPageButton) {
    state.inPageButton.remove();
    state.inPageButton = null;
    state.shadowRoot = null;
  }
}

// ─── Status communication ─────────────────────────────────────────────────────

/**
 * Send a status update to the popup (if open).
 * Statuses: 'open', 'closed', 'no-video', 'not-ready', 'disabled-by-site', 'error', 'disabled'
 * @param {string} status
 */
function updateStatus(status) {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;
  try {
    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status }).catch(() => {
      // Popup may not be open or context closed; ignore safely.
    });
  } catch {
    // Context invalidated (e.g. extension was reloaded in developer mode); ignore safely.
  }
}

// ─── Settings application ─────────────────────────────────────────────────────

/**
 * Apply settings to the current content script state.
 * @param {object} settings
 */
function applySettings(settings) {
  state.enabled = settings.enabled ?? true;
  state.autoPip = settings.autoPip ?? false;
  state.pipSize = settings.pipSize ?? { width: 480, height: 270 };

  if (!state.enabled) {
    tearDown();
  } else {
    renderInPageButton();
    const video = findMainVideo();
    attachToVideo(video);
  }
}

// ─── Tear down (clean off switch — Feature 8) ─────────────────────────────────

/**
 * Full teardown: remove all listeners, close PiP if open, remove UI.
 * Called when the extension is disabled.
 */
async function tearDown() {
  stopYouTubeNavigationWatcher();
  detachFromCurrentVideo();
  removeInPageButton();

  if (document.pictureInPictureElement) {
    try { await document.exitPictureInPicture(); } catch { /* ignore */ }
  }

  updateStatus('disabled');
}

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only trust messages from our own extension.
  if (!message || sender.id !== chrome.runtime.id) return false;

  const validContentTypes = new Set(['TOGGLE_PIP', 'OPEN_PIP', 'SETTINGS_CHANGED', 'DISABLE', 'GET_STATUS']);
  if (!validContentTypes.has(message.type)) return false;

  handleContentMessage(message).then(sendResponse).catch(() => sendResponse({ error: 'failed' }));
  return true;
});

async function handleContentMessage(message) {
  switch (message.type) {
    case 'TOGGLE_PIP':
    case 'OPEN_PIP':
      await togglePip();
      return { ok: true };

    case 'SETTINGS_CHANGED':
      applySettings(message.settings);
      return { ok: true };

    case 'DISABLE':
      state.enabled = false;
      await tearDown();
      return { ok: true };

    case 'GET_STATUS':
      return {
        enabled: state.enabled,
        autoPip: state.autoPip,
        inPip: !!document.pictureInPictureElement,
        hasVideo: !!findMainVideo(),
      };

    default:
      return {};
  }
}

// ─── Direct In-Page Keyboard Shortcut (Alt+L) ────────────────────────────────

function setupKeyboardShortcut() {
  window.addEventListener('keydown', (e) => {
    if (!state.enabled) return;
    // Intercept Alt+L
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'l' || e.key === 'L' || e.code === 'KeyL')) {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
        return; // Don't interrupt if user is typing
      }
      e.preventDefault();
      e.stopPropagation();
      const video = findMainVideo();
      if (video) {
        openMini(video);
      }
    }
  }, true); // Capture phase ensures we receive the trusted event before site handlers
}

// ─── Initialisation ───────────────────────────────────────────────────────────

async function init() {
  // Fetch settings from storage via background
  let settings = { ...state };
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (response && typeof response.enabled === 'boolean') {
        settings = response;
      }
    } catch { /* background not ready or context invalidated */ }
  }

  applySettings(settings);

  // Setup direct DOM keyboard shortcut
  setupKeyboardShortcut();

  // YouTube SPA watcher
  const isYouTube = location.hostname === 'www.youtube.com';
  if (isYouTube) {
    startYouTubeNavigationWatcher();
  }

  // Initial video attach
  const video = findMainVideo();
  attachToVideo(video);
}

init();

