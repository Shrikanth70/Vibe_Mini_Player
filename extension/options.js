/**
 * options.js — Vibe Mini Player options page
 */
'use strict';

const pipWidthInput = document.getElementById('pipWidth');
const pipWidthVal   = document.getElementById('pipWidthVal');
const btnSave       = document.getElementById('btnSave');
const savedMsg      = document.getElementById('savedMsg');

async function load() {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (resp?.pipSize?.width) {
      const w = Math.min(960, Math.max(240, resp.pipSize.width));
      pipWidthInput.value = w;
      pipWidthVal.textContent = w + 'px';
      pipWidthInput.setAttribute('aria-valuenow', w);
    }
  } catch { /* defaults */ }
}

pipWidthInput.addEventListener('input', () => {
  const val = pipWidthInput.value;
  pipWidthVal.textContent = val + 'px';
  pipWidthInput.setAttribute('aria-valuenow', val);
});

btnSave.addEventListener('click', async () => {
  const width = parseInt(pipWidthInput.value, 10);
  // Derive 16:9 height from width
  const height = Math.round(width * 9 / 16);
  try {
    await chrome.runtime.sendMessage({ type: 'SET_SETTINGS', pipSize: { width, height } });
    savedMsg.style.display = 'inline';
    setTimeout(() => { savedMsg.style.display = 'none'; }, 2000);
  } catch { /* ignore */ }
});

load();

