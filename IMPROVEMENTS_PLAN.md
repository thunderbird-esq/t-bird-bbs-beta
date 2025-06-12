# Future Improvements Plan for THUNDERBIRD BBS

This document outlines potential future enhancements for the THUNDERBIRD BBS project, focusing on integration, security, anonymity, usability, and new functionalities.

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
