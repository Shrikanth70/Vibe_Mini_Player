const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function capture() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });

  const page = await browser.newPage({
    viewport: { width: 900, height: 520 },
    deviceScaleFactor: 2, // 2x Retina for crisp text
  });

  const svgPath = 'file://' + path.resolve(__dirname, '../assets/preview.svg').replace(/\\/g, '/');
  console.log('Loading:', svgPath);
  await page.goto(svgPath, { waitUntil: 'networkidle' });

  const outPath = path.resolve(__dirname, '../assets/preview.png');
  await page.screenshot({ path: outPath, type: 'png' });
  console.log('Saved screenshot to:', outPath);

  await browser.close();
}

capture().catch(console.error);

