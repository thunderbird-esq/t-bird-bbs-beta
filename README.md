# THUNDERBIRD BBS

A retro-themed Bulletin Board System (BBS) accessible via a web browser and Telnet clients, styled after classic Macintosh systems.

## Features

*   Web interface with a classic Macintosh look and feel.
*   Telnet access for traditional BBS experience.
*   User registration and login.
*   Message viewing (`LOOK`) and posting (`SAY`).
*   List active users (`WHO`).
*   Online help (`HELP`).
*   ANSI art and styling for Telnet.

## Requirements

*   Node.js (v14.x or later recommended)
*   npm (usually comes with Node.js)
*   A Telnet client (e.g., PuTTY, netcat, or built-in OS Telnet)

## Setup and Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/example/thunderbird-bbs.git
    cd thunderbird-bbs
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

## Running the Server

To start the BBS server, run:
```bash
node server.js
```
This will start:
*   The web server for the BBS interface. Access it at: `http://localhost:3000` (Note: This is served by `live-server`. The main application logic for commands is on port 3001).
*   The API server on: `http://localhost:3001/api/command`
*   The Telnet server on: `telnet localhost 2323`

## Available Commands

Once connected (either via web or Telnet):

*   `HELP`: Shows available commands.
*   `REGISTER <username> <password>`: Creates a new user account.
*   `LOGIN <username> <password>`: Logs into an existing account.
*   `LOGOUT`: Logs out of the current account.
*   `LOOK`: Displays recent messages.
*   `SAY <message>`: Posts a new message (requires login).
*   `WHO`: Shows a list of currently logged-in users.
*   `QUIT`: Disconnects your Telnet session. (Web users can just close the tab).
<!-- Jules: Forcing a refresh of the repo view -->
