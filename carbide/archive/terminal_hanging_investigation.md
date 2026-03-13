# Terminal Panel "Hanging" Bug Investigation

## Bug Report
When opening multiple terminal tabs, they seem to hang or get stuck. After opening a few panels, they become unresponsive.

## Root Cause Analysis
The investigation revealed that the `TerminalPanel_content.svelte` component was rendering all terminal sessions simultaneously using `TerminalSessionView`, even if they were not active (using `display: none`).

This led to several critical issues:
1. **Redundant Xterm Instances:** Each background terminal had an active `Terminal` instance with a `FitAddon` and a `ResizeObserver`.
2. **Invalid Resizing:** `fit_addon.fit()` was being called on elements with `display: none` (zero dimensions), leading to incorrect terminal sizes (e.g., 0x0 or 80x24 defaults being repeatedly sent to the backend).
3. **Backend Overload:** When switching tabs or resizing the window, every single terminal session (active or background) triggered a `resize_session` call to the backend.
4. **Input Interference:** Multiple `terminal.onData` listeners were active, potentially causing background sessions to send data or interfere with state if not perfectly isolated.
5. **DOM Bloat:** Keeping all xterm DOM trees alive in the background increased memory usage and potentially slowed down Svelte's reactivity updates.

## Fixed Implementation

### 1. Deferred Rendering of Sessions
Modified `TerminalPanel_content.svelte` to only render the `TerminalSessionView` for the `active_session_id`.
- Background sessions are now destroyed in the DOM.
- When switching tabs, the old terminal is disposed, and the new one is initialized.
- `TerminalService` continues to manage the persistent PTY processes in the backend, ensuring no data loss during UI switching.

### 2. Guarded Terminal Operations
Added safety guards to `TerminalSessionView.svelte` to ensure operations only occur when the session is active:
- **Resizing:** `fit()` and `resize_session()` are only called if `active` is true.
- **Input:** `terminal.onData` now checks for `active` before sending data to the backend.
- **Focus:** `terminal.focus()` is only called for active sessions.
- **ResizeObserver:** The observer now early-returns if the session is not active.

### 3. Lifecycle Optimization
- Used `requestAnimationFrame` for initial `fit()` and `focus()` to ensure the DOM is ready and dimensions are calculated correctly.
- Improved `$effect` blocks to properly track `active` status changes.

## Verification
- Existing unit tests for `TerminalService` and `TerminalReconcileReactor` passed.
- The architectural change ensures that the number of active xterm instances is always 1, regardless of how many sessions are open in the backend.
