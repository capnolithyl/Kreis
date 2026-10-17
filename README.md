# Kreis

Kreis is a Windows tray utility that shows a **cursor-centered radial launcher** and can focus running Windows applications or activate existing tabs in Vivaldi's **Work** and **Personal** profiles.

Built with **Tauri 2 + Rust + React + TypeScript**. The browser companion is an unpacked **Manifest V3 Chromium extension**. Both live in this one repository.

## What Kreis does

- Starts hidden in the Windows tray and shows a round menu around the cursor.
- Registers **Ctrl+Space** by default, falling back to **Ctrl+Alt+Space** if unavailable.
- Right-click the tray icon for Open Kreis, Settings, or Quit; left-click opens the wheel.
- Add/edit/reorder/remove shortcuts and groups, stored locally. Each wheel can display up to 12 shortcuts.
- Group related items into nested sub-Kreise (for example **Work → IHM** or **Personal → Runagaldr**). Each group may contain other groups, browser/app shortcuts, and folder shortcuts.
- When a desktop app such as VS Code has multiple visible windows, choose the exact workspace window by its Windows title. One window focuses immediately; zero windows use the existing launch fallback.
- Focus an existing Windows app window by executable name, or launch it when not running.
- Via the paired Vivaldi extension, find an existing URL, activate its tab, focus its window, or open a new tab in the correct Vivaldi profile.
- Without an extension connection, opens links in the **system default browser** (cannot guarantee profile selection).
- For browser shortcuts with **more than one matching tab**, replaces the main wheel with a **sub-Kreis** displaying real tab titles. One match focuses directly; zero matches open the configured URL.
- Sub-Kreis has **Back** in the center, **New tab** as an outer choice, and seven existing tabs per page. Paginate for more; Escape closes Kreis.

## Drag-and-drop on the actual Kreis (0.8.0)

You can now arrange shortcuts **directly inside the radial Kreis** without opening Settings. Press and hold a segment, then drag it to another segment:

- Drop near the **left/leading angular edge** to move **before** that segment in clockwise order.
- Drop near the **right/trailing angular edge** to move **after** it.
- Drop in the **middle of a group** to move your shortcut (or whole subgroup) inside it.
- Drop in the **middle of another shortcut** to create a **new group containing both**. Kreis asks for the group's name in a small inline confirmation, then replaces the target segment with the group.
- In a sub-Kreis, drop onto its **center Back circle** to lift an item **one level up**. Use this to move between separate project groups.

Wedges highlight the chosen drop target and show the intended action before release. A brief message offers **Undo** after a successful change. Circular parent references, missing shortcuts and 13th entries are rejected without modifying the saved arrangement. Invalid/self drops do nothing.

Drag editing is enabled only for configured launcher and group wheels, **not** browser-tab, application-window or Settings wheels. Short clicks still launch shortcuts, and the up/down arrows and parent selectors remain in **Settings → Shortcuts & Groups** for keyboard-accessible editing.

Changes save automatically to the local Kreis settings store and persist on restart. The Vivaldi extension is unchanged.

## Nested group wheels (0.7.0)

Kreis groups can now contain **other groups** at any depth, without changing or deleting the shortcuts already saved. A possible setup is:

```text
Main Kreis
├─ Work
│  ├─ IHM
│  │  ├─ Frontend (Vivaldi tabs)
│  │  ├─ Backend (Vivaldi tabs)
│  │  └─ VS Code (matching app windows)
│  └─ Archdiocese of Baltimore
└─ Personal
   ├─ Runagaldr
   │  ├─ Dashboard
   │  └─ VS Code
   └─ Kreis
```

To build this from your existing IHM setup, create a new **Work** group under the main Kreis. Edit the current **IHM** group and set **Parent group → Work**. You do not need to recreate any shortcuts: everything inside IHM moves with it. Add Baltimore as another group under Work; repeat with Personal, Runagaldr, and Kreis.

**Settings → Shortcuts & Groups** displays a nested outline. The **+** button next to a group creates a subgroup directly inside it. Any group's **Parent group** selector shows the hierarchy and excludes the group itself and all its descendants, preventing circular references. Each individual wheel holds up to **12 direct items**, including subgroups; descendants do not count against their ancestors' 12-item limit.

When you delete a group, its *direct* contents move up **one level** to the deleted group's parent. Deleting Work, for example, moves IHM and Baltimore to Main while retaining IHM's nested shortcuts. If the destination would exceed 12 items, Kreis rejects the deletion instead of losing anything. The center Back button and Backspace return one wheel at a time, from any depth; Escape closes the launcher.

No Vivaldi extension update is needed, and existing group IDs, shortcut colors, tab matching, and app-window matching continue to work.

## Visual shortcut appearance picker (0.6.3)

In **Settings → Shortcuts & Groups**, click Edit on any shortcut or group to find the new appearance controls:

- **Icon:** shows the currently selected Lucide icon as a real preview. Click it to open a searchable gallery of every available icon, with icon artwork and names. Changing an icon updates the preview before saving.
- **Color:** a large, full-size color swatch uses the saved hex value directly, instead of relying on the tiny Windows native color-input thumbnail. Click the swatch to launch the system color picker, or enter a six-digit (or short three-digit) hex code. The accent preview updates while editing. Invalid partial hex values cannot be saved from the text field.

The dialog scrolls its form internally if the icon gallery needs more room, keeping Save and Cancel visible. Saved icon keys, colors, and the rest of the shortcut format are unchanged. No Vivaldi extension update is needed.

## Minimized Explorer tab reuse fix (0.6.2)

On Windows 11, Explorer can hide its tab controls from Windows UI Automation while the window is minimized, even though the matching folder remains registered in the Shell. Kreis now restores **only the Explorer window whose Shell folder path already matches the requested folder**, waits briefly for its tab controls, then selects the matching tab. It focuses that existing window rather than creating a duplicate Downloads tab. If the tab cannot be identified safely, it still uses the existing new-tab fallback.

To test: open `shell:Downloads` (or your relocated Downloads path), minimize Explorer, then use Kreis's Downloads shortcut. It should restore Explorer on the same tab with no additional tab. Also try a minimized Explorer window with Downloads in a background tab, and confirm that opening an unrelated folder still creates a new tab.

## Explorer folder reuse fix (0.6.1)

The default folder shortcut now uses `shell:Downloads`, which resolves Windows' actual Downloads Known Folder, including directories relocated to another drive. `%USERPROFILE%\\Downloads` still means the directory inside the profile and does not follow Windows' redirected Downloads setting.

Kreis now searches for an exact **Shell folder path** instead of using the unreliable File Explorer window caption. On Windows 11, it attempts to select the uniquely named matching Explorer tab using the Windows UI Automation tab controls, including background tabs when recognizable. Ambiguous duplicates still open a new tab rather than switch to an unrelated directory. Explorer keyboard shortcuts are used only for the fallback.

Existing folder shortcuts retain their saved paths: update yours to `shell:Downloads` or keep your direct `E:\\Users\\marcu\\Downloads` path. No browser extension update is required.

## Windows File Explorer folders

Add a shortcut in **Settings → Shortcuts & Groups → Add shortcut**, choose **Windows folder**, and enter a directory like `shell:Downloads`, `%OneDrive%\\Documents`, `C:\\Projects\\IHM`, or `~\\Downloads`. Assign it to a project group if useful. The folder must exist and be accessible when opened. Existing browser/app shortcuts remain unchanged.

When invoked, Kreis tries, in order:

1. Find an **already selected / active File Explorer folder tab** matching the exact directory via Windows Shell automation. To avoid accidentally focusing a different Explorer tab, Kreis also verifies the current window caption before reusing it. Windows does **not** expose a reliable public API for selecting arbitrary background Explorer tabs, so hidden background matches are not promised.
2. If another File Explorer window is running on **Windows 11 22H2+**, activate it and use its native keyboard shortcuts **Ctrl+T**, **Ctrl+L**, type the folder path, and press Enter to navigate in a **new tab**, leaving its previous tab alone.
3. If File Explorer isn't running, the Windows version lacks Explorer tabs, or Explorer cannot safely receive focus, launch the folder in a **new Explorer window**.

The native implementation checks the foreground window throughout tab navigation. It **never uses the clipboard** for folder paths and does not change File Explorer's system settings. The tab reuse is a best-effort Windows 11 integration because Microsoft doesn't publish a supported tab-management API; report any Explorer differences with a screenshot and your Windows version. Folder shortcuts are local only and require no Vivaldi extension update.

## Settings category wheel

Click the **Settings** button in the center of the main Kreis (or select **Settings** from the tray menu) to open another cursor-centered Kreis. Its categories are:

- **Hotkey:** configure and apply the global keyboard shortcut.
- **Typography:** choose the wheel font family and text sizes.
- **Shortcuts & Groups:** add, edit, move and organize launcher entries into groups.
- **Connection:** view Work and Personal Vivaldi connection status, refresh or copy the pairing key.

Choosing a category opens a focused settings page sized for that category, rather than an all-in-one scrolling screen. Click **Back**, press **Escape**, or use **Back to settings** to return to the settings wheel at its original location. Its center button returns to the main wheel. Closing the settings page via X hides Kreis.

Your existing shortcuts, groups, styles, browser profiles and pairing token are retained. Only the **Windows app** changes; you do not need to update the Vivaldi extension. The settings categories are defined in `src/settingsCategories.ts` for easy addition of future sections.

## Organize shortcuts into groups

Open **Settings → Shortcuts & Groups → Add group** and create a group named **IHM**, choosing a color and icon. Then **Edit** each existing shortcut (Frontend, Backend, Figma, VS Code, ChatGPT), choose **Placement → IHM**, and save. They disappear from the main wheel and appear inside the IHM group, preserving their URLs, profiles and matching modes.

Selecting **IHM → Frontend** still checks all currently open tabs that match the IHM frontend URL: zero opens the configured URL, one focuses directly, and several open a tab-title wheel. Selecting **IHM → VS Code** similarly opens a titled native-window wheel if multiple VS Code windows are open. To target a **specific workspace directly**, edit the IHM VS Code entry and set **Window title contains** to a distinctive part of that VS Code window title, for example `immaculate-heart-of-mary`. Leave it blank for the full app-window picker. If the requested workspace is closed, Kreis shows an error rather than accidentally focusing another project. Back takes you to the previous level, and Escape closes Kreis from any depth.

Groups can be nested at any depth, with at most 12 direct items per wheel. Removing a group moves its immediate members to that group's parent if there is room, preserving all nested descendants. Application windows with closed handles are checked again before focusing and will report an error, not focus a random window.

This release only updates the Windows app; **the existing Vivaldi extension does not need to be reinstalled or re-paired**.

## Browser tab title filtering

To group project-specific ChatGPT conversations, create or edit a **Browser tab** shortcut, set the URL to `https://chatgpt.com/`, choose the correct Vivaldi profile and use **URL path prefix** matching. In **Tab title contains (optional)**, enter `IHM`, then set **Placement → IHM**.

When selecting **IHM → ChatGPT**, Kreis first finds tabs that match the URL in the selected browser profile, then keeps **only** those whose title includes `IHM`, ignoring case. With one match it focuses the tab directly; with multiple matches it shows a titled sub-Kreis. Without a title filter, nothing changes and all URL-matching tabs are offered.

You can rename your ChatGPT conversations to include a project keyword, for example `IHM: Gutenberg blocks` or `IHM: Figma discussion`. The filter uses **the actual browser tab title** reported by Vivaldi, so check that the keyword appears in the tab title. If no matching tab is open, Kreis displays an explanation rather than opening an unrelated chat. If the extension is unavailable, it also reports that filtering cannot run safely.

The filter is entirely inside the Windows app; **no Vivaldi extension update is needed**.

## Wheel appearance

Open Kreis **Settings → Typography** to customize the radial menu without affecting the saved shortcuts or Vivaldi pairing. Choose from installed Windows font families and adjust **Shortcut labels (10–18 px)** and **Center label (13–24 px)**. The live preview updates immediately; click **Apply typography** to save the choice. The same font and sizes are used for nested tab wheels. If a font isn't installed, Kreis falls back to Segoe UI.

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

Build an NSIS installer locally with `npm run tauri build` on Windows. Pull-request CI validates the complete Windows build, browser extension and title-filter tests without keeping installer artifacts.

**Automatically on merge:** every push to `main` (including merging a pull request) triggers **Actions → Build Windows installer**. Wait for the workflow to finish, open its run, and download the **Kreis-Windows-installer** artifact. Extract the ZIP to get the Windows `.exe` installer, then install it manually. Artifacts are retained for **one day** to minimize storage usage.

The installer workflow can still be started manually from **Actions → Build Windows installer → Run workflow**. CI's full Windows build is limited to pull requests or explicit manual checks, avoiding a second redundant full compilation on each `main` push. Building an installer does not automatically update installed copies of Kreis.

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

**Updating:** This feature requires both the updated **Windows app** and the updated **browser extension**. After merging, download the automatically generated installer from **Actions → Build Windows installer**, install it, update the unpacked `extension/` folder, and click **Reload** in `vivaldi://extensions` in both profiles. Your pairing key and saved shortcuts are preserved.

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

## Windows build integrity and checksums

Windows installers are built by GitHub Actions from the `main` branch. The **Kreis-Windows-installer** workflow artifact ZIP includes:

- `Kreis_<version>_x64-setup.exe`, the NSIS installer.
- `SHA256SUMS.txt`, containing the SHA-256 hash of **the installer EXE**, not the containing workflow artifact ZIP.

After extracting the artifact, verify the installer in PowerShell from the extracted folder:

```powershell
$line = (Get-Content .\SHA256SUMS.txt | Select-Object -First 1).Trim()
$parts = $line -split ' \*', 2
if ($parts.Count -ne 2) { throw 'Invalid SHA256SUMS.txt format' }
$actual = (Get-FileHash -LiteralPath $parts[1] -Algorithm SHA256).Hash
if ($actual -ine $parts[0]) { throw 'Installer SHA-256 mismatch' }
Write-Host 'Kreis installer checksum verified.'
```

A matching checksum detects corruption or a mismatch between the EXE and its manifest, but is **not** the same thing as code signing or a malware-free guarantee. Verify that the archive came from the expected GitHub Actions run.

The repository commits `package-lock.json` and `src-tauri/Cargo.lock`. Both Windows workflows use `npm ci`, check Cargo's `--locked` resolution, and fail if either lockfile changes during the build. The runner image, Node, Rust, and GitHub Actions dependencies are version-pinned for better repeatability. Update lockfiles and toolchain pins intentionally when upgrading dependencies or patching the build environment.

## Add to Kreis from context menus (0.9.0)

**Vivaldi:** Reload the unpacked `extension/` companion in `vivaldi://extensions` after upgrading. Right-click any web link and select **Add link to Kreis**, or right-click a page and choose **Add page to Kreis**. Kreis opens a confirmation screen where you can edit the label, select the Work/Personal profile, and place the shortcut on the main wheel or in any nested group. Links are only sent over the already-paired, local WebSocket connection. If Kreis is temporarily disconnected, one pending browser addition is retained for up to five minutes.

**File Explorer:** Open Kreis → Settings → **Integrations** and select **Enable Explorer context menus** (opt-in). The per-user, reversible Windows registry entries add **Add to Kreis** to folders, `.exe` applications, and `.lnk` desktop/Start Menu shortcuts selected in Explorer. The command opens the same confirmation screen and works when Kreis is already running or starts it when needed. On Windows 11, the traditional registry verb normally appears under **Show more options**. Windows taskbar / Start Menu tiles are **not** Explorer file context menus, so those right-click menus are not covered.

The picker validates the target and refuses any destination with 12 shortcuts. It never silently creates or overwrites shortcuts. `.lnk` app entries use the Windows Shell to open the shortcut; since the underlying executable is not resolved, unlike `.exe` entries these do not automatically focus a previously running app window.

**Remove the integration:** Return to Settings → Integrations → **Disable Explorer context menus**. This removes only Kreis's per-user registry keys. Administrator privileges are not required. Disabling the Vivaldi context menus is done by disabling or removing the companion extension.

## Wedge context menu (0.10.0)

Right-click a saved shortcut or group **directly on the main or nested radial wheel**, or focus it with the keyboard and press **Shift+F10**, to open the native-looking Kreis context menu. This does not launch the item or start a drag. The menu closes if you click outside it or press Escape.

- **Rename**, **Change color**, or **Change icon** without leaving the wheel.
- **Move to group** to file shortcuts or groups into another nested Kreis, including the main wheel. Cycles and 12-item overflows are rejected.
- **Duplicate** an individual shortcut beside its original. Group duplication is intentionally excluded to avoid silently copying entire trees.
- **Copy target** to the clipboard for browser URLs, executable paths, and folders.
- **Delete shortcut/group** with confirmation. Deleting a group preserves its contents by moving its immediate children up a level. If that would overflow the parent, deletion is blocked.

**Change color** in 0.10.1 uses an embedded palette, hue and shade editor, and hex input. It never opens the native browser/Windows color popup. For advanced target edits, profiles, or URL-matching changes, use Settings → Shortcuts.

Changes are saved to Kreis's existing local store; the usual **Undo** toast can restore the previous wheel. Settings list controls and drag-and-drop behavior stay available. Browser tab-choice wheels and Settings categories intentionally have no shortcut context menu.
