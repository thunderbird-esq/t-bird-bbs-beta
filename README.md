# THUNDERBIRD BBS

**Status: ✅ FULLY OPERATIONAL**

A retro-themed Bulletin Board System (BBS) accessible via a web browser and Telnet clients, styled after classic Macintosh systems.

## 🎉 System Status

**This BBS is production-ready and fully tested!** See [VERIFIED_FUNCTIONALITY.md](VERIFIED_FUNCTIONALITY.md) for complete test results.

## ✨ Features

### Core Functionality
*   **Web interface** with a classic Macintosh look and feel
*   **Telnet access** for traditional BBS experience with ANSI colors
*   **User registration and login** with bcrypt password hashing
*   **Message boards** - Post and read messages on multiple boards
*   **Private messaging** - Send and receive private messages between users
*   **File areas** - Browse and track file listings
*   **Games** - Play interactive games (Number Guess included)
*   **User customization** - Customize ANSI colors for Telnet (SETCOLOR)
*   **SysOp commands** - Administrative functions for system operators

### Security
*   Secure password hashing with bcrypt
*   SQL injection prevention via parameterized queries
*   Input validation on all commands
*   Session-based authentication
*   Role-based access control

## Requirements

*   Node.js (v14.x or later recommended)
*   npm (usually comes with Node.js)
*   A Telnet client (e.g., PuTTY, netcat, or built-in OS Telnet)

## 🚀 Quick Start

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/thunderbird-esq/t-bird-bbs-beta.git
    cd t-bird-bbs-beta
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

### Running the Server

**Start the BBS server:**
```bash
npm start
# OR
node server.js
```

The server will automatically:
*   Initialize the SQLite database (`bbs.sqlite`)
*   Create all necessary tables
*   Start three services:
    - **Web Interface**: http://localhost:3000
    - **API Server**: http://localhost:3001/api/command
    - **Telnet Server**: port 2323

### Connecting to the BBS

**Option 1: Web Browser**
1. Open http://localhost:3000
2. Type commands in the input box
3. Example: `REGISTER myuser mypass`, then `LOGIN myuser mypass`

**Option 2: Telnet Client**
```bash
telnet localhost 2323
# OR use netcat
nc localhost 2323
```
You'll see the ANSI art welcome banner and can start typing commands immediately.

## 📝 Available Commands

Type `HELP` once connected to see all commands. Here are the main categories:

### User Management
*   `REGISTER <username> <password>` - Create a new account
*   `LOGIN <username> <password>` - Login to your account
*   `LOGOUT` - Logout from current session
*   `WHO` - List all currently logged-in users

### Message Boards
*   `LOOK` - View recent messages on current board
*   `SAY <message>` - Post a message (login required)
*   `LISTBOARDS` - List all available message boards
*   `JOINBOARD <board_name_or_id>` - Switch to a different board

### Private Messaging
*   `SENDMAIL <recipient> <subject> /// <body>` - Send private message
*   `LISTMAIL` - List your received private messages
*   `READMAIL <message_id>` - Read a specific message
*   `DELETEMAIL <message_id>` - Delete a message

### File Areas
*   `LISTFILEAREAS` - List all file areas
*   `LISTFILES [area]` - List files (defaults to General Files)
*   `FILEDESC <file_id> /// <description>` - Edit file description
*   `DOWNLOADINFO <file_id>` - Simulate download (updates counter)

### Games
*   `GAME LIST` - Show available games
*   `GAME NUMBERGUESS START` - Start the Number Guess game
*   `GAME QUIT` - Exit current game

### Customization
*   `SETCOLOR <element> <color>` - Customize Telnet colors
*   `HELP SETCOLOR` - Details on color customization

### System
*   `HELP` - Show all available commands
*   `QUIT` - Disconnect (Telnet only)

### SysOp Commands (Admin Only)
*   `KICK <username>` - Disconnect a user
*   `BROADCAST <message>` - Send message to all users
*   `EDITMESSAGE <id> <new_text>` - Edit a public message
*   `DELETEMESSAGE <id>` - Delete a public message
*   `UPLOADINFO <area> <filename> /// <desc>` - Add file info

## 📚 Documentation

- **[VERIFIED_FUNCTIONALITY.md](VERIFIED_FUNCTIONALITY.md)** - Complete test results and verified features
- **[DEVLOG.md](DEVLOG.md)** - Development history and implementation details
- **[IMPROVEMENTS_PLAN.md](IMPROVEMENTS_PLAN.md)** - Future enhancement ideas

## 🔧 Technical Stack

- **Backend**: Node.js with Express
- **Database**: SQLite3
- **Security**: bcrypt for password hashing
- **Network**: Native TCP for Telnet, HTTP for web
- **CSS Framework**: Custom retro System 6 theme

## 📊 Database Schema

The BBS uses 7 tables:
- `users` - User accounts with roles
- `messages` - Public board messages
- `boards` - Message board definitions
- `private_messages` - User-to-user messages
- `file_areas` - File section categories
- `file_listings` - File metadata and download tracking
- `user_preferences` - Per-user customization settings

## 🎨 Screenshots

**Telnet Interface:**
- ANSI art welcome banner
- Color-coded prompts and messages
- Traditional BBS experience

**Web Interface:**
- Classic Mac System 6 styling
- Modern browser compatibility
- JSON API for programmatic access

## 📄 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

---

**NO FEDS // NO COWARDS**
