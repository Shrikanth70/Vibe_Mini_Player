const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function renderShowcase() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });

  const page = await browser.newPage({
    viewport: { width: 920, height: 600 },
    deviceScaleFactor: 2,
  });

  const showcasePath = 'file://' + path.resolve(__dirname, '../assets/showcase.html').replace(/\\/g, '/');
  console.log('Loading showcase:', showcasePath);
  await page.goto(showcasePath, { waitUntil: 'networkidle' });

  // Target the container card
  const container = page.locator('.max-w-2xl');
  const outPath = path.resolve(__dirname, '../assets/vibe-preview.png');
  await container.screenshot({ path: outPath });
  console.log('Saved high-res screenshot to:', outPath);

  // Also overwrite preview.png so both paths have the clean graphic
  fs.copyFileSync(outPath, path.resolve(__dirname, '../assets/preview.png'));

  await browser.close();
}

renderShowcase().catch(console.error);

