# Developer Log: THUNDERBIRD BBS Implementation

This document outlines the steps and rationale involved in the development of the THUNDERBIRD BBS system.

## Project Summary & Accomplishments (Chronological Overview)

The development of THUNDERBIRD BBS involved several key phases, transforming an initial System.css template into a functional, multi-interface Bulletin Board System:

1.  **Initial Setup & Foundation (System.css Understanding):**
    *   The project began with the System.css repository, focusing on understanding its structure and how to leverage its retro Macintosh styling for a web-based BBS interface.
    *   `server.js` was initially modified to serve `index.html` (the future BBS UI) directly from the project root, enabling rapid prototyping of the web look and feel.

2.  **Core BBS Functionality - Phase 1 (In-Memory):**
    *   **`bbsLogic.js` Established:** This central module was created to house shared logic for command processing, session management, and data handling, aiming for consistency between web and Telnet interfaces.
    *   **Telnet Server (`telnetServer.js`):** A basic TCP server using Node.js's `net` module was implemented, providing initial Telnet connectivity, a welcome message, and basic command echoing.
    *   **Express API Server (`server.js`):** An Express app was integrated to handle web client commands via a `/api/command` POST endpoint, facilitating communication between the web UI and `bbsLogic.js`.
    *   **Session Management (In-Memory):** Initial session handling was implemented in `bbsLogic.js` using an in-memory object to store session data, keyed by a unique session ID.
    *   **Basic Commands:** Core commands like `LOOK` (view messages), `SAY` (post messages), and `HELP` were implemented, initially operating on in-memory message stores.

3.  **User Accounts & Persistence:**
    *   **In-Memory to SQLite:** User accounts transitioned from a temporary in-memory object to persistent storage in an SQLite database (`bbs.sqlite`).
    *   **Database Schema (`database.js`):** The `users` table was created with fields for `id`, `username` (unique), `password_hash`, `registration_date`, and `role`.
    *   **Password Security:** `bcrypt` was integrated for hashing passwords, enhancing security over plain-text storage.
    *   **Authentication Commands:** `REGISTER`, `LOGIN`, and `LOGOUT` commands were implemented in `bbsLogic.js` to interact with the new `users` table.
    *   **`WHO` Command:** Added to list currently logged-in (not necessarily all registered) users.

4.  **Styling and User Experience:**
    *   **Web UI Styling:** Continuously ensured the web interface (`index.html`) correctly utilized `style.css` (later `core/styles.css`) for the Macintosh Plus theme.
    *   **Telnet ANSI:** An ANSI art welcome banner was created for `telnetServer.js`. Basic ANSI coloring was applied to Telnet command outputs (e.g., for `LOOK`, `WHO`) to improve readability and aesthetics.

5.  **Build Process & Asset Management:**
    *   **`build.js` Creation:** A build script was developed to process `style.css` using PostCSS (including `cssnano` for minification and `postcss-copy` for asset handling like fonts/icons).
    *   **BBS Client Asset Packaging:** `build.js` was enhanced to create a dedicated `dist_bbs_client` directory, packaging all necessary web client assets (HTML, processed CSS, fonts, icons) for streamlined deployment.
    *   **`core/` Directory Reorganization:** `build.js` was subsequently adapted to reflect the user's reorganization of source assets (like `styles.css`, `index.html`, `fonts/`, `icon/`) into a `core/` subdirectory. This involved updating source paths and `postcss-copy` configurations (`resolveFrom: 'core'`) to ensure assets were correctly found and copied.

6.  **Advanced BBS Features:**
    *   **Message Boards/Forums:**
        *   `boards` table created in `database.js`.
        *   `LISTBOARDS` and `JOINBOARD <board_name_or_id>` commands implemented, allowing users to see and switch between different message boards.
        *   `SAY` and `LOOK` commands were made board-aware, operating on the session's `currentBoardId`.
        *   Sessions initialized to a default 'General' board.
    *   **Private Messages (SysMail):**
        *   `private_messages` table created.
        *   `SENDMAIL <recipient> <subject> /// <body>`, `LISTMAIL`, `READMAIL <id>`, and `DELETEMAIL <id>` commands implemented.
        *   Login notification for unread private messages added.
    *   **SysOp Controls:**
        *   User roles ('user', 'sysop') added to `users` table (SysOp designation is manual via SQL).
        *   `isSysOp(session)` helper function created.
        *   SysOp-specific commands: `KICK <username>`, `BROADCAST <message>`, `EDITMESSAGE <id> <new_text>` (for public board messages), `DELETEMESSAGE <id>` (for public board messages).
        *   Dynamic `HELP` command now shows SysOp commands if user is a SysOp.
        *   Broadcast messages are queued and delivered to users upon their next command.
    *   **File Areas (Metadata Only):**
        *   `file_areas` and `file_listings` tables created.
        *   `LISTFILEAREAS` command implemented.
        *   `UPLOADINFO <area> <filename> /// [desc]` (SysOp only) command to add file metadata.
        *   `LISTFILES [area]` command to list files in an area.
        *   `FILEDESC <file_id> /// <desc>` command for users/SysOps to edit file descriptions.
        *   `DOWNLOADINFO <file_id>` command to simulate a download and increment a counter.
    *   **Online Games (Number Guessing):**
        *   `games/numberGuess.js` module created with `startGame`, `handleGuess`, `quitGame` logic.
        *   `GAME` command (`LIST`, `NUMBERGUESS START`, `QUIT`) integrated into `bbsLogic.js` to manage game state within sessions.
        *   Input in `processInput` is routed to game handlers if a game is active.
    *   **Theming/Customization (Telnet ANSI Colors):**
        *   `user_preferences` table added for storing color choices.
        *   `SETCOLOR <element> <color>` command implemented.
        *   `COLOR_MAP`, `CUSTOMIZABLE_ELEMENTS`, `DEFAULT_COLORS`, and `getAppliedColor` helpers added to `bbsLogic.js`.
        *   Telnet prompt color and some command outputs (e.g., `WHO`, `LOOK` usernames/timestamps) now use user preferences or defaults.

7.  **Troubleshooting & Refinements:**
    *   **NPM Audit:** Addressed `npm audit` vulnerabilities by updating `package-lock.json` and, where necessary, specific package versions.
    *   **Build Script Errors:** Fixed errors in `build.js` (e.g., related to missing `docs/` directory after it was removed from build scope).
    *   **Git Synchronization:** Performed several forced updates (trivial changes to `README.md`) to help synchronize the repository view between the development environment and the user's view, addressing discrepancies in file structure (e.g., `core/` directory).
    *   **Command Dispatch & Parsing:** Reviewed and refined command parsing in `bbsLogic.js`, particularly for commands with complex arguments using `///` separators and for sub-actions (like `GAME <action>`), to ensure reliable dispatch and error handling. This addressed "Unknown command" errors reported in Telnet logs.
    *   **Error Handling & Input Validation:** Enhanced SQLite error logging in `bbsLogic.js` (adding `console.error` for DB errors while returning generic messages to users). Improved input validation for argument counts, numeric IDs (`isNaN`), and required fields across many commands.
    *   **Session Cleanup (`telnetServer.js`):** Made session cleanup more robust in 'close' and 'error' event handlers in the Telnet server.
    *   **Syntax Errors:** Fixed stray non-JavaScript markers (e.g., `[end of bbsLogic.js]`) that were causing parsing errors.
    *   **API 405 Error:** Diagnosed and fixed a 405 "Method Not Allowed" error for `/api/command` POST requests by correcting the `fetch` URL in `index.html` to use the absolute path `http://localhost:3001/api/command`.
    *   **Font Loading:** Investigated "OTS parsing error" for fonts. Identified that the `fonts/` directory was empty/missing, which was the root cause. The `build.js` was already adapted to copy fonts from `core/fonts/` during asset processing.

## Original Log Entries (Pre-Summary)

## 1. Project Setup and Initial Web Server
*   **Action:** Modified `server.js` to serve the primary `index.html` (BBS UI) from the project root instead of the `dist` directory. Ensured `style.css` was correctly linked. Created an empty `requirements.txt` as a placeholder.
*   **Rationale:** To quickly enable development and testing of the core web interface using the provided retro stylesheet.

## 2. Basic Telnet Server Implementation
*   **Action:** Created `telnetServer.js` using Node.js's `net` module. Implemented a basic TCP server listening on port 2323, sending a welcome message. Integrated its startup into `server.js`.
*   **Rationale:** To establish the foundation for Telnet access, a key requirement of the BBS.

## 3. Core BBS Logic - Shared Foundation
*   **Action:** Created `bbsLogic.js` to house shared functionalities: in-memory user session management, a command parser, in-memory message storage, and a central `processInput` function.
*   **Rationale:** To centralize core BBS logic, making it reusable for both web and Telnet interfaces, promoting consistency and easier maintenance.

## 4. Web Interface Enhancements & Server Communication
*   **Action:** Added `express` to `package.json`. Modified `server.js` to include an Express app handling a `/api/command` POST endpoint on port 3001. Updated `index.html`'s JavaScript to send commands to this endpoint and display responses, managing a `sessionId`.
*   **Rationale:** To make the web interface interactive, allowing users to send commands to the backend and see results, transforming it from a static page to a dynamic client.

## 5. Telnet Interface Enhancements
*   **Action:** Integrated `telnetServer.js` with `bbsLogic.js`. Implemented session creation for Telnet clients, command forwarding to `processInput`, and response handling. Added `QUIT` command and ensured correct Telnet line endings (`\r\n`).
*   **Rationale:** To make the Telnet interface fully functional, mirroring the capabilities being developed for the web interface.

## 6. Styling and ANSI Art
*   **Action:** Reviewed web styling to ensure `style.css` was applied correctly. Created an ANSI art welcome banner for `telnetServer.js`. Modified `bbsLogic.js` to add ANSI color codes to Telnet output for commands like `LOOK`, conditional on connection type.
*   **Rationale:** To enhance the visual appeal and retro aesthetic for both interfaces, improving user experience.

## 7. User Accounts (Basic)
*   **Action:** Implemented in-memory user storage in `bbsLogic.js`. Added `REGISTER`, `LOGIN`, and `LOGOUT` commands. Modified `SAY` to require login and use the session username. Added a `WHO` command to list active users. Updated `HELP` command.
*   **Rationale:** To introduce essential multi-user functionality, moving beyond a guest-only system.

## 8. Documentation and `requirements.txt`
*   **Action:** Created a `README.md` with project description, features, setup instructions, and command list. Confirmed `package.json` (especially `express` dependency) was up-to-date. `requirements.txt` remained empty as development focused on Node.js.
*   **Rationale:** To provide clear guidance for users and developers on how to set up, run, and use the BBS.

## 9. Integration with `thunderbird-esq.github.io` (Preparation)
*   **Action:** Added `cors` package and configured the Express API in `server.js` to use it. Modified `build.js` to create a `dist_bbs_client` directory containing all necessary web client assets (HTML, processed CSS, fonts/icons via `postcss-copy`), separate from the System.css documentation build.
*   **Rationale:** To prepare the BBS web client for deployment as part of a larger project (`thunderbird-esq.github.io`) by enabling cross-origin requests to the API and packaging client files neatly.
