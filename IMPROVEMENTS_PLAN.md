# Future Improvements Plan for THUNDERBIRD BBS

## Current Bug Fixes & Immediate Next Steps

This section details the immediate issues being addressed and the plan to resolve them.

### 1. Fix Telnet `ReferenceError: ANSI_... is not defined`
*   **Goal:** Ensure all Telnet command outputs that use colors function correctly without runtime errors.
*   **Method:** Review `bbsLogic.js` (and `telnetServer.js` for its welcome banner and prompt) to find all instances where ANSI color codes might be applied using undefined constants (e.g., direct use of `ANSI_CYAN` if not defined in that scope, or if `COLOR_MAP.cyan` was intended but mistyped).
    *   Standardize all direct ANSI code usage to pull from the globally defined `COLOR_MAP` object within `bbsLogic.js` (e.g., `COLOR_MAP.cyan`, `COLOR_MAP.bright_yellow + "text" + COLOR_MAP.reset`).
    *   For UI elements intended to be user-themeable (like prompt, usernames in `WHO`/`LOOK`, timestamps in `LOOK`), ensure they consistently use the `getAppliedColor(session, 'element_type')` function.
    *   Ensure `COLOR_MAP.reset` is used consistently after applying any color to prevent color bleed.
    *   The `telnetServer.js` welcome banner was already refactored to use local constants for its static display, which is fine. The main concern is dynamic output from `bbsLogic.js`. The Telnet prompt in `telnetServer.js` also needs to correctly use `getAppliedColor` and `COLOR_MAP.reset`.

### 2. Fix Web UI `405 Method Not Allowed` for API Calls
*   **Goal:** Enable command execution from the web interface by ensuring API calls reach the correct server endpoint with the correct method.
*   **Method:** This was previously addressed. The `sendCommandToServer` function in the root `index.html` file was modified. The `fetch` call for `/api/command` now uses the absolute URL: `http://localhost:3001/api/command`. Request options correctly specify `method: 'POST'` and `headers: { 'Content-Type': 'application/json' }`. This fix should be verified by the user.

### 3. Verify Web UI Font Loading & Basic Styling (Post-`core/` Reorg)
*   **Goal:** Confirm the web UI correctly loads all necessary fonts and the base styling appears as intended, following the user's reorganization of assets into the `core/` directory.
*   **Method (Primarily User Action, Post My Fixes):**
    *   The `build.js` script has been updated to source `styles.css` and `index.html` from the `core/` directory.
    *   The `postcss-copy` plugin in `build.js` is configured with `resolveFrom: 'core'` and `template: "[path][name].[ext]"`. This means if `core/styles.css` uses paths like `url("fonts/ChiKareGo2.woff2")` or `url("./fonts/ChiKareGo2.woff2")`, `postcss-copy` should correctly find `core/fonts/ChiKareGo2.woff2` and copy it to `dist_bbs_client/style/fonts/ChiKareGo2.woff2` (for the BBS client build) and `dist/fonts/ChiKareGo2.woff2` (for the original system.css demo build, though this build path is currently disabled).
    *   **User Action Required:** After the Telnet ANSI and Web API 405 bugs are fixed by me and the changes are pulled by the user, the user will need to:
        1.  Ensure all font files (e.g., `ChiKareGo2.woff2`, `ChicagoFLF.woff2`, `monaco.woff2`, `FindersKeepers.woff2`) are correctly placed in the `core/fonts/` directory.
        2.  Ensure all icon files (e.g., `scrollbar-up.svg`, `apple.svg`) are in the `core/icon/` directory.
        3.  Verify that the `url()` paths *within* `core/styles.css` correctly reference these locations (e.g., `url("fonts/ChiKareGo2.woff2")`, `url("./icon/apple.svg")`). Paths should be relative to `core/styles.css` itself or structured to work with `postcss-copy`'s resolution.
        4.  Run `node build.js`.
        5.  Test loading `http://localhost:3000` (which serves `dist_bbs_client/index.html` if `live-server` in `server.js` is pointed there, or the root `core/index.html` if `live-server` points to root). Check the browser's developer console for any 404 errors related to fonts or icons.
    *   My tooling limitations prevent me from directly placing files into `core/fonts` or `core/icon` or directly editing `core/styles.css` if the `core/` directory synchronization issue persists for my view. The `build.js` changes are based on the *assumption* that `core/styles.css` uses correct relative paths to its assets within the `core` directory.

### 4. Investigate Web UI Menubar Functionality
*   **Goal:** Ensure the "File" and "Messages" dropdown menus in the web UI are functional.
*   **Method:** Once the 405 error for API calls is resolved (as JavaScript errors can halt further script execution), if the menus still don't work, this will require inspecting the JavaScript code within the root `index.html` (or `core/index.html` if it has been moved and is the one being served) that handles these menu interactions. This will involve looking for event listeners attached to the menu items, the logic that toggles their display (typically by adding/removing a class like 'active' or changing a `display` style), and any JavaScript errors in the browser console that might occur when clicking them. This might require a separate subtask if the issue is non-trivial and not immediately obvious.

---
(Previous content of IMPROVEMENTS_PLAN.md follows below)
---

## 1. Integration with `thunderbird.esq` OS Shell

*   **Thoughts:** The `thunderbird.esq.github.io` project aims to emulate Apple System 6. The BBS web client should feel like an application running within this emulated OS. The OS shell could have a command or icon to "launch" the BBS client. Communication between the BBS client (running as part of the System 6 emulation) and the backend BBS server (Node.js) needs to be seamless.
*   **Implementation Ideas:**
    *   The BBS client assets (from `dist_bbs_client`) would be incorporated into the `thunderbird.esq.github.io` build.
    *   The System 6 shell could invoke the BBS `index.html` within an iframe or a dedicated web component that simulates a Mac window.
    *   Configuration for the API endpoint URL should be manageable, perhaps via a settings file within the System 6 emulation, so it doesn't always have to be `localhost:3001`.
    *   The Telnet server would remain a separate entry point but could be advertised or configured from within the System 6 environment.

## 2. Security

*   **Thoughts:** The current implementation has basic security. Passwords are plain text in memory, sessions are simple IDs, and there's no protection against common web vulnerabilities beyond what Express offers by default. Robust security is vital for any multi-user system.
*   **Implementation Ideas:**
    *   **Password Hashing:** Implement password hashing (e.g., using `bcrypt` or `argon2`) for storing user credentials. Replace plain text password storage.
    *   **HTTPS:** Configure the web-facing parts (API, and potentially the web client serving if not handled by GitHub Pages) to use HTTPS.
    *   **Input Validation & Sanitization:** Implement stricter input validation on the server-side for all user inputs (commands, messages) to prevent injection attacks (though current setup using `createTextNode` on client helps for XSS in messages).
    *   **Session Management:** Use more secure session management, potentially with cryptographically signed session cookies and server-side session stores (e.g., Redis) if scaling.
    *   **Rate Limiting:** Implement rate limiting on the API and Telnet server to prevent abuse (e.g., brute-force login attempts).
    *   **Data Persistence Security:** If moving from in-memory to file or database storage, ensure appropriate permissions and security measures for the data store.

## 3. Maintaining User Anonymity

*   **Thoughts:** Anonymity can be a desirable feature for a retro BBS feel. This means minimizing the collection and exposure of personally identifiable information (PII).
*   **Implementation Ideas:**
    *   **Minimal Data Collection:** Only require a username and password for registration. Avoid asking for emails or other PII.
    *   **IP Address Handling:** While server logs might store IP addresses for abuse prevention, consider if this data needs to be anonymized or regularly purged for general user activity if anonymity is a strong goal. This is a trade-off with security/moderation.
    *   **User-Controlled Information:** Allow users to control any profile information they might share (if profiles are added).
    *   **Ephemeral Options:** Consider options for "guest" access that doesn't require registration for certain features, or allow users to delete their accounts and associated messages easily.

## 4. Maximum Usability Across Platforms

*   **Thoughts:** The web interface aims for a retro Mac look, which is specific. Telnet is inherently cross-platform. The key is ensuring the core experience is accessible.
*   **Implementation Ideas:**
    *   **Web Client:**
        *   The current CSS aims for a specific retro look. While this is the goal, ensure basic HTML structure is sound for accessibility.
        *   Test on various modern browsers.
        *   For "original hardware" access via web, this would depend on the capabilities of browsers on such hardware (e.g., Netscape on a Mac Plus via a proxy). The current JS might be too modern. A "basic HTML" version could be considered if this is a hard requirement.
    *   **Telnet Client:**
        *   Stick to standard ANSI escape codes for broad compatibility. Avoid overly complex or obscure codes.
        *   Ensure line lengths and screen layouts are generally compatible with common Telnet client window sizes (e.g., 80x24).
        *   Provide clear text-based navigation and command feedback.
    *   **API:** The API is simple HTTP/JSON, which is highly cross-platform for any custom clients.

## 5. Additional Functionality

*   **Thoughts:** Classic BBSs had many features beyond basic messaging. Adding some of these would enhance the experience.
*   **Implementation Ideas:**
    *   **Message Boards/Forums:** Multiple topic-based message areas instead of one global stream.
    *   **File Areas:** Sections for uploading and downloading files (requires careful security consideration).
    *   **Private Messages (SysMail):** Allow users to send private messages to each other.
    *   **SysOp Controls:** Special commands for a system operator (SysOp) to manage users, messages, and the BBS.
    *   **Online Games:** Simple text-based games (e.g., Zork-like, trivia).
    *   **Persistent Storage:** Move from in-memory storage to a file-based solution (e.g., JSON files, SQLite) or a simple database for users and messages so data persists across server restarts. SQLite is often a good first step.
    *   **Theming/Customization:** Allow users to customize their interface colors (for Telnet) or choose themes (for web).
    *   **Full-Screen Editor:** A more advanced text editor for composing messages.
