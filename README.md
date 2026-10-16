# Kreis

Kreis is a Windows tray utility that shows a **cursor-centered radial launcher** and can focus running Windows applications or activate existing tabs in Vivaldi's **Work** and **Personal** profiles.

Built with **Tauri 2 + Rust + React + TypeScript**. The browser companion is an unpacked **Manifest V3 Chromium extension**. Both live in this one repository.

## What v0.1 does

- Starts hidden in the Windows tray and shows a round menu around the cursor.
- Registers **Ctrl+Space** by default, falling back to **Ctrl+Alt+Space** if unavailable.
- Right-click the tray icon for Open Kreis, Settings, or Quit; left-click opens the wheel.
- Add/edit/reorder/remove up to 12 Windows executables and website shortcuts, persisted locally.
- Focus an existing Windows app window by executable name, or launch it when not running.
- Via the paired Vivaldi extension, find an existing URL, activate its tab, focus its window, or open a new tab in the correct Vivaldi profile.
- Without an extension connection, opens links in the **system default browser** (cannot guarantee profile selection).

## Local Windows development

Install [Node.js LTS](https://nodejs.org/), [Rust](https://rustup.rs/) and [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows) (WebView2 and C++ build tools).

```powershell
git clone https://github.com/capnolithyl/Kreis.git
cd Kreis
npm install
npm run tauri dev
```

Build an NSIS installer with `npm run tauri build` on Windows. CI checks the frontend, extension and Rust on `windows-latest` without uploading persistent artifacts. For a cloud-built installer, run **Actions → Build Windows installer → Run workflow**, then download its one-day-retention artifact.

## Connect Vivaldi

1. Run Kreis and open **Settings** from the center of the wheel or tray menu.
2. Copy the **pairing key** shown in Browser connection.
3. In your **Work** Vivaldi profile, visit `vivaldi://extensions`, enable Developer mode, select **Load unpacked**, and select this repo's `extension` folder.
4. Click the Kreis extension icon, select **Work**, paste the key, and save.
5. Repeat installation in **Personal**, selecting **Personal**. Both use the same pairing key.
6. In Kreis Settings, click **Refresh** to confirm profile connections.

The companion connects only to `127.0.0.1:43991` through a token-authenticated WebSocket. The Windows app rejects browser webpage origins. The key is stored in the local app data directory; the extension stores its copy in its own browser profile.

## Shortcuts and entries

The default shortcut `Control+Space` is not globally reserved by Windows, but other tools (especially IMEs or launchers) may claim it. Kreis detects a failure and uses `Control+Alt+Space`. You can specify another combination in Settings. To switch browser tabs, select whether the URL must match exactly (excluding fragments), by path prefix, or as a whole website excluding WordPress admin. Use **website excluding /wp-admin/** for your WordPress frontend so it can focus any public-facing page without accidentally switching to the admin.

The provided IHM / Figma entries are **sample shortcuts**; edit or delete them to suit your own projects. Browser tab switching requires the extension. Windows executable launching needs an executable on PATH or a full `.exe` path.

## Current limitations

- Windows only; the wheel supports up to 12 entries and no nested wheels yet.
- The menu is click-to-select; flick-to-release gesture navigation is planned for later.
- The bridge currently supports one connection per profile name. Duplicate `Work` labels override each other; use one copy per profile.
- A browser that is closed or has a suspended extension causes system-default-browser fallback.
- Some elevated desktop applications cannot be focused by a non-elevated Kreis process because of Windows foreground restrictions.
- Startup launch, drag/drop ordering, dynamic desktop-app discovery, and saved ultrawide workspaces are future enhancements.

## Security / privacy

No cloud, no account, and no remote telemetry. The pairing key is local. The extension uses the broad `tabs` permission to find URLs across your existing tabs but does **not** read page content. Never publish the pairing key in issues or screenshots.

## License

No license selected yet. Public repository visibility does not automatically grant rights to redistribute code.
