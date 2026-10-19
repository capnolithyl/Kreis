# Experimental Vivaldi native Tab Stack UI mod

Vivaldi's native named Tab Stacks aren't accessible through the public Chromium extension APIs. This optional mod runs in Vivaldi's **own browser UI**, then sends a tab ID to the Kreis extension using restricted cross-extension messaging. It does **not** expose your tabs or pairing key to websites.

To add named stacks by right-click, update **both** Kreis desktop to **0.13.0** and the browser extension to **0.5.3**, then reinstall this updated Vivaldi UI mod. Existing stack switching works with older versions, but the new context-menu command requires the updated desktop and companion.

## Installation on Windows

1. Open `vivaldi://extensions`, enable **Developer mode**, and copy the 32-letter **ID** of the installed Kreis Tab Switcher extension (the ID is different from its version).
2. Download/extract this `vivaldi-mod` directory from the repository. **Exit Vivaldi completely**.
3. Open a PowerShell terminal in the folder and run:

   `powershell -ExecutionPolicy Bypass -File .\install.ps1 -ExtensionId YOUR_32_LETTER_ID`

   If Vivaldi is installed under Program Files, you may need to run PowerShell as administrator. The installer searches the LocalAppData and Program Files installation locations. If necessary, specify `-VivaldiRoot "C:\Program Files\Vivaldi\Application"`.
4. Restart Vivaldi and open the Kreis extension popup. **Vivaldi UI mod: Connected** means the bridge is live. Click **Check stack access** to see whether the UI mod can read named stacks.
5. In Kreis Settings, create or edit a **Vivaldi named Tab Stack** shortcut pointing at the name of an *existing* stack. **Leave automatic recreation disabled for the first test.** Once that works, optionally test creation using disposable tabs.

The script backs up `window.html` to `window.html.kreis-backup` once, installs `kreis-vivaldi.js` with the extension ID inserted, and adds only one script tag. It doesn't edit any Vivaldi user profiles or their saved tabs.

### Add an existing named stack to Kreis

1. Make sure Kreis desktop **0.13.0**, companion extension **0.5.3**, and this updated UI mod are installed and the extension reports **Connected**.
2. Try **right-clicking** a member tab of a named native stack. If your Chromium/Vivaldi build exposes the extension's native tab menu item, select **Add Tab Stack to Kreis**.
3. Otherwise, **Ctrl+right-click** the named stack in the tab strip (also try one of its member tabs). A small **Add "[stack]" to Kreis** action should appear. This fallback doesn't replace Vivaldi's normal right-click menu.
4. In Kreis's confirmation picker choose the destination, icon, color, and paired Vivaldi profile, then click **Add shortcut**. It does not move any tabs. Automatic recreation is initially disabled.

The fallback's tab-strip selectors depend on Vivaldi's internal UI and may need adjustments after browser updates. It only recognizes **named** stacks, not loose tabs or unnamed stacks. The native tab-menu item may not appear in every Vivaldi version.

### Updating a previously installed UI mod

For this **Add to Kreis** feature you must update the desktop and browser extension too. To refresh just the UI mod in future: if Kreis already shows **Vivaldi UI mod: Connected**, reinstall the updated `kreis-vivaldi.js` by running `install.ps1` again. Completely close Vivaldi and run the same PowerShell installation command with the existing extension ID. It overwrites just the Kreis mod script; its existing `window.html` injection and backup are preserved.

Stack recreation needs a native `tabsPrivate.move` method to **actually create** the tab group. If `tabsPrivate.setExtData` is also available, Kreis uses it to name the group. Otherwise it attempts to set `fixedGroupTitle` on the **two new tabs only** using `chrome.tabs.update` inside the privileged UI mod, an approach demonstrated in other Vivaldi mods. Kreis checks that the new native group exists *before* updating the name and verifies the resulting metadata afterward. If native grouping is rejected before creation, Kreis removes only its temporary tabs. If **Vivaldi has already confirmed a real group**, a later metadata or naming failure now **keeps the new two-tab stack and its starting URL**, so you can manually rename it and share the precise error. It also tries the privileged `setGroupProperties` API, which some Vivaldi UI mods use even when `setExtData` is unavailable. **This fallback has not yet been confirmed in the user's Vivaldi build.** First test with a disposable stack name and no important tabs. If Vivaldi rejects grouping/naming or the new stack cannot be verified, Kreis attempts to close only the two tabs it created. Existing stack switching is unchanged.

**Important:** These are unofficial, privileged Vivaldi UI modifications. A Vivaldi update may undo the injection or change private APIs. Back up your browser data before testing. The optional creation action creates two tabs; if creation cannot be confirmed it attempts to remove **only** those new tabs. It cannot resurrect tabs closed earlier.

### Uninstall

Quit Vivaldi and run:

   `powershell -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall`

The installer removes the Kreis script reference and file, without touching unrelated mods. It leaves the backup available for manual recovery.

### Manual installation

Locate the version-specific `resources\vivaldi\window.html` in Vivaldi's installation. Back it up. Put `kreis-vivaldi.js` beside it, replace the exact string `__KREIS_EXTENSION_ID__` with the extension ID from `vivaldi://extensions`, and add `<script src="kreis-vivaldi.js"></script>` just before the closing `</body>`. Restart the browser.

### Current limitation

Vivaldi loads UI mods from its application directory, so **this prototype points to one extension ID per Vivaldi installation**, even if you have multiple Vivaldi profiles. Use your main profile for the initial test; we'll extend it after confirming the private APIs work.
