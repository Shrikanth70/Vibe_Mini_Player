/**
 * tests/unit/storage-schema.test.js
 *
 * Tests for storage schema validation and defaults.
 * Mirrors the validatePipSize and readSettings logic in background.js.
 */

'use strict';

// ─── Extracted logic (mirrors background.js) ──────────────────────────────────

const DEFAULT_SETTINGS = {
  schemaVersion: 1,
  enabled: true,
  autoPip: false,
  pipSize: { width: 480, height: 270 },
};

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

function parseSettings(raw) {
  if (!raw || typeof raw.schemaVersion !== 'number') {
    return { ...DEFAULT_SETTINGS };
  }
  return {
    schemaVersion: raw.schemaVersion ?? DEFAULT_SETTINGS.schemaVersion,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_SETTINGS.enabled,
    autoPip: typeof raw.autoPip === 'boolean' ? raw.autoPip : DEFAULT_SETTINGS.autoPip,
    pipSize: validatePipSize(raw.pipSize),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('validatePipSize', () => {
  test('returns valid size unchanged (rounded)', () => {
    expect(validatePipSize({ width: 480, height: 270 })).toEqual({ width: 480, height: 270 });
  });

  test('rounds float values', () => {
    expect(validatePipSize({ width: 480.6, height: 270.4 })).toEqual({ width: 481, height: 270 });
  });

  test('returns default on null', () => {
    expect(validatePipSize(null)).toEqual(DEFAULT_SETTINGS.pipSize);
  });

  test('returns default on missing fields', () => {
    expect(validatePipSize({ width: 480 })).toEqual(DEFAULT_SETTINGS.pipSize);
  });

  test('returns default on string values', () => {
    expect(validatePipSize({ width: '480', height: '270' })).toEqual(DEFAULT_SETTINGS.pipSize);
  });

  test('returns default when width below minimum (160)', () => {
    expect(validatePipSize({ width: 100, height: 90 })).toEqual(DEFAULT_SETTINGS.pipSize);
  });

  test('returns default when width above maximum (1920)', () => {
    expect(validatePipSize({ width: 2000, height: 270 })).toEqual(DEFAULT_SETTINGS.pipSize);
  });

  test('returns default when height below minimum (90)', () => {
    expect(validatePipSize({ width: 480, height: 50 })).toEqual(DEFAULT_SETTINGS.pipSize);
  });

  test('returns default when height above maximum (1080)', () => {
    expect(validatePipSize({ width: 480, height: 1200 })).toEqual(DEFAULT_SETTINGS.pipSize);
  });

  test('accepts boundary values: 160x90', () => {
    expect(validatePipSize({ width: 160, height: 90 })).toEqual({ width: 160, height: 90 });
  });

  test('accepts boundary values: 1920x1080', () => {
    expect(validatePipSize({ width: 1920, height: 1080 })).toEqual({ width: 1920, height: 1080 });
  });
});

describe('parseSettings', () => {
  test('returns defaults on empty storage', () => {
    expect(parseSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  test('returns defaults on null', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  test('returns defaults on corrupt schemaVersion', () => {
    expect(parseSettings({ schemaVersion: 'bad' })).toEqual(DEFAULT_SETTINGS);
  });

  test('preserves valid settings', () => {
    const raw = { schemaVersion: 1, enabled: false, autoPip: true, pipSize: { width: 640, height: 360 } };
    const result = parseSettings(raw);
    expect(result.enabled).toBe(false);
    expect(result.autoPip).toBe(true);
    expect(result.pipSize).toEqual({ width: 640, height: 360 });
  });

  test('applies default for non-boolean enabled', () => {
    const raw = { schemaVersion: 1, enabled: 'yes', autoPip: false, pipSize: null };
    const result = parseSettings(raw);
    expect(result.enabled).toBe(true); // default
  });

  test('applies default for non-boolean autoPip', () => {
    const raw = { schemaVersion: 1, enabled: true, autoPip: 1, pipSize: null };
    const result = parseSettings(raw);
    expect(result.autoPip).toBe(false); // default
  });

  test('applies default pipSize on corrupt pipSize', () => {
    const raw = { schemaVersion: 1, enabled: true, autoPip: false, pipSize: { width: -1, height: -1 } };
    const result = parseSettings(raw);
    expect(result.pipSize).toEqual(DEFAULT_SETTINGS.pipSize);
  });
});

