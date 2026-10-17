# Kreis

**Kreis** is a keyboard-accessible radial launcher for Windows. Open it at the mouse cursor, select an application, folder, or browser tab, and get back to what you were doing.

Kreis lives in the system tray and is built with Tauri 2, Rust, React, and TypeScript. Browser-tab integration uses an optional unpacked Chromium extension. Kreis 0.12 supports configurable browser profiles for Vivaldi, Chrome, Edge, Brave, and Opera (the same Chromium extension APIs; test each browser on your PC).

> **Status:** Active development. The documentation below describes Kreis **0.12.1**. Planned changes are tracked in the [roadmap](ROADMAP.md).

## Features

- **Quick access:** Press `Ctrl+Space` to show a cursor-centered Kreis. If that hotkey is unavailable, Kreis tries `Ctrl+Alt+Space`. Change it under Settings → Hotkey.
- **Shortcuts:** Launch or focus running Windows applications, open folders in File Explorer, and open or focus matching tabs in paired Chromium browser profiles.
- **Groups:** Create nested groups to organize shortcuts into child Kreise. New Kreise support **up to 10 direct slices**; existing 11/12-slice layouts are preserved.
- **Choose the right window or tab:** If multiple application windows or browser tabs match, Kreis can display a selection Kreis. Browser matches can be narrowed by URL and an optional tab-title filter; app matches can use a window-title filter.
- **Move or rearrange:** Drag the **hub** to reposition the whole Kreis on-screen, or drag individual slices to reorder and group them. The center of a child Kreis also acts as a drop target to move a slice up one level. Changes can be undone.
- **Right-click actions:** Rename, change icon or color, move, duplicate, copy a target, or delete a slice without navigating to Settings. Group deletion preserves its contents by moving them to the parent, provided there is space.
- **Quick Keys:** Every slice up to the tenth displays a large translucent background numeral. Press **1–9** for slices 1–9, or **0** for slice 10, on the currently open Kreis. Numbers also work in nested groups and tab/window pickers.
- **Appearance:** Choose slice icons and colors, and adjust font and label sizes.
- **Optional context menus:** Add shortcuts from File Explorer folders, `.exe` files and `.lnk` shortcuts, or from webpage and link context menus in the companion browser extension.
- **Generic first run:** Starts with familiar websites, Downloads, and a sample nested Tools group. Your saved configuration remains untouched by updates.
- **Browser profiles:** Add, rename and remove browser profiles, with stable IDs and explicit browser selection for each shortcut. Deletion offers reassignment or leaves shortcuts unassigned.
- **Local configuration:** Settings and shortcuts are saved locally; no Kreis account is required.

## Terminology

| Term | Meaning |
| --- | --- |
| **Kreis** | One radial menu, or the application as a whole when used as a product name. |
| **Main Kreis** | The top-level launcher. |
| **Child Kreis / Sub-Kreis** | A secondary radial menu opened from a group or a tab/window selection. |
| **Slice** | A selectable segment around the ring. |
| **Shortcut** | A slice that targets an application, folder, or webpage. |
| **Group** | A slice that opens another Kreis; groups can contain nested groups. |
| **Hub** | The central control for Settings or returning to the parent Kreis; also activated by the backtick (`) key. |
| **Ring** | The circular arrangement of slices around the hub. |
| **Quick Key** | The number assigned to a slice (1–9, then 0 for the tenth) for keyboard activation. |

A group is the *entry* that opens a child Kreis, not the child Kreis itself.

## Getting started

### Install Kreis on Windows

1. Open [GitHub Actions → Build Windows installer](https://github.com/capnolithyl/Kreis/actions/workflows/windows-installer.yml).
2. Open a successful run on `main` and download the **Kreis-Windows-installer** artifact.
3. Extract the ZIP and run the `Kreis_<version>_x64-setup.exe` installer.
4. Launch Kreis, then press **Ctrl+Space** or open it from the system tray.

GitHub Actions artifacts are retained for **7 days**. The Windows installer is not currently code-signed, and installing a newer build does not automatically update running copies. Exit Kreis from the tray before installing a replacement.

### Add shortcuts and groups

Open **Settings → Shortcuts & Groups** from the hub or tray menu. You can add browser shortcuts, Windows applications, Windows folders, and groups. A browser shortcut needs a full HTTP(S) URL. An application can use an executable name or path; a folder can use an absolute directory or a Windows known-folder reference such as `shell:Downloads`.

To nest a group, set its **Parent group** (or the shortcut's **Placement**). The Settings outline and the in-wheel drag-and-drop actions both support nested groups. A parent group can hold up to 10 direct entries regardless of how many are inside its child groups. Older 11/12-slice Kreise remain accessible, editable and reorderable, but cannot gain more slices while over the new limit.

**Fresh installs start with a neutral layout:** Google, YouTube, Wikipedia, Downloads, and a **Tools** group containing GitHub and Notepad. Browser shortcuts open in the system default browser without the optional Vivaldi extension; connecting the extension enables existing-tab focusing. Downloads uses Windows' actual Downloads location and Notepad uses the built-in Windows app.

**Existing settings are preserved when updating.** Kreis saves starter shortcuts on first launch. An existing layout, including an intentionally empty Kreis, is never overwritten by a version update. **Settings → Shortcuts & Groups → Restore starter shortcuts** lets you intentionally restore the samples (this replaces the current shortcuts and groups).

### Work with the wheel

- **Left-click** a slice to activate it. If it represents a group, its child Kreis opens in place.
- **Drag** a slice near another slice's edge to reorder it, onto a group to move it there, or onto another shortcut to create a group. A child Kreis's hub can act as a drop target to move a slice up one level.
- **Press 1–9** to activate one of the first nine visible slices, or **0** for the tenth. The large translucent numeral behind each icon and label indicates its key. The assigned number follows the displayed order, including after reordering and in child Kreise. Keys are ignored while typing or using dialogs. For older 11/12-slice layouts, extra slices remain mouse-accessible until you reorganize them.
- **Right-click** a configured slice, or press **Shift+F10** while it has keyboard focus, to open the custom context menu. The wheel's Change color action uses an embedded palette, shade selector, hue slider, and hex input.
- **Press the backtick key (`)** to activate the hub: Settings on the Main Kreis, or Back on any child Kreis. The hub shows this key as a reminder.
- **Click** the hub to open Settings from the main Kreis or return to the parent Kreis. **Hold and drag** the hub to move the entire launcher without rearranging any slices. Placement is temporary; the next opening is cursor-centered again. **Backspace** goes back one level; **Escape** closes the launcher.
- When a browser shortcut matches multiple tabs, select an existing tab from the result Kreis or choose **New tab**. Application shortcuts with multiple matching windows show a similar picker.

Starter shortcuts are saved on first run only; your saved layout is not overwritten by future upgrades.

## Browser companion (Chromium)

To focus existing browser tabs in specific browser profiles:

1. In Kreis, open **Settings → Connection** and add a profile for each browser/profile combination (for example, Vivaldi · Work and Chrome · Personal). Existing Work and Personal Vivaldi profiles are kept during an upgrade.
2. In that browser profile, open its extension page (for example `chrome://extensions`, `edge://extensions`, or `vivaldi://extensions`). Enable **Developer mode**, then **Load unpacked** and select the repository's `extension/` folder. Install the companion separately for each Chromium user profile.
3. Open the Kreis companion popup. Paste the **pairing key** from the desktop app, click **Load profiles from Kreis**, and choose the matching browser and profile.
4. Click **Save & connect**. Return to Kreis Connection settings and choose **Refresh connections** to see the status.
5. Edit website shortcuts under **Settings → Shortcuts & Groups** to select the correct browser/profile. The companion focuses existing matching tabs, or creates a new tab in that specific connected browser.

The new companion is **v0.4.0**. Update/reload your unpacked extension to choose custom profiles. The previous v0.3 Vivaldi companion can still connect as Work/Personal to Kreis 0.12, so those shortcuts do not need an immediate extension migration.

The companion connects to a token-authenticated WebSocket at `127.0.0.1:43991`. It uses the `tabs` permission to discover tab URLs and titles and does not read page contents. Keep your pairing key private.

Profiles have stable internal IDs independent of their names and browser brands. Chrome · Work and Vivaldi · Work are two distinct connections. If a **new custom profile** is disconnected, Kreis shows an error rather than opening the wrong browser or profile. Existing legacy Vivaldi Work/Personal shortcuts retain the old default-browser fallback when unfiltered. Removing a profile never deletes its shortcuts; choose a replacement or leave them unassigned. Browser compatibility relies on Chromium extension APIs, and Opera or browser-specific restrictions may require verification on your machine.

The extension popup includes **Tab matching diagnostics** for troubleshooting. After changing extension files, reload the unpacked extension on your browser's extensions page.

## Add to Kreis from outside the app

**File Explorer:** Open **Settings → Integrations** to enable or disable per-user **Add to Kreis** context-menu commands for folders, `.exe` files, and `.lnk` shortcuts. On Windows 11, these commands may appear under **Show more options**. No administrator privileges are required for this opt-in integration. The confirmation picker now lets you choose the destination **and the shortcut icon and color** before saving.

**Chromium browser:** With the companion extension installed and paired, right-click a link or page and choose **Add link to Kreis** or **Add page to Kreis**. The confirmation picker lets you change the label, destination, icon, and wheel color. Colors are chosen in an embedded picker, avoiding the native color-popup issue. The browser action requires a paired connection to Kreis.

## Development

Requirements: [Node.js LTS](https://nodejs.org/), [Rust](https://rustup.rs/), and the [Tauri v2 Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows).

    git clone https://github.com/capnolithyl/Kreis.git
    cd Kreis
    npm ci
    npm run tauri dev

To produce a local Windows installer:

    npm run tauri build

The app lives in `src/` and `src-tauri/`; the unpacked browser companion is in `extension/`. The Windows CI workflows validate frontend code, extension and shortcut tests, the Tauri build, and installer checksums. A push to `main` builds an NSIS installer artifact automatically.

### Installer checksums

Each installer artifact ZIP contains both the `Kreis_<version>_x64-setup.exe` file and `SHA256SUMS.txt`. You can compare the EXE's SHA-256 hash in PowerShell using `Get-FileHash -Algorithm SHA256`.

A matching hash confirms that the extracted installer agrees with its checksum manifest. It does **not** replace code signing, publisher verification, or malware scanning. This project commits its npm and Cargo lockfiles and uses pinned CI tool versions to improve build repeatability.

## Current limitations

- Windows only; new layouts permit **10** direct slices per configured Kreis. Older 11/12-slice layouts remain intact, and their extra slices remain clickable.
- Browser pairing supports configurable Chromium profiles. Vivaldi was the original tested integration; verify Chrome, Edge, Brave and Opera in their respective extension managers.
- Native application focusing and File Explorer tab reuse depend on Windows behavior and may fall back to opening a new instance or tab when a safe existing match cannot be identified.
- A `.lnk` shortcut opens through Windows Shell and may not identify an already-running application for focus.
- File Explorer context-menu integration is opt-in and does not extend to every Start menu or taskbar right-click menu.
- Auto-discovery of installed browser profiles and a fully automated extension-store installation are not yet implemented.

## Roadmap

The next milestones are **plans**, not released features.

| Target | Planned improvements |
| --- | --- |
| **0.11.0 · Launcher usability** | Numbered Quick Keys using **1–9 and 0** and the safe 10-slice limit are shipped. Generic starter shortcuts shipped in **0.11.2**. Hub dragging shipped in **0.10.2** and was stabilized in **0.10.3**. |
| **0.12.0 · Browser and profile management** | Browser/profile registry and safe profile management shipped. Paired Chrome, Edge, Brave, Opera and Vivaldi profiles use the new Chromium extension; manual cross-browser testing is still recommended. Auto-discovery remains future work. |
| **Later / under consideration** | Browser/profile auto-detection, improved keyboard accessibility, gesture navigation, and easier distribution/update options. |

See the [detailed roadmap](ROADMAP.md) for scope, compatibility rules, and proposed acceptance criteria.

## Security and privacy

Kreis stores its configuration and browser pairing key locally. The companion communicates over the local loopback address and requires the pairing key. The app does not require an online account or use a cloud service for launcher operation. Avoid sharing pairing keys in screenshots or bug reports.

## License

**No license has been selected yet.** Public GitHub visibility does not, by itself, grant permission to redistribute or modify the source code.
