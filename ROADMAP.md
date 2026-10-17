# Kreis roadmap

This document tracks **proposed work**, not functionality already shipped. The milestones are targets, not release dates or guarantees. See [README.md](README.md) for what Kreis currently supports.

## 0.11.0: General-purpose launcher and faster interaction

The goal is to make Kreis welcoming on a clean install while keeping existing configurations safe.

### 1. Generic starter state

- Replace project-specific default shortcuts with a small, recognizable, platform-neutral starter set. Candidate examples: **Google**, **YouTube**, **Wikipedia**, and **Downloads**.
- Showcase more than one supported target type without requiring users to have a particular application installed.
- Ensure starter entries have neutral names, working URLs, sensible icons and colors.
- Apply new defaults **only if no saved configuration exists**. Never overwrite or reset an existing user's customized shortcuts, groups, or profiles on upgrade.
- Keep the README and in-app examples aligned with what actually ships.

**Acceptance:** A clean installation has useful generic slices. Upgrading an existing installation leaves the user's saved Kreis unchanged.

### 2. Drag the entire Kreis by the hub (delivered in 0.10.2; stabilized in 0.10.3)

- Hold and drag the **hub** to reposition the whole launcher window on the current screen.
- Preserve regular hub clicks: Settings on the Main Kreis, Back on a child Kreis. Use a small movement threshold so clicks are not mistaken for drags.
- Keep **slice dragging** dedicated to reordering, grouping and moving entries. A drag started on a slice must not move the window.
- Clamp the launcher within the visible desktop area, including multiple monitor layouts and display scaling.
- Treat the move as a **temporary placement**. The next time Kreis opens, it should again appear near the cursor.
- Support mouse and pointer interactions without causing spurious click/launch events at drag end.

**Acceptance:** Dragging the hub moves the entire Kreis smoothly. Dragging a slice still rearranges slices. Clicking the hub still works. Dismissing and reopening Kreis restores cursor-centered placement.

### 3. Quick Keys for slices (delivered in 0.11.0)

- Show a small, readable number on each available slice.
- Press **1–9** to activate slices 1–9; press **0** for slice 10.
- Assign keys in the same stable order that the ring displays, including after reorder and inside child Kreise.
- Apply the same navigation principle to group slices, tab-picker slices, and application-window picker slices where appropriate.
- Do not intercept digits while the user is typing in an input, editing a group name, using a picker, or interacting with a dialog.
- Avoid triggering a new action while Kreis is busy or while a modal confirmation is open.
- Keep mouse, keyboard focus, and right-click actions functional alongside Quick Keys.

**Acceptance:** The printed digit reliably activates that slice, on the correct Kreis level, without accidentally firing while editing text.

### 4. Reduce direct slices from 12 to 10 (delivered in 0.11.0)

- New configurations and newly edited wheels should use a **10-slice limit** to match digits 0–9.
- **Do not delete or truncate** existing wheels with 11 or 12 direct entries.
- Decide how legacy over-capacity wheels should behave: preserve all existing slices and offer a clear, non-destructive migration to groups before enforcing the lower limit.
- Validate operations in Settings, context menus, browser/Explorer additions, and drag-and-drop against the new rule consistently.
- Ensure visible numbering and slice geometry remain legible at different entry counts.

**Acceptance:** New slices respect the 10-item limit while preexisting 11/12-slice setups remain accessible and can be reorganized safely.

## 0.12.0: Multi-browser support and profile manager

The goal is to remove Vivaldi-specific assumptions from the browser bridge and let people define their own browsers and profiles.

### 1. Multiple Chromium-based browsers

- Extend the companion workflow beyond Vivaldi, starting with major Chromium-based browsers where the required extension APIs behave consistently: **Chrome**, **Edge**, **Brave**, **Opera**, and **Vivaldi**.
- Verify pairing, connection status, tab discovery, tab focusing, new-tab behavior, and browser-link context menu integration in each supported browser.
- Handle browser-specific executable paths, installation differences, and permission limitations.
- Do not claim support for a browser until its actual integration has been tested.

### 2. User-managed profiles

- Replace the fixed Work/Personal profile enumeration with persistent, user-created profile identities.
- Add, rename and remove profiles from Kreis Settings.
- Represent **browser** and **profile** as distinct properties. For example, two browsers may both have a profile named "Work" without sharing a connection identity.
- Let each browser shortcut target a particular browser/profile combination.
- Show connection health and pairing state per configured browser/profile.
- Decide how multiple simultaneously connected instances of one profile should be handled.

### 3. Safe migration and deletion

- Migrate existing Work and Personal Vivaldi shortcuts and pairings without losing shortcuts or breaking already paired profiles.
- When a profile is renamed, keep shortcuts bound by a stable identifier rather than by the displayed label.
- Before deleting a profile, show which shortcuts use it and offer **reassign**, **keep unassigned**, or **cancel**; do not silently delete shortcuts.
- Ensure missing or disconnected browser/profile targets produce a clear recovery path rather than launching a random profile.
- Consider optional detection of installed browsers and existing profiles, but do not scan or expose private browser data unnecessarily.

**Acceptance:** Multiple connected Chromium browsers can coexist, multiple profiles can share the same visible name without colliding, and editing/removing a profile leaves shortcut data intact.

## Later / ideas to evaluate

These are ideas rather than scoped commitments:

- **Gesture navigation:** Optional flick/release actions for experienced pointer users, while retaining accessible click-to-select.
- **Keyboard accessibility:** Better focus indicators, predictable arrow-key navigation, and screen-reader labels.
- **Distribution and updates:** Assess code signing, a durable download channel, and an opt-in update experience.
- **Import/export:** Portable backup of Kreis layout and settings, with validation before importing.
- **Customization:** Additional appearance preferences without making the radial wheel harder to understand.
- **Diagnostics:** Clear troubleshooting for browser pairing, missing target applications, and URL/tab matching.

## Shared vocabulary

- **Kreis:** The radial menu or the app itself, depending on context.
- **Main Kreis:** Root launcher.
- **Parent Kreis / Child Kreis:** Relationship between the current Kreis and a nested one.
- **Slice:** One selectable segment of the ring.
- **Shortcut:** A slice with a destination such as an application, folder or website.
- **Group:** A slice that opens a child Kreis.
- **Hub:** Central control; drag it to reposition the window temporarily.
- **Ring:** The set of slices around the hub.
- **Quick Key:** Number assigned to a slice (1–9 and 0 for the tenth).

A **Group** is not itself a child Kreis; it **opens** one.

## Principles

1. **Preserve user data:** Migration and deletion should not silently remove or overwrite saved shortcuts.
2. **Keep direct interaction fast:** Common actions should be available on the ring without a detour into Settings.
3. **Stay predictable:** Hover, right-click, hub-drag, slice-drag, and Quick Keys must not interfere with one another.
4. **Make browser scope explicit:** Shortcut behavior must be clear about which browser and profile it will target.
5. **Keep plans separate from shipped features:** The README should describe only what works now, with clear links to planned work.
