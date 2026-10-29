<div align="center">

<img src="extension/icons/icon128.png" alt="Vibe Mini Player Logo" width="96" height="96" style="border-radius: 20px; box-shadow: 0 10px 30px rgba(74, 144, 232, 0.4);" />

# 🎬 Vibe Mini Player
### *Keep your stream visible over your IDE while AI agents write code.*

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4a90e8?style=for-the-badge&logo=googlechrome&logoColor=white)](extension/manifest.json)
[![Chrome 130+](https://img.shields.io/badge/Chromium-130+-00C853?style=for-the-badge&logo=googlechrome&logoColor=white)](https://www.google.com/chrome/)
[![Privacy: 0% Telemetry](https://img.shields.io/badge/Privacy-100%25_Offline-blueviolet?style=for-the-badge&logo=securityscorecard&logoColor=white)](docs/PRIVACY.md)
[![A11y: WCAG AA](https://img.shields.io/badge/Accessibility-WCAG_2.1_AA-ff6f00?style=for-the-badge)](docs/UX_CRITIQUE.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-gray?style=for-the-badge)](LICENSE)

<br/>

> **The Problem:** You’re watching YouTube tutorials, conference talks, or lofi music while an AI agent (Claude Code, Antigravity, Cursor) works inside your IDE. Every time you switch to the terminal or minimize Chrome, your video vanishes behind windows.  
> 
> **The Solution:** **Vibe Mini Player** pops out the video into an always-on-top native OS Picture-in-Picture window. It floats freely over every app, remembers where you put it, and never drops playback.

<br/>

[✨ Features](#-superpowers) • [⚡ Quick Start](#-quick-start) • [⌨️ Shortcuts](#️-shortcuts) • [🔒 Zero-Trust Privacy](#-zero-trust-privacy) • [📦 Installation](#-installation)

---

</div>

<br/>

## 🖥️ The Workflow Experience

<div align="center">

<!-- Visual Graphic Mockup -->
<img src="assets/preview.svg" alt="Vibe Mini Player Live Preview — Always on top of IDE" width="100%" style="border-radius: 12px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);" />

<br/><br/>

👉 **[🎮 Open the Interactive Live Simulator](assets/showcase.html)**  
*(Test dragging the mini player around the screen directly in your browser!)*

</div>

<br/>

```text
 ┌────────────────────────────────────────────────────────┐
 │ VS Code / Terminal / IDE Window                        │
 │                                                        │
 │  $ claude "refactor auth microservice and run tests"   │
 │  [Thinking...] Processing codebase AST...              │
 │  [Executing] Writing auth.service.ts...                │
 │                                  ┌───────────────────┐ │
 │  You are reviewing code here...  │ 📺 YOUTUBE STREAM │ │
 │                                  │ Always on top of  │ │
 │                                  │ IDE & terminal!   │ │
 │                                  │ [Alt + L to togg] │ │
 │                                  └───────────────────┘ │
 └────────────────────────────────────────────────────────┘
```

<br/>

## ⚡ Superpowers

<table>
  <tr>
    <td width="50%">
      <h3>📌 Always-On-Top Mini Screen</h3>
      <p>Uses Chromium's native OS-level Picture-in-Picture engine. Unlike in-page floating DIVs, this window hovers over VS Code, Discord, terminal, and all desktop applications.</p>
    </td>
    <td width="50%">
      <h3>🎯 Memory of Position & Size</h3>
      <p>Drag the player to your preferred screen corner. Chromium automatically remembers your dragged position and dimensions without resetting on reopen.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>⚡ Instant Shortcut: <code>Alt + L</code></h3>
      <p>A native, capture-phase in-page listener pops out the active stream the instant you press <code>Alt + L</code>. No clicking away from your workflow required.</p>
    </td>
    <td width="50%">
      <h3>🔄 YouTube SPA Resilience</h3>
      <p>Navigating between videos without refreshing? Vibe hooks into <code>yt-navigate-finish</code> and mutation observers to seamlessly re-bind to new videos.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🛡️ Zero Telemetry, 100% Offline</h3>
      <p>Zero tracking, zero analytics, zero external network requests. Verified with static security grep gates. What you watch never leaves your local browser profile.</p>
    </td>
    <td width="50%">
      <h3>🌐 Privacy-First Per-Site Opt-in</h3>
      <p>Active only on YouTube by default. Other video websites (Vimeo, Twitch, etc.) require an explicit single-click user permission grant.</p>
    </td>
  </tr>
</table>

<br/>

---

## ⌨️ Shortcuts & Controls

| Action | Shortcut / Method | Description |
|---|---|---|
| **Toggle Mini Player** | <kbd>Alt</kbd> + <kbd>L</kbd> | Instant in-page toggle while watching on YouTube |
| **In-Page Floating Button** | Click the floating icon in the bottom-right | Custom closed Shadow DOM button; immune to page CSS |
| **Toolbar Popup** | Click extension icon in toolbar | One-click trigger, status indicator & auto-PiP switch |
| **Seek Forward / Backward** | <kbd>Media Session</kbd> buttons in PiP | Scrub ±10s directly from the floating mini screen |

> 💡 *Want a different hotkey?* Open `chrome://extensions/shortcuts` anytime to customize the shortcut.

<br/>

---

## 📦 Installation

### Method 1: Load Unpacked (Instant Developer Mode)

1. Clone or download this repository:
   ```bash
   git clone https://github.com/Shrikanth70/Vibe_Mini_Player.git
   ```
2. Open Google Chrome or Microsoft Edge and navigate to:
   ```text
   chrome://extensions/
   ```
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the [`extension/`](extension/) directory.
5. Head to [YouTube](https://www.youtube.com), play any video, and press <kbd>Alt</kbd> + <kbd>L</kbd>!

<br/>

### Method 2: Packaged ZIP Release

Pre-built, zero-dependency distribution bundles are located in [`release/`](release/):
* 📦 **Download:** [`vibe-mini-player-v0.1.0.zip`](release/vibe-mini-player-v0.1.0.zip) (Only ~18 KB!)
* Contains pure production assets: no `node_modules`, no tests, no source maps.

<br/>

---

## 🏗️ Architecture & Security Blueprint

Vibe Mini Player is built strictly on **Chromium Manifest V3** with a zero-trust model:

```
extension/
├── manifest.json         # MV3 specification with minimal permissions & strict CSP
├── background.js         # Stateless background service worker (settings broker)
├── popup.html / js       # Accessible toolbar interface (WCAG 2.1 AA certified)
├── options.html / js     # Dimension preferences customizer
├── icons/                # High-DPI PNG app icons (16, 32, 48, 128px)
└── content/
    ├── pip.js            # Video selection heuristic, closed Shadow DOM, SPA watcher
    └── ui.css            # Base host element layout
```

### Verified Security Gates
```bash
# Verify zero secrets or tokens
npm run test:unit       # 52 / 52 Jest tests passing
node scripts/security-check.js  # Zero eval, zero innerHTML, zero network calls
```

<br/>

---

## 🤝 Contributing

Contributions, feature ideas, and pull requests are warmly welcomed!
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/amazing-feature`)
3. Commit your Changes (`git commit -m 'Add amazing feature'`)
4. Run tests: `npm test`
5. Push to the Branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

<br/>

---

<div align="center">

Crafted with care for developers who like to code to good vibes. 🎧✨  
Distributed under the **MIT License**.

</div>
