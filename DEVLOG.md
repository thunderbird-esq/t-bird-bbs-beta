# Developer Log: THUNDERBIRD BBS Implementation

This document outlines the steps and rationale involved in the development of the THUNDERBIRD BBS system.

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
