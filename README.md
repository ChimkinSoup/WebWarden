# WebWarden

Chrome extension + Windows companion app that enforces category-based screentime limits, bedtime mode, and friction-based settings protection.

## Architecture

- **Chrome extension (MV3, Vanilla JS):** Service worker tracks active tab time, applies `declarativeNetRequest` blocking rules, and redirects blocked pages to an internal block page.
- **Windows companion (C++):** Native messaging host stores settings and analytics in `%APPDATA%/WebWarden/`, verifies system restarts via Windows uptime APIs.

```
extension/     Chrome MV3 extension
companion/     Windows C++ native messaging host
shared/        Protocol + JSON schemas
tests/         Vitest (extension) + GoogleTest (companion)
scripts/       Build and install helpers
```

## Prerequisites

- Google Chrome
- Node.js 18+
- CMake 3.16+
- **C++ toolchain (one of):**
  - Visual Studio Build Tools with "Desktop development with C++", or
  - MinGW-w64 (e.g. `C:\MinGW\bin\g++.exe`)

## Setup

### 1. Install dependencies

```bash
npm install
npm run generate:icons
```

### 2. Load the extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `extension/` folder
4. Copy the extension ID
5. Enable **Allow in incognito** (required for full functionality)

### 3. Build and install the companion

```bash
npm run build:companion
npm run install:native-host -- -ExtensionId YOUR_EXTENSION_ID
```

Or manually:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-native-host.ps1 -ExtensionId YOUR_EXTENSION_ID
```

### 4. Verify connection

Open the extension service worker console (`chrome://extensions` → WebWarden → Service worker). The companion should connect via native messaging on startup.

## Development

```bash
npm run test:ext          # Run extension unit tests
npm run test:ext:watch    # Watch mode
npm run build:companion   # Build C++ companion
```

Companion tests run via CMake after building:

```powershell
ctest --test-dir companion/build --output-on-failure
```

### Companion build troubleshooting

**Why `vcvars64.bat` didn't fix it:** In PowerShell, `& vcvars64.bat` runs in a child process — environment variables do not carry over to your current shell. Use `npm run build:companion` instead (it handles this automatically), or open **Developer PowerShell for VS**.

**Stale CMake cache:** If you previously ran plain `cmake` and got NMake errors, delete `companion/build/` and run `npm run build:companion` again.

The build script tries, in order:
1. Visual Studio 2022 generator (if registered with CMake)
2. MSVC via `vcvars64.bat` + NMake inside `cmd.exe`
3. MinGW at `C:\MinGW\bin\g++.exe`

## Features

- **Category-based time pools** — each category has independent daily limits
- **Blocklist / allowlist modes** — with preset auth domains in allowlist mode
- **Bedtime mode** — blocks all sites except productivity list; typing challenge for bonus time
- **Restart verification** — companion detects laptop restart via Windows uptime
- **Emergency pause** — 10 minutes once per day for one category
- **Settings lock** — after first save, edits require restart + 100-char typing challenge (site list additions always allowed)
- **Guard mode** — blocks tracked sites if incognito access disabled or companion unreachable

## Manual QA Checklist

See [tests/E2E_CHECKLIST.md](tests/E2E_CHECKLIST.md).

## Data storage

Companion stores JSON files in `%APPDATA%/WebWarden/`:

| File | Purpose |
|------|---------|
| `settings.json` | Full settings snapshot |
| `sessions.json` | Session log |
| `analytics.json` | Usage counters |
| `restart_token.json` | Last boot time for restart verification |

## Theme

Dark background (`#1a1a2e`) with blue accents (`#4a9eff`).
