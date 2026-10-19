# Experimental Vivaldi native Tab Stack UI mod

Vivaldi's native named Tab Stacks aren't accessible through the public Chromium extension APIs. This optional mod runs in Vivaldi's **own browser UI**, then sends a tab ID to the Kreis extension using restricted cross-extension messaging. It does **not** expose your tabs or pairing key to websites.

The Kreis desktop app **0.12.3** already supports stack shortcuts; you **do not need to reinstall it**. You need the **Kreis Tab Switcher browser extension v0.5.2** (reload the unpacked extension after updating).

## Installation on Windows

1. Open `vivaldi://extensions`, enable **Developer mode**, and copy the 32-letter **ID** of the installed Kreis Tab Switcher extension (the ID is different from its version).
2. Download/extract this `vivaldi-mod` directory from the repository. **Exit Vivaldi completely**.
3. Open a PowerShell terminal in the folder and run:

   `powershell -ExecutionPolicy Bypass -File .\install.ps1 -ExtensionId YOUR_32_LETTER_ID`

   If Vivaldi is installed under Program Files, you may need to run PowerShell as administrator. The installer searches the LocalAppData and Program Files installation locations. If necessary, specify `-VivaldiRoot "C:\Program Files\Vivaldi\Application"`.
4. Restart Vivaldi and open the Kreis extension popup. **Vivaldi UI mod: Connected** means the bridge is live. Click **Check stack access** to see whether the UI mod can read named stacks.
5. In Kreis Settings, create or edit a **Vivaldi named Tab Stack** shortcut pointing at the name of an *existing* stack. **Leave automatic recreation disabled for the first test.** Once that works, optionally test creation using disposable tabs.

The script backs up `window.html` to `window.html.kreis-backup` once, installs `kreis-vivaldi.js` with the extension ID inserted, and adds only one script tag. It doesn't edit any Vivaldi user profiles or their saved tabs.

**Important:** These are unofficial, privileged Vivaldi UI modifications. A Vivaldi update may undo the injection or change private APIs. Back up your browser data before testing. The optional creation action creates two tabs; if creation cannot be confirmed it attempts to remove **only** those new tabs. It cannot resurrect tabs closed earlier.

### Uninstall

Quit Vivaldi and run:

   `powershell -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall`

The installer removes the Kreis script reference and file, without touching unrelated mods. It leaves the backup available for manual recovery.

### Manual installation

Locate the version-specific `resources\vivaldi\window.html` in Vivaldi's installation. Back it up. Put `kreis-vivaldi.js` beside it, replace the exact string `__KREIS_EXTENSION_ID__` with the extension ID from `vivaldi://extensions`, and add `<script src="kreis-vivaldi.js"></script>` just before the closing `</body>`. Restart the browser.

### Current limitation

Vivaldi loads UI mods from its application directory, so **this prototype points to one extension ID per Vivaldi installation**, even if you have multiple Vivaldi profiles. Use your main profile for the initial test; we'll extend it after confirming the private APIs work.
