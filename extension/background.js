/**
 * background.js — Vibe Mini Player service worker
 *
 * Responsibilities:
 *  - Route the keyboard command to the active tab's content script
 *  - Handle per-site permission requests (from popup)
 *  - Inject the content script into newly-permitted tabs
 *  - Broker storage reads/writes for popup ↔ content script
 *
 * IMPORTANT: This is a service worker. It has no DOM and no user activation.
 * It must NEVER call video.requestPictureInPicture() or any DOM API.
 * All PiP logic lives in content/pip.js.
 *
 * State: treat the service worker as stateless — it is killed after idle.
 * All persistent state lives in chrome.storage.local.
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const EXTENSION_ID = chrome.runtime.id;

/** Default settings. Applied when storage is missing or corrupt. */
const DEFAULT_SETTINGS = {
  schemaVersion: 1,
  enabled: true,
  autoPip: false,
  pipSize: { width: 480, height: 270 },
};

// ─── Storage helpers ──────────────────────────────────────────────────────────

/**
 * Read settings from storage, applying defaults on missing/corrupt fields.
 * @returns {Promise<object>}
 */
async function readSettings() {
  try {
    const raw = await chrome.storage.local.get(null);
    if (!raw || typeof raw.schemaVersion !== 'number') {
      return { ...DEFAULT_SETTINGS };
    }
    return {
      schemaVersion: raw.schemaVersion ?? DEFAULT_SETTINGS.schemaVersion,
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_SETTINGS.enabled,
      autoPip: typeof raw.autoPip === 'boolean' ? raw.autoPip : DEFAULT_SETTINGS.autoPip,
      pipSize: validatePipSize(raw.pipSize),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Validate and clamp pipSize. Returns default if invalid.
 * @param {any} size
 * @returns {{width: number, height: number}}
 */
function validatePipSize(size) {
  if (
    size &&
    typeof size.width === 'number' &&
    typeof size.height === 'number' &&
    size.width >= 160 && size.width <= 1920 &&
    size.height >= 90 && size.height <= 1080
  ) {
    return { width: Math.round(size.width), height: Math.round(size.height) };
  }
  return { ...DEFAULT_SETTINGS.pipSize };
}

// ─── Message validation ───────────────────────────────────────────────────────

/**
 * Valid message types accepted by the background.
 * All other types are silently dropped.
 */
const VALID_TYPES = new Set([
  'GET_SETTINGS',
  'SET_SETTINGS',
  'REQUEST_PERMISSION',
  'GET_PERMISSION_STATUS',
]);

/**
 * Validate an incoming message object.
 * Returns true only if it looks like a message from our own extension.
 * @param {any} message
 * @param {chrome.runtime.MessageSender} sender
 */
function isValidMessage(message, sender) {
  if (!message || typeof message.type !== 'string') return false;
  if (!VALID_TYPES.has(message.type)) return false;
  // Must come from our own extension (popup, options, content script)
  if (sender.id !== EXTENSION_ID) return false;
  return true;
}

// Shortcuts are handled via native in-page capture-phase keydown (Alt+L) in content/pip.js

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isValidMessage(message, sender)) {
    // Drop unknown/invalid messages silently.
    return false;
  }

  handleMessage(message, sender).then(sendResponse).catch((err) => {
    sendResponse({ error: err?.message ?? 'Unknown error' });
  });

  // Return true to keep the message channel open for async sendResponse.
  return true;
});

/**
 * @param {object} message
 * @param {chrome.runtime.MessageSender} sender
 * @returns {Promise<any>}
 */
async function handleMessage(message, sender) {
  switch (message.type) {
    case 'GET_SETTINGS':
      return readSettings();

    case 'SET_SETTINGS': {
      const current = await readSettings();
      const updated = {
        ...current,
        ...(typeof message.enabled === 'boolean' && { enabled: message.enabled }),
        ...(typeof message.autoPip === 'boolean' && { autoPip: message.autoPip }),
        ...(message.pipSize && { pipSize: validatePipSize(message.pipSize) }),
      };
      await chrome.storage.local.set(updated);
      // Notify content scripts in all YouTube tabs about the new settings.
      await broadcastToContentScripts({ type: 'SETTINGS_CHANGED', settings: updated });
      return { ok: true };
    }

    case 'REQUEST_PERMISSION': {
      const origin = message.origin;
      if (!origin || typeof origin !== 'string') return { granted: false };
      // Permission requests must originate from a popup/action page (not a content script).
      // The popup sends this; it has user activation from the button click.
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (granted) {
        // Inject content script into matching tabs that are already open.
        await injectIntoMatchingTabs(origin);
      }
      return { granted };
    }

    case 'GET_PERMISSION_STATUS': {
      const origin = message.origin;
      if (!origin || typeof origin !== 'string') return { granted: false };
      const result = await chrome.permissions.contains({ origins: [origin] });
      return { granted: result };
    }

    default:
      return {};
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Broadcast a message to all content scripts in tabs matching YouTube
 * or any tab where we have optional permission and the content script is running.
 */
async function broadcastToContentScripts(message) {
  const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      // Tab may not have the content script yet; ignore.
    }
  }
}

/**
 * After granting optional permission for an origin, inject the content script
 * into any already-open tabs matching that origin.
 * @param {string} origin  e.g. "https://example.com/*"
 */
async function injectIntoMatchingTabs(origin) {
  let pattern = origin;
  // Ensure the pattern ends with /* for tab matching
  if (!pattern.endsWith('/*') && !pattern.endsWith('/')) {
    pattern = pattern.replace(/\/?$/, '/*');
  }
  try {
    const tabs = await chrome.tabs.query({ url: pattern });
    for (const tab of tabs) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/pip.js'],
        });
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content/ui.css'],
        });
      } catch {
        // Tab may have already injected, or be a privileged page; ignore.
      }
    }
  } catch {
    // Ignore query errors.
  }
}

// ─── Installation / update ────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    // Initialise storage with defaults on first install.
    const current = await chrome.storage.local.get('schemaVersion');
    if (!current.schemaVersion) {
      await chrome.storage.local.set({ ...DEFAULT_SETTINGS });
    }
  }
});

