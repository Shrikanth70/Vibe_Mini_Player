/**
 * tests/unit/message-validation.test.js
 *
 * Tests for message schema validation in background.js.
 * Mirrors the isValidMessage and handleMessage routing logic.
 */

'use strict';

// ─── Extracted logic (mirrors background.js) ──────────────────────────────────

const EXTENSION_ID = 'test-extension-id';

const VALID_TYPES = new Set([
  'GET_SETTINGS',
  'SET_SETTINGS',
  'REQUEST_PERMISSION',
  'GET_PERMISSION_STATUS',
]);

function isValidMessage(message, sender) {
  if (!message || typeof message.type !== 'string') return false;
  if (!VALID_TYPES.has(message.type)) return false;
  if (sender.id !== EXTENSION_ID) return false;
  return true;
}

const VALID_CONTENT_TYPES = new Set([
  'TOGGLE_PIP', 'OPEN_PIP', 'SETTINGS_CHANGED', 'DISABLE', 'GET_STATUS',
]);

function isValidContentMessage(message, sender) {
  if (!message || typeof message.type !== 'string') return false;
  if (!VALID_CONTENT_TYPES.has(message.type)) return false;
  if (sender.id !== EXTENSION_ID) return false;
  return true;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const VALID_SENDER = { id: EXTENSION_ID };
const FOREIGN_SENDER = { id: 'malicious-extension-id' };

describe('isValidMessage (background)', () => {
  test('accepts GET_SETTINGS from own extension', () => {
    expect(isValidMessage({ type: 'GET_SETTINGS' }, VALID_SENDER)).toBe(true);
  });

  test('accepts SET_SETTINGS from own extension', () => {
    expect(isValidMessage({ type: 'SET_SETTINGS', enabled: false }, VALID_SENDER)).toBe(true);
  });

  test('accepts REQUEST_PERMISSION from own extension', () => {
    expect(isValidMessage({ type: 'REQUEST_PERMISSION', origin: 'https://example.com/*' }, VALID_SENDER)).toBe(true);
  });

  test('accepts GET_PERMISSION_STATUS from own extension', () => {
    expect(isValidMessage({ type: 'GET_PERMISSION_STATUS', origin: 'https://x.com/*' }, VALID_SENDER)).toBe(true);
  });

  test('rejects message from foreign extension', () => {
    expect(isValidMessage({ type: 'GET_SETTINGS' }, FOREIGN_SENDER)).toBe(false);
  });

  test('rejects unknown message type', () => {
    expect(isValidMessage({ type: 'INJECT_EVIL' }, VALID_SENDER)).toBe(false);
  });

  test('rejects null message', () => {
    expect(isValidMessage(null, VALID_SENDER)).toBe(false);
  });

  test('rejects message with non-string type', () => {
    expect(isValidMessage({ type: 42 }, VALID_SENDER)).toBe(false);
  });

  test('rejects message with no type field', () => {
    expect(isValidMessage({ action: 'GET_SETTINGS' }, VALID_SENDER)).toBe(false);
  });
});

describe('isValidContentMessage (content script)', () => {
  test('accepts TOGGLE_PIP from own extension', () => {
    expect(isValidContentMessage({ type: 'TOGGLE_PIP' }, VALID_SENDER)).toBe(true);
  });

  test('accepts DISABLE from own extension', () => {
    expect(isValidContentMessage({ type: 'DISABLE' }, VALID_SENDER)).toBe(true);
  });

  test('rejects page-originated message (no id match)', () => {
    expect(isValidContentMessage({ type: 'TOGGLE_PIP' }, { id: 'webpage' })).toBe(false);
  });

  test('rejects STATUS_UPDATE (not a valid content-inbound type)', () => {
    expect(isValidContentMessage({ type: 'STATUS_UPDATE' }, VALID_SENDER)).toBe(false);
  });

  test('rejects EVIL_CMD', () => {
    expect(isValidContentMessage({ type: 'EVIL_CMD' }, VALID_SENDER)).toBe(false);
  });
});

