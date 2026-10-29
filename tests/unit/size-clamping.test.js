/**
 * tests/unit/size-clamping.test.js
 *
 * Tests for pipSize clamping and options page logic.
 */

'use strict';

// ─── Extracted logic ──────────────────────────────────────────────────────────

const MIN_W = 240, MAX_W = 960;

/**
 * Clamp and derive pipSize from user-input width (options page).
 * Width in range [240, 960]; height derived as 16:9.
 */
function deriveSize(rawWidth) {
  const width = Math.min(MAX_W, Math.max(MIN_W, Math.round(rawWidth)));
  const height = Math.round(width * 9 / 16);
  return { width, height };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('deriveSize (options page)', () => {
  test('480 → 480x270 (16:9)', () => {
    expect(deriveSize(480)).toEqual({ width: 480, height: 270 });
  });

  test('640 → 640x360', () => {
    expect(deriveSize(640)).toEqual({ width: 640, height: 360 });
  });

  test('clamps below minimum to 240x135', () => {
    expect(deriveSize(0)).toEqual({ width: 240, height: 135 });
  });

  test('clamps above maximum to 960x540', () => {
    expect(deriveSize(9999)).toEqual({ width: 960, height: 540 });
  });

  test('boundary: exactly 240', () => {
    expect(deriveSize(240)).toEqual({ width: 240, height: 135 });
  });

  test('boundary: exactly 960', () => {
    expect(deriveSize(960)).toEqual({ width: 960, height: 540 });
  });

  test('rounds float input', () => {
    expect(deriveSize(481.7)).toEqual({ width: 482, height: 271 });
  });

  test('handles negative input (clamp to min)', () => {
    expect(deriveSize(-100)).toEqual({ width: 240, height: 135 });
  });
});

