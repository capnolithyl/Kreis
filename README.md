# Kreis

Kreis is a Windows tray utility that shows a **cursor-centered radial launcher** and can focus running Windows applications or activate existing tabs in Vivaldi's **Work** and **Personal** profiles.

Built with **Tauri 2 + Rust + React + TypeScript**. The browser companion is an unpacked **Manifest V3 Chromium extension**. Both live in this one repository.

## What Kreis does

- Starts hidden in the Windows tray and shows a round menu around the cursor.
- Registers **Ctrl+Space** by default, falling back to **Ctrl+Alt+Space** if unavailable.
- Right-click the tray icon for Open Kreis, Settings, or Quit; left-click opens the wheel.
- Add/edit/reorder/remove shortcuts and groups, stored locally. Each wheel can display up to 12 shortcuts.
- Group related items (for example **IHM**) into a nested Kreis. Groups contain browser or desktop-app shortcuts, which can themselves open matching-tab or matching-window wheels.
- When a desktop app such as VS Code has multiple visible windows, choose the exact workspace window by its Windows title. One window focuses immediately; zero windows use the existing launch fallback.
- Focus an existing Windows app window by executable name, or launch it when not running.
- Via the paired Vivaldi extension, find an existing URL, activate its tab, focus its window, or open a new tab in the correct Vivaldi profile.
- Without an extension connection, opens links in the **system default browser** (cannot guarantee profile selection).
- For browser shortcuts with **more than one matching tab**, replaces the main wheel with a **sub-Kreis** displaying real tab titles. One match focuses directly; zero matches open the configured URL.
- Sub-Kreis has **Back** in the center, **New tab** as an outer choice, and seven existing tabs per page. Paginate for more; Escape closes Kreis.

## Organize shortcuts into groups

Open **Settings → Shortcuts and groups → Add group** and create a group named **IHM**, choosing a color and icon. Then **Edit** each existing shortcut (Frontend, Backend, Figma, VS Code, ChatGPT), choose **Placement → IHM**, and save. They disappear from the main wheel and appear inside the IHM group, preserving their URLs, profiles and matching modes.

Selecting **IHM → Frontend** still checks all currently open tabs that match the IHM frontend URL: zero opens the configured URL, one focuses directly, and several open a tab-title wheel. Selecting **IHM → VS Code** similarly opens a titled native-window wheel if multiple VS Code windows are open. To target a **specific workspace directly**, edit the IHM VS Code entry and set **Window title contains** to a distinctive part of that VS Code window title, for example `immaculate-heart-of-mary`. Leave it blank for the full app-window picker. If the requested workspace is closed, Kreis shows an error rather than accidentally focusing another project. Back takes you to the previous level, and Escape closes Kreis from any depth.

Groups are currently **one level deep** (groups cannot contain other groups), and each level supports at most 12 configurable shortcuts. Removing a group moves its members to the main wheel if there is room; otherwise Kreis asks you to reorganize first rather than deleting shortcuts. Application windows with closed handles are checked again before focusing and will report an error, not focus a random window.

This release only updates the Windows app; **the existing Vivaldi extension does not need to be reinstalled or re-paired**.

## Browser tab title filtering

To group project-specific ChatGPT conversations, create or edit a **Browser tab** shortcut, set the URL to `https://chatgpt.com/`, choose the correct Vivaldi profile and use **URL path prefix** matching. In **Tab title contains (optional)**, enter `IHM`, then set **Placement → IHM**.

When selecting **IHM → ChatGPT**, Kreis first finds tabs that match the URL in the selected browser profile, then keeps **only** those whose title includes `IHM`, ignoring case. With one match it focuses the tab directly; with multiple matches it shows a titled sub-Kreis. Without a title filter, nothing changes and all URL-matching tabs are offered.

You can rename your ChatGPT conversations to include a project keyword, for example `IHM: Gutenberg blocks` or `IHM: Figma discussion`. The filter uses **the actual browser tab title** reported by Vivaldi, so check that the keyword appears in the tab title. If no matching tab is open, Kreis displays an explanation rather than opening an unrelated chat. If the extension is unavailable, it also reports that filtering cannot run safely.

The filter is entirely inside the Windows app; **no Vivaldi extension update is needed**.

## Wheel appearance

Open Kreis **Settings → Wheel typography** to customize the radial menu without affecting the saved shortcuts or Vivaldi pairing. Choose from installed Windows font families and adjust **Shortcut labels (10–18 px)** and **Center label (13–24 px)**. The live preview updates immediately; click **Apply typography** to save the choice. The same font and sizes are used for nested tab wheels. If a font isn't installed, Kreis falls back to Segoe UI.

The wheel now opens with a slower, staggered spin-up (roughly 0.7–0.9 seconds) and has no gaps between shortcut wedges. Windows' **Reduce motion** preference is respected.

This version only changes the **Windows app**, so existing unpacked Vivaldi extensions do not need an update.

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

## Nested wheels and multiple browser tabs

1. Add a browser entry such as **ChatGPT** with URL `https://chatgpt.com/`, **Work** or **Personal** profile, and **URL path prefix** match mode. A root URL matches the whole website; a deeper URL (like `/wp-admin/`) groups only that branch.
2. Open at least two matching tabs in that same Vivaldi profile, in any windows, stacks, or workspaces.
3. Press the global shortcut, select the browser entry, and Kreis shows a sub-wheel with tab titles. Selecting one focuses that **exact tab** by ID. The main wheel is replaced in-place.
4. Select **Back** in the center to return, **New tab** to deliberately create another tab, or **Escape** to hide Kreis. Each sub-wheel shows up to seven tabs at once plus New tab, with page navigation if needed.

The browser tab discovery is scoped to the selected Vivaldi profile. If the companion hasn't been updated or disconnects, Kreis falls back to the original browser shortcut action, after a short timeout.

**Updating:** This feature requires both the updated **Windows app** and the updated **browser extension**. After merging, run **Actions → Build Windows installer**, install it, update the unpacked `extension/` folder, and click **Reload** in `vivaldi://extensions` in both profiles. Your pairing key and saved shortcuts are preserved.

## Debugging a tab that opens twice

After clicking an entry in Kreis, open the **Kreis extension popup** in that Vivaldi profile. The new **Tab matching diagnostics** section reports how many tabs the browser exposes, how many have readable URLs, and whether the shortcut matched its host or path. Clicking **Scan tabs now** refreshes the inventory. Only hostnames and paths appear in the report, not query strings or the pairing key.

The companion extension uses ES-module service workers starting with v0.1.1. After updating a local checkout or extracted ZIP, visit `vivaldi://extensions` in **both** profiles and hit **Reload** on the Kreis extension. No reinstall of the Windows app is needed for extension-only changes.

## Current limitations

- Windows only; the main wheel and each group support up to 12 configured entries. Tab/window result wheels support pagination.
- The menu is click-to-select; flick-to-release gesture navigation is planned for later.
- The bridge currently supports one connection per profile name. Duplicate `Work` labels override each other; use one copy per profile.
- A browser that is closed or has a suspended extension causes system-default-browser fallback.
- Some elevated desktop applications cannot be focused by a non-elevated Kreis process because of Windows foreground restrictions.
- Startup launch, drag/drop ordering, automatic grouping suggestions, and saved ultrawide workspaces are future enhancements.

## Security / privacy

No cloud, no account, and no remote telemetry. The pairing key is local. The extension uses the broad `tabs` permission to find URLs across your existing tabs but does **not** read page content. Never publish the pairing key in issues or screenshots.

## License

No license selected yet. Public repository visibility does not automatically grant rights to redistribute code.
