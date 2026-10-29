/**
 * scripts/package.js — Build release zip for Vibe Mini Player
 *
 * Ensures:
 * - Only production extension files are included (manifest, background, content, popup, options, icons)
 * - Excludes tests, docs, node_modules, git, and dev scripts
 * - Produces clean release/vibe-mini-player-v0.1.0.zip
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const extDir = path.join(rootDir, 'extension');
const releaseDir = path.join(rootDir, 'release');
const zipFile = path.join(releaseDir, 'vibe-mini-player-v0.1.0.zip');

if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

// Ensure zip file is removed if already exists
if (fs.existsSync(zipFile)) {
  fs.unlinkSync(zipFile);
}

console.log('Packaging extension files from:', extDir);

// Verify manifest exists and is valid
const manifestPath = path.join(extDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('Missing manifest.json');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
console.log(`Building release: ${manifest.name} v${manifest.version}`);

// Verify required icons exist
const requiredIcons = ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png'];
for (const icon of requiredIcons) {
  const iconPath = path.join(extDir, 'icons', icon);
  if (!fs.existsSync(iconPath)) {
    console.error(`Missing icon: ${iconPath}`);
    process.exit(1);
  }
}

// Use PowerShell Compress-Archive on Windows
try {
  const psCmd = `powershell.exe -NoProfile -Command "Compress-Archive -Path '${extDir}\\*' -DestinationPath '${zipFile}' -Force"`;
  execSync(psCmd, { stdio: 'inherit' });
  const stat = fs.statSync(zipFile);
  console.log(`\nSUCCESS: Release package created!`);
  console.log(`Destination: ${zipFile}`);
  console.log(`Size: ${(stat.size / 1024).toFixed(2)} KB`);
} catch (err) {
  console.error('Failed to create zip package:', err);
  process.exit(1);
}

