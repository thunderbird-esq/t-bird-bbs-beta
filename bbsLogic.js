/**
 * @file Core logic for the BBS. Handles sessions, command parsing, and command execution.
 * Interacts with the database and game modules.
 */
const sessions = {}; // In-memory store for active user sessions.

const bcrypt = require('bcrypt');
const { getDb } = require('./database'); // Database utility functions.
const numberGuess = require('./games/numberGuess.js'); // Number Guess game module.
const saltRounds = 10; // Cost factor for bcrypt password hashing.
let globalBroadcastMessages = []; // In-memory queue for global broadcast messages.
let generalBoardCache = null; // Cache for 'General' board details.

// ANSI Color Constants & Mappings for Telnet output styling.
const COLOR_MAP = {
    'reset': '\x1B[0m',
    'black': '\x1B[30m', 'red': '\x1B[31m', 'green': '\x1B[32m', 'yellow': '\x1B[33m',
    'blue': '\x1B[34m', 'magenta': '\x1B[35m', 'cyan': '\x1B[36m', 'white': '\x1B[37m',
    'bright_black': '\x1B[1;30m', 'bright_red': '\x1B[1;31m', 'bright_green': '\x1B[1;32m', 'bright_yellow': '\x1B[1;33m',
    'bright_blue': '\x1B[1;34m', 'bright_magenta': '\x1B[1;35m', 'bright_cyan': '\x1B[1;36m', 'bright_white': '\x1B[1;37m',
};
const AVAILABLE_COLORS = Object.keys(COLOR_MAP).filter(c => c !== 'reset');
const CUSTOMIZABLE_ELEMENTS = {
    'prompt': 'The command prompt symbol (e.g., >)',
    'username': 'Usernames in messages, lists, etc.',
    'timestamp': 'Timestamps in messages, lists, etc.'
};
const DEFAULT_COLORS = {
    prompt: COLOR_MAP.bright_green,
    username_output: COLOR_MAP.bright_yellow,
    timestamp_output: COLOR_MAP.cyan,
};

/**
 * Retrieves the ANSI color code for a given UI element type based on user preferences or defaults.
 * @param {object} session - The user's session object.
 * @param {string} elementType - E.g., 'prompt', 'username_output', 'timestamp_output'.
 * @returns {string} The ANSI color code.
 */
function getAppliedColor(session, elementType) {
    const colorName = (session && session.prefs && session.prefs[elementType])
                    ? session.prefs[elementType]
                    : Object.keys(COLOR_MAP).find(name => COLOR_MAP[name] === DEFAULT_COLORS[elementType]) || 'white';
    return COLOR_MAP[colorName] || COLOR_MAP.white;
}

/**
 * Initializes the cache for the 'General' board details.
 * @async
 */
async function initializeGeneralBoardCache() {
  const db = getDb();
  if (!db) {
      console.error("FATAL: Database not available for initializeGeneralBoardCache.");
      return;
  }
  try {
    const row = await new Promise((resolve, reject) => {
      db.get("SELECT id, name FROM boards WHERE name = 'General'", [], (err, row) => {
        if (err) { console.error("SQLite Error (initializeGeneralBoardCache):", err.message); reject(err); }
        else resolve(row);
      });
    });
    if (row) {
      generalBoardCache = { id: row.id, name: row.name };
      console.log('General board cache initialized:', generalBoardCache);
    } else {
      console.error('FATAL: Could not initialize General board cache. "General" board not found in database.');
    }
  } catch (err) {
    console.error('FATAL: Database error during General board cache initialization.', err);
  }
}

/**
 * Checks if the user is a SysOp.
 * @param {object} session - The user's session object.
 * @returns {boolean} True if SysOp, false otherwise.
 */
function isSysOp(session) {
  return session && session.userRole === 'sysop';
}

/**
 * Sets the default board for a session using the cache.
 * @param {object} session - The user's session object.
 */
function setDefaultBoardForSession(session) {
  if (generalBoardCache) {
    session.currentBoardId = generalBoardCache.id;
    session.currentBoardName = generalBoardCache.name;
  } else {
    console.error('setDefaultBoardForSession: General board cache not initialized! Defaulting to ID 1 / "General".');
    session.currentBoardId = 1;
    session.currentBoardName = 'General';
  }
}

/**
 * Generates a unique session ID.
 * @returns {string} A unique session identifier.
 */
function generateUniqueId() {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Creates a new user session.
 * @param {string} connectionType - 'web' or 'telnet'.
 * @returns {string} The new session ID.
 */
function createSession(connectionType) {
  const sessionId = generateUniqueId();
  const defaultPrefs = {};
  for (const el in DEFAULT_COLORS) {
      const defaultColorName = Object.keys(COLOR_MAP).find(name => COLOR_MAP[name] === DEFAULT_COLORS[el]);
      defaultPrefs[el] = defaultColorName || 'white';
  }
  const session = {
    username: 'guest', loggedIn: false, connectionType,
    currentBoardId: undefined, currentBoardName: undefined,
    lastSeenBroadcastIndex: globalBroadcastMessages.length > 0 ? globalBroadcastMessages.length - 1 : -1,
    currentGame: null, prefs: defaultPrefs,
  };
  sessions[sessionId] = session;
  setDefaultBoardForSession(session);
  console.log(`Session created: ${sessionId} (${connectionType}), board: ${session.currentBoardName}, lastSeenBroadcast: ${session.lastSeenBroadcastIndex}`);
  return sessionId;
}

/**
 * Retrieves an active session.
 * @param {string} sessionId - The session ID.
 * @returns {object | undefined} The session object or undefined.
 */
function getSession(sessionId) {
  return sessions[sessionId];
}

/**
 * Ends a user session.
 * @param {string} sessionId - The session ID.
 * @returns {boolean} True if session was ended, false otherwise.
 */
function endSession(sessionId) {
  if (sessions[sessionId]) {
    if (sessions[sessionId].currentGame && sessions[sessionId].currentGame.name === 'numberGuess') {
        numberGuess.quitGame(sessions[sessionId]);
    }
    console.log(`Session ended: ${sessionId}`);
    delete sessions[sessionId];
    return true;
  }
  return false;
}

/**
 * Parses an input string into a command and arguments.
 * @param {string} inputString - The raw user input.
 * @returns {{command: string, args: string[]}} Parsed command (uppercase) and arguments.
 */
function parseCommand(inputString) {
  if (!inputString || inputString.trim() === '') {
    return { command: '', args: [] };
  }
  const parts = inputString.trim().split(/\s+/);
  const command = parts[0].toUpperCase();
  const args = parts.slice(1);
  return { command, args };
}

/**
 * Main command processing function.
 * @async
 * @param {string} sessionId - The user's session ID.
 * @param {string} inputString - The raw command string.
 * @returns {Promise<string>} The response string.
 */
async function processInput(sessionId, inputString) {
  const session = getSession(sessionId);
  if (!session) {
    console.error(`processInput: Invalid session ID received: ${sessionId}`);
    return "Your session is invalid or has expired. Please log in again.\n";
  }

  // If a game is active, route input to the game module.
  if (session.currentGame) {
    if (session.currentGame.name === 'numberGuess') {
      const lowerInput = inputString.toLowerCase().trim();
      if (lowerInput === 'quit' || lowerInput === 'exit') {
        return numberGuess.quitGame(session);
      }
      return numberGuess.handleGuess(session, inputString);
    }
    // Future: else if (session.currentGame.name === 'otherGame') { ... }
  }

  const parsedCommand = parseCommand(inputString); // Standard parsing for BBS commands.
  const { command: cmd, args } = parsedCommand;
  const isTelnet = session.connectionType === 'telnet';
  const db = getDb();

  let responseString = "";
  let broadcastsToPrepend = "";

  // Prepend new broadcast messages.
  if (globalBroadcastMessages.length > 0) {
    const newMessagesStartIdx = session.lastSeenBroadcastIndex + 1;
    if (newMessagesStartIdx < globalBroadcastMessages.length) {
      for (let i = newMessagesStartIdx; i < globalBroadcastMessages.length; i++) {
        const broadcast = globalBroadcastMessages[i];
        const formattedTimestamp = new Date(broadcast.timestamp).toLocaleTimeString();
        broadcastsToPrepend += isTelnet ?
            `${ANSI_BRIGHT}${ANSI_MAGENTA}[BROADCAST ${formattedTimestamp}]${COLOR_MAP.reset} ${broadcast.text}\n` :
            `[BROADCAST ${formattedTimestamp}] ${broadcast.text}\n`;
      }
      session.lastSeenBroadcastIndex = globalBroadcastMessages.length - 1;
    }
  }

  // Main command dispatch using switch.
  // Each case should set responseString and break, or return directly (e.g., LOGIN success).
  switch (cmd) {
    case 'REGISTER':
      if (args.length !== 2) {
        responseString = "Usage: REGISTER <username> <password>\n";
        break;
      }
      // ... (rest of REGISTER logic remains, with existing error handling)
      const regUsername = args[0];
      const regPassword = args[1];
      try {
        const existingUser = await new Promise((resolve, reject) => {
          db.get("SELECT * FROM users WHERE username = ?", [regUsername], (err, row) => {
            if (err) { console.error("SQLite Error (REGISTER get user):", err.message); reject(err); }
            else resolve(row);
          });
        });
        if (existingUser) { responseString = "Username already taken. Please try another.\n"; break; }
        const hash = await bcrypt.hash(regPassword, saltRounds);
        const registrationDate = new Date().toISOString();
        await new Promise((resolve, reject) => {
          db.run("INSERT INTO users (username, password_hash, registration_date) VALUES (?, ?, ?)",
                 [regUsername, hash, registrationDate], function(err) {
            if (err) { console.error("SQLite Error (REGISTER insert user):", err.message); reject(err); }
            else resolve(this);
          });
        });
        responseString = "Registration successful. You can now LOGIN.\n";
      } catch (dbErr) {
        console.error("Database error in command: REGISTER", dbErr);
        responseString = "Registration failed. A database error occurred.\n";
      }
      break;

    case 'LOGIN':
      if (args.length !== 2) {
        responseString = "Usage: LOGIN <username> <password>\n";
        break;
      }
      // ... (rest of LOGIN logic remains, with existing error handling and special return for broadcasts)
      const loginUsername = args[0];
      const loginPassword = args[1];
      try {
        const user = await new Promise((resolve, reject) => {
          db.get("SELECT * FROM users WHERE username = ?", [loginUsername], (err, row) => {
            if (err) { console.error("SQLite Error (LOGIN get user):", err.message); reject(err); }
            else resolve(row);
          });
        });
        if (user) {
          const match = await bcrypt.compare(loginPassword, user.password_hash);
          if (match) {
            session.username = user.username; session.loggedIn = true; session.userId = user.id; session.userRole = user.role;
            setDefaultBoardForSession(session);
            session.prefs = {};
            for (const el in DEFAULT_COLORS) {
                const defaultColorName = Object.keys(COLOR_MAP).find(name => COLOR_MAP[name] === DEFAULT_COLORS[el]);
                session.prefs[el] = defaultColorName || 'white';
            }
            const userPrefsRow = await new Promise((resolve, reject) => {
                db.get("SELECT * FROM user_preferences WHERE user_id = ?", [session.userId], (err, row) => {
                    if (err) { console.error("SQLite Error (LOGIN get prefs):", err.message); reject(err); }
                    else resolve(row);
                });
            });
            if (userPrefsRow) {
                if (userPrefsRow.color_prompt && AVAILABLE_COLORS.includes(userPrefsRow.color_prompt)) session.prefs.prompt = userPrefsRow.color_prompt;
                if (userPrefsRow.color_username_output && AVAILABLE_COLORS.includes(userPrefsRow.color_username_output)) session.prefs.username_output = userPrefsRow.color_username_output;
                if (userPrefsRow.color_timestamp_output && AVAILABLE_COLORS.includes(userPrefsRow.color_timestamp_output)) session.prefs.timestamp_output = userPrefsRow.color_timestamp_output;
            }
            let loginMessage = `Welcome, ${user.username}! Login successful. Current board: ${session.currentBoardName}\n`;
            const unreadMail = await new Promise((resolve, reject) => {
              db.get("SELECT COUNT(*) AS unread_count FROM private_messages WHERE recipient_id = ? AND is_read = 0",
                     [session.userId], (err, row) => {
                if (err) { console.error("SQLite Error (LOGIN count mail):", err.message); reject(err); }
                else resolve(row);
              });
            });
            if (unreadMail && unreadMail.unread_count > 0) {
              loginMessage += `You have ${unreadMail.unread_count} unread private message(s). Type LISTMAIL to read.\n`;
            }
            console.log(`User ${user.username} logged in, set to board: ${session.currentBoardName}`);
            return loginMessage + broadcastsToPrepend;
          }
        }
        responseString = "Invalid username or password.\n";
      } catch (dbErr) {
        console.error("Database error in command: LOGIN", dbErr);
        responseString = "Login failed. A database error occurred.\n";
      }
      break;

    case 'LOGOUT':
      // ... (existing LOGOUT logic)
      session.username = 'guest'; session.loggedIn = false; delete session.userId; delete session.userRole;
      if(session.currentGame) { delete session.currentGame; console.log(`Game state cleared for session ${sessionId} due to LOGOUT.`); }
      session.prefs = {};
      for (const el in DEFAULT_COLORS) {
          const defaultColorName = Object.keys(COLOR_MAP).find(name => COLOR_MAP[name] === DEFAULT_COLORS[el]);
          session.prefs[el] = defaultColorName || 'white';
      }
      setDefaultBoardForSession(session);
      responseString = "You have been logged out.\n";
      break;

    case 'LOOK':
      // ... (existing LOOK logic with refactored list generation and color application)
      const lookBoardId = session.currentBoardId || 1;
      const lookBoardName = session.currentBoardName || 'General';
      try {
        const messages = await new Promise((resolve, reject) => {
          const query = `
            SELECT m.body, m.timestamp, u.username
            FROM messages m JOIN users u ON m.user_id = u.id
            WHERE m.board_id = ? ORDER BY m.timestamp DESC LIMIT 10;`;
          db.all(query, [lookBoardId], (err, queryRows) => {
            if (err) { console.error("SQLite Error (LOOK get messages):", err.message); reject(err); }
            else resolve(queryRows);
          });
        });
        const responseLines = [];
        responseLines.push(`Messages in [${lookBoardName}]:`);
        if (messages.length === 0) { responseLines.push("No messages yet on this board."); }
        else {
          const userColor = isTelnet ? getAppliedColor(session, 'username_output') : '';
          const timeColor = isTelnet ? getAppliedColor(session, 'timestamp_output') : '';
          const resetColor = isTelnet ? COLOR_MAP.reset : '';
          messages.forEach(msg => {
            const localTimestamp = new Date(msg.timestamp).toLocaleTimeString();
            responseLines.push(isTelnet ?
                `${timeColor}[${localTimestamp}]${resetColor} ${userColor}${msg.username}${resetColor}: ${msg.body}` :
                `[${localTimestamp}] ${msg.username}: ${msg.body}`);
          });
        }
        responseString = responseLines.join('\n') + '\n';
      } catch (dbErr) {
        console.error("Database error in command: LOOK", dbErr);
        responseString = `Error retrieving messages. A database error occurred.\n`;
      }
      break;

    case 'SAY':
      // ... (existing SAY logic with input validation and error handling)
      if (!session.loggedIn || !session.userId) { responseString = "You must be logged in to use the SAY command.\nUsage: LOGIN <username> <password>\n"; break; }
      const messageBody = args.join(' ').trim();
      if (!messageBody) { responseString = "Usage: SAY <message>\nMessage cannot be empty.\n"; break; }
      const currentTimestamp = new Date().toISOString();
      const sayBoardId = session.currentBoardId || 1;
      try {
        await new Promise((resolve, reject) => {
          db.run("INSERT INTO messages (board_id, user_id, body, timestamp) VALUES (?, ?, ?, ?)",
                 [sayBoardId, session.userId, messageBody, currentTimestamp], function(err) {
            if (err) { console.error("SQLite Error (SAY insert message):", err.message); reject(err); }
            else resolve(this);
          });
        });
        responseString = "Message posted.\n";
      } catch (dbErr) {
        console.error("Database error in command: SAY", dbErr);
        responseString = "Failed to post message. A database error occurred.\n";
      }
      break;

    case 'WHO':
      // ... (existing WHO logic with refactored list generation and color application)
      const loggedInUsernames = Object.values(sessions).filter(s => s.loggedIn).map(s => s.username);
      const whoResponseLines = [];
      if (loggedInUsernames.length === 0) { whoResponseLines.push("No users currently logged in."); }
      else {
        whoResponseLines.push("Active users:");
        const usernameColor = isTelnet ? getAppliedColor(session, 'username_output') : '';
        const resetColor = isTelnet ? COLOR_MAP.reset : '';
        loggedInUsernames.forEach(username => whoResponseLines.push(isTelnet ? `  ${usernameColor}${username}${resetColor}` : `  ${username}`));
      }
      responseString = whoResponseLines.join('\n') + '\n';
      break;

    case 'LISTBOARDS':
        // ... (existing LISTBOARDS logic with refactored list generation)
        try {
            const boards = await new Promise((resolve, reject) => {
              db.all("SELECT id, name, description FROM boards ORDER BY id", [], (err, queryRows) => {
                if (err) { console.error("SQLite Error (LISTBOARDS):", err.message); reject(err); }
                else resolve(queryRows);
              });
            });
            const responseLines = [];
            if (boards.length === 0) { responseLines.push("No message boards available."); }
            else {
                responseLines.push("Available Message Boards:");
                boards.forEach(b => {
                    responseLines.push(isTelnet ?
                        `${ANSI_CYAN}${b.id}.${COLOR_MAP.reset} ${ANSI_BRIGHT}${ANSI_YELLOW}${b.name}${COLOR_MAP.reset} - ${b.description || 'No description'}` :
                        `${b.id}. ${b.name} - ${b.description || 'No description'}`);
                });
            }
            responseString = responseLines.join('\n') + '\n';
          } catch (dbErr) {
            console.error("Database error in command: LISTBOARDS", dbErr);
            responseString = "Error retrieving message boards. A database error occurred.\n";
          }
        break;

    case 'JOINBOARD':
        // ... (existing JOINBOARD logic with input validation)
        if (args.length !== 1) { responseString = "Usage: JOINBOARD <board_name_or_id>\n"; break; }
        const boardIdentifier = args[0];
        let joinBoardQuery, joinBoardParams;
        if (isNaN(parseInt(boardIdentifier))) { joinBoardQuery = "SELECT id, name FROM boards WHERE name = ?"; joinBoardParams = [boardIdentifier]; }
        else { joinBoardQuery = "SELECT id, name FROM boards WHERE id = ?"; joinBoardParams = [parseInt(boardIdentifier)]; }
        try {
            const board = await new Promise((resolve, reject) => {
              db.get(joinBoardQuery, joinBoardParams, (err, row) => {
                if (err) { console.error("SQLite Error (JOINBOARD get board):", err.message); reject(err); }
                else resolve(row);
              });
            });
            if (board) { session.currentBoardId = board.id; session.currentBoardName = board.name; responseString = `Joined board: ${board.name}.\n`; }
            else { responseString = "Board not found.\n"; }
          } catch (dbErr) {
            console.error("Database error in command: JOINBOARD", dbErr);
            responseString = "Error finding board. A database error occurred.\n";
          }
        break;

    case 'SENDMAIL':
        // ... (existing SENDMAIL logic with refined parsing and error handling)
        if (!session.loggedIn || !session.userId) { responseString = "You must be logged in to send mail.\n"; break; }
        const mailArgsString = inputString.substring(cmd.length + 1).trim();
        const firstSpaceIndex = mailArgsString.indexOf(' ');
        if (firstSpaceIndex === -1) { responseString = "Usage: SENDMAIL <recipient_username> <subject> /// [message_body]\n"; break; }
        const recipientUsername = mailArgsString.substring(0, firstSpaceIndex);
        const subjectAndBodyString = mailArgsString.substring(firstSpaceIndex + 1).trim();
        const separator = '///'; const separatorIndex = subjectAndBodyString.indexOf(separator);
        let mailSubject, mailBody;
        if (separatorIndex === -1) { mailSubject = subjectAndBodyString.trim(); mailBody = ''; }
        else { mailSubject = subjectAndBodyString.substring(0, separatorIndex).trim(); mailBody = subjectAndBodyString.substring(separatorIndex + separator.length).trim(); }
        if (!recipientUsername || !mailSubject) { responseString = "Usage: SENDMAIL <recipient_username> <subject> /// [message_body]\nRecipient and subject are required.\n"; break; }
        try {
            const recipient = await new Promise((resolve, reject) => {
              db.get("SELECT id FROM users WHERE username = ?", [recipientUsername], (err, row) => {
                if (err) { console.error("SQLite Error (SENDMAIL get recipient):", err.message); reject(err); }
                else resolve(row);
              });
            });
            if (!recipient) { responseString = `Recipient user '${recipientUsername}' not found.\n`; break; }
            const senderId = session.userId; const recipientId = recipient.id; const mailTimestamp = new Date().toISOString();
            await new Promise((resolve, reject) => {
              db.run("INSERT INTO private_messages (sender_id, recipient_id, subject, body, timestamp, is_read) VALUES (?, ?, ?, ?, ?, 0)",
                     [senderId, recipientId, mailSubject, mailBody, mailTimestamp], function(err) {
                if (err) { console.error("SQLite Error (SENDMAIL insert mail):", err.message); reject(err); }
                else resolve(this);
              });
            });
            responseString = "Message sent successfully.\n";
          } catch (dbErr) {
            console.error("Database error in command: SENDMAIL", dbErr);
            responseString = "Failed to send message. A database error occurred.\n";
          }
        break;

    case 'LISTMAIL':
        // ... (existing LISTMAIL logic with refactored list generation)
        if (!session.loggedIn || !session.userId) { responseString = "You must be logged in to list your mail.\n"; break; }
        try {
            const mails = await new Promise((resolve, reject) => {
              const mailQuery = `
                SELECT pm.id, pm.subject, pm.timestamp, pm.is_read, u.username AS sender_username
                FROM private_messages pm JOIN users u ON pm.sender_id = u.id
                WHERE pm.recipient_id = ? ORDER BY pm.timestamp DESC;`;
              db.all(mailQuery, [session.userId], (err, queryRows) => {
                if (err) { console.error("SQLite Error (LISTMAIL):", err.message); reject(err); }
                else resolve(queryRows);
              });
            });
            const responseLines = [];
            responseLines.push("Your Private Messages:");
            if (mails.length === 0) { responseLines.push("You have no private messages."); }
            else {
                mails.forEach(m => {
                    const unreadMarker = m.is_read ? '  ' : (isTelnet ? `${ANSI_BRIGHT}${ANSI_GREEN}* ${COLOR_MAP.reset}` : '* ');
                    const formattedTimestamp = new Date(m.timestamp).toLocaleString();
                    responseLines.push(isTelnet ?
                        `${unreadMarker}${ANSI_CYAN}${m.id}:${COLOR_MAP.reset} From: ${ANSI_YELLOW}${m.sender_username}${COLOR_MAP.reset} Sub: ${m.subject} (${formattedTimestamp})` :
                        `${unreadMarker}${m.id}: From: ${m.sender_username} Sub: ${m.subject} (${formattedTimestamp})`);
                });
            }
            responseString = responseLines.join('\n') + '\n';
          } catch (dbErr) {
            console.error("Database error in command: LISTMAIL", dbErr);
            responseString = "Error retrieving private messages. A database error occurred.\n";
          }
        break;

    case 'READMAIL':
        // ... (existing READMAIL logic with input validation)
        if (!session.loggedIn || !session.userId) { responseString = "You must be logged in to read mail.\n"; break; }
        if (args.length !== 1) { responseString = "Usage: READMAIL <message_id>\n"; break; }
        const messageIdToRead = parseInt(args[0]);
        if (isNaN(messageIdToRead)) { responseString = "Invalid message ID. Please provide a number.\nUsage: READMAIL <message_id>\n"; break; }
        try {
            const message = await new Promise((resolve, reject) => {
              const mailReadQuery = `
                SELECT pm.id, pm.subject, pm.body, pm.timestamp, pm.is_read, u.username AS sender_username
                FROM private_messages pm JOIN users u ON pm.sender_id = u.id
                WHERE pm.id = ? AND pm.recipient_id = ?;`;
              db.get(mailReadQuery, [messageIdToRead, session.userId], (err, row) => {
                if (err) { console.error("SQLite Error (READMAIL get mail):", err.message); reject(err); }
                else resolve(row);
              });
            });
            if (!message) { responseString = "Message not found or access denied.\n"; break; }
            if (!message.is_read) {
              await new Promise((resolve, reject) => {
                db.run("UPDATE private_messages SET is_read = 1 WHERE id = ?", [messageIdToRead], function(err) {
                  if (err) { console.error("SQLite Error (READMAIL update is_read):", err.message); reject(err); }
                  else resolve(this);
                });
              });
            }
            responseString = `From: ${message.sender_username}\nSubject: ${message.subject}\nDate: ${new Date(message.timestamp).toLocaleString()}\n\n${message.body}\n`;
          } catch (dbErr) {
            console.error("Database error in command: READMAIL", dbErr);
            responseString = "Error retrieving message. A database error occurred.\n";
          }
        break;

    case 'DELETEMAIL':
        // ... (existing DELETEMAIL logic with input validation)
        if (!session.loggedIn || !session.userId) { responseString = "You must be logged in to delete mail.\n"; break; }
        if (args.length !== 1) { responseString = "Usage: DELETEMAIL <message_id>\n"; break; }
        const messageIdToDelete = parseInt(args[0]);
        if (isNaN(messageIdToDelete)) { responseString = "Invalid message ID. Please provide a number.\nUsage: DELETEMAIL <message_id>\n"; break; }
        try {
            const result = await new Promise((resolve, reject) => {
              db.run("DELETE FROM private_messages WHERE id = ? AND recipient_id = ?",
                     [messageIdToDelete, session.userId], function(err) {
                if (err) { console.error("SQLite Error (DELETEMAIL):", err.message); reject(err); }
                else resolve({ changes: this.changes });
              });
            });
            if (result.changes > 0) { responseString = "Message deleted.\n"; }
            else { responseString = "Message not found or access denied.\n"; }
          } catch (dbErr) {
            console.error("Database error in command: DELETEMAIL", dbErr);
            responseString = "Error deleting message. A database error occurred.\n";
          }
        break;

    // --- SysOp Commands ---
    case 'KICK':
        // ... (existing KICK logic with input validation)
        if (!isSysOp(session)) { responseString = "Access denied.\n"; break; }
        if (args.length !== 1) { responseString = "Usage: KICK <username>\n"; break; }
        const userToKick = args[0].trim();
        if (!userToKick) { responseString = "Username cannot be empty.\nUsage: KICK <username>\n"; break; }
        let kicked = false;
        for (const [sid, targetSession] of Object.entries(sessions)) {
            if (targetSession.username === userToKick && targetSession.loggedIn) {
              if (sid === sessionId) { responseString = "You cannot kick yourself.\n"; kicked = true; break; }
              delete sessions[sid]; responseString = `User ${userToKick} has been kicked. Their session is invalidated.\n`; kicked = true; break;
            }
        }
        if (!kicked) { responseString = `User ${userToKick} not found or not currently logged in.\n`; }
        break;

    case 'BROADCAST':
        // ... (existing BROADCAST logic with input validation)
        if (!isSysOp(session)) { responseString = "Access denied.\n"; break; }
        const broadcastMessageText = args.join(' ').trim();
        if (!broadcastMessageText) { responseString = "Usage: BROADCAST <message>\nMessage cannot be empty.\n"; break; }
        globalBroadcastMessages.push({ text: broadcastMessageText, timestamp: new Date() });
        responseString = "Broadcast message sent.\n";
        break;

    case 'EDITMESSAGE':
        // ... (existing EDITMESSAGE logic with input validation)
        if (!isSysOp(session)) { responseString = "Access denied.\n"; break; }
        if (args.length < 2) { responseString = "Usage: EDITMESSAGE <message_id> <new_text>\n"; break; }
        const editMessageId = parseInt(args[0]);
        const newText = args.slice(1).join(' ').trim();
        if (isNaN(editMessageId)) { responseString = "Invalid message ID. Please provide a number.\nUsage: EDITMESSAGE <message_id> <new_text>\n"; break; }
        if (!newText){ responseString = "New message text cannot be empty.\nUsage: EDITMESSAGE <message_id> <new_text>\n"; break; }
        try {
            const result = await new Promise((resolve, reject) => {
              db.run("UPDATE messages SET body = ? WHERE id = ?", [newText, editMessageId], function(err) {
                if (err) { console.error("SQLite Error (EDITMESSAGE):", err.message); reject(err); }
                else resolve({ changes: this.changes });
              });
            });
            if (result.changes > 0) { responseString = "Message updated.\n"; }
            else { responseString = "Message not found.\n"; }
          } catch (dbErr) {
            console.error("Database error in command: EDITMESSAGE", dbErr);
            responseString = "Error updating message. A database error occurred.\n";
          }
        break;

    case 'DELETEMESSAGE':
        // ... (existing DELETEMESSAGE logic with input validation)
        if (!isSysOp(session)) { responseString = "Access denied.\n"; break; }
        if (args.length !== 1) { responseString = "Usage: DELETEMESSAGE <message_id>\n"; break; }
        const deletePublicMessageId = parseInt(args[0]);
        if (isNaN(deletePublicMessageId)) { responseString = "Invalid message ID. Please provide a number.\nUsage: DELETEMESSAGE <message_id>\n"; break; }
        try {
            const result = await new Promise((resolve, reject) => {
              db.run("DELETE FROM messages WHERE id = ?", [deletePublicMessageId], function(err) {
                if (err) { console.error("SQLite Error (DELETEMESSAGE):", err.message); reject(err); }
                else resolve({ changes: this.changes });
              });
            });
            if (result.changes > 0) { responseString = "Message deleted from board.\n"; }
            else { responseString = "Message not found on board.\n"; }
          } catch (dbErr) {
            console.error("Database error in command: DELETEMESSAGE", dbErr);
            responseString = "Error deleting message. A database error occurred.\n";
          }
        break;

    // --- File Section Commands ---
    case 'LISTFILEAREAS':
        // ... (existing LISTFILEAREAS logic with refactored list generation)
        try {
            const areas = await new Promise((resolve, reject) => {
              db.all("SELECT id, name, description FROM file_areas ORDER BY id", [], (err, queryRows) => {
                if (err) { console.error("SQLite Error (LISTFILEAREAS):", err.message); reject(err); }
                else resolve(queryRows);
              });
            });
            const responseLines = [];
            responseLines.push("Available File Areas:");
            if (areas.length === 0) { responseLines.push("No file areas available."); }
            else {
                areas.forEach(a => {
                    responseLines.push(isTelnet ?
                        `${ANSI_CYAN}${a.id}.${COLOR_MAP.reset} ${ANSI_BRIGHT}${ANSI_YELLOW}${a.name}${COLOR_MAP.reset} - ${a.description || 'No description'}` :
                        `${a.id}. ${a.name} - ${a.description || 'No description'}`);
                });
            }
            responseString = responseLines.join('\n') + '\n';
          } catch (dbErr) {
            console.error("Database error in command: LISTFILEAREAS", dbErr);
            responseString = "Error retrieving file areas. A database error occurred.\n";
          }
        break;

    case 'UPLOADINFO':
        // ... (existing UPLOADINFO logic with refined parsing and error handling)
        if (!isSysOp(session)) { responseString = "Access denied.\n"; break; }
        const uploadInfoFullArgs = inputString.substring(cmd.length + 1).trim();
        const uploadInfoParts = uploadInfoFullArgs.split(' ');
        if (uploadInfoParts.length < 2) { responseString = "Usage: UPLOADINFO <area_name_or_id> <filename> /// [description]\n"; break; }
        const areaRef = uploadInfoParts[0];
        const filename = uploadInfoParts[1].trim();
        let uploadDescription = "";
        const uploadDescSeparatorStr = "///";
        const uploadBaseCommandString = `${cmd} ${areaRef} ${filename}`;
        let uploadRestOfStringForDesc = "";
        if(inputString.toUpperCase().startsWith(uploadBaseCommandString.toUpperCase())) {
            uploadRestOfStringForDesc = inputString.substring(uploadBaseCommandString.length).trim();
        }
        const uploadSeparatorActualIndex = uploadRestOfStringForDesc.indexOf(uploadDescSeparatorStr);
        if (uploadSeparatorActualIndex !== -1) {
            uploadDescription = uploadRestOfStringForDesc.substring(uploadSeparatorActualIndex + uploadDescSeparatorStr.length).trim();
        }
        if (!filename) { responseString = "Filename cannot be empty.\nUsage: UPLOADINFO <area_name_or_id> <filename> /// [description]\n"; break; }
        try {
            let areaQuery, areaParams;
            if (isNaN(parseInt(areaRef))) { areaQuery = "SELECT id FROM file_areas WHERE name = ?"; areaParams = [areaRef]; }
            else { areaQuery = "SELECT id FROM file_areas WHERE id = ?"; areaParams = [parseInt(areaRef)]; }
            const area = await new Promise((resolve, reject) => {
              db.get(areaQuery, areaParams, (err, row) => {
                if (err) { console.error("SQLite Error (UPLOADINFO get area):", err.message); reject(err); }
                else resolve(row);
              });
            });
            if (!area) { responseString = "File area not found.\n"; break; }
            const areaId = area.id; const uploaderUserId = session.userId; const uploadDate = new Date().toISOString();
            await new Promise((resolve, reject) => {
              db.run("INSERT INTO file_listings (area_id, filename, description, uploader_user_id, upload_date) VALUES (?, ?, ?, ?, ?)",
                     [areaId, filename, uploadDescription, uploaderUserId, uploadDate], function(err) {
                if (err) {
                  if (err.message.includes("UNIQUE constraint failed")) { reject(new Error(`Filename '${filename}' already exists in this area.`)); }
                  else { console.error("SQLite Error (UPLOADINFO insert file):", err.message); reject(err); }
                } else { resolve(this); }
              });
            });
            responseString = "File information uploaded successfully.\n";
          } catch (dbErr) {
            console.error("Database error in command: UPLOADINFO", dbErr);
            responseString = dbErr.message.startsWith("Filename already exists") ? dbErr.message : "Error uploading file information. A database error occurred.\n";
          }
        break;

    case 'LISTFILES':
        // ... (existing LISTFILES logic with refactored list generation and error handling)
        let listFilesAreaId; let listFilesAreaName = "General Files";
        if (args.length === 0) {
            try {
              const generalFilesArea = await new Promise((resolve, reject) => {
                db.get("SELECT id, name FROM file_areas WHERE name = 'General Files'", [], (err, row) => {
                  if (err) { console.error("SQLite Error (LISTFILES get default area):", err.message); reject(err); }
                  else resolve(row);
                });
              });
              if (generalFilesArea) { listFilesAreaId = generalFilesArea.id; listFilesAreaName = generalFilesArea.name; }
              else { console.warn("'General Files' area not found in DB for LISTFILES default."); responseString = "Default 'General Files' area not found. Please specify an area or contact SysOp.\n"; break; }
            } catch (dbErr) { console.error("Database error in command: LISTFILES (default area lookup)", dbErr); responseString = "Error finding default file area. A database error occurred.\n"; break; }
        } else if (args.length === 1) {
            const areaFileRef = args[0]; let areaFileQuery, areaFileParams;
            if (isNaN(parseInt(areaFileRef))) { areaFileQuery = "SELECT id, name FROM file_areas WHERE name = ?"; areaFileParams = [areaFileRef]; }
            else { areaFileQuery = "SELECT id, name FROM file_areas WHERE id = ?"; areaFileParams = [parseInt(areaFileRef)]; }
            try {
              const area = await new Promise((resolve, reject) => {
                db.get(areaFileQuery, areaFileParams, (err, row) => {
                  if (err) { console.error("SQLite Error (LISTFILES get specified area):", err.message); reject(err); }
                  else resolve(row);
                });
              });
              if (area) { listFilesAreaId = area.id; listFilesAreaName = area.name; }
              else { responseString = "File area not found.\n"; break; }
            } catch (dbErr) { console.error("Database error in command: LISTFILES (specified area lookup)", dbErr); responseString = "Error finding specified file area. A database error occurred.\n"; break; }
        } else { responseString = "Usage: LISTFILES [area_name_or_id]\n(Too many arguments provided)\n"; break; }
        if (typeof listFilesAreaId === 'undefined') { console.error("LISTFILES: areaId was not determined prior to file query."); responseString = "Could not determine file area to list. Please try again or specify an area.\n"; break; }
        try {
            const files = await new Promise((resolve, reject) => {
              const query = `
                SELECT fl.id, fl.filename, fl.description, fl.download_count, u.username AS uploader_username, fl.upload_date
                FROM file_listings fl JOIN users u ON fl.uploader_user_id = u.id
                WHERE fl.area_id = ? ORDER BY fl.filename;`;
              db.all(query, [listFilesAreaId], (err, queryRows) => {
                if (err) { console.error("SQLite Error (LISTFILES get files):", err.message); reject(err); }
                else resolve(queryRows);
              });
            });
            const responseLines = [];
            responseLines.push(`Files in [${listFilesAreaName}]:`);
            if (files.length === 0) { responseLines.push("No files in this area."); }
            else {
                files.forEach(f => {
                    const formattedDate = new Date(f.upload_date).toLocaleDateString();
                    responseLines.push(isTelnet ?
                        `${ANSI_CYAN}${f.id}.${COLOR_MAP.reset} ${ANSI_BRIGHT}${ANSI_YELLOW}${f.filename}${COLOR_MAP.reset} - ${f.description || 'No description'} (Up: ${ANSI_GREEN}${f.uploader_username}${COLOR_MAP.reset} on ${formattedDate}, DLs: ${f.download_count})` :
                        `${f.id}. ${f.filename} - ${f.description || 'No description'} (Uploaded by: ${f.uploader_username} on ${formattedDate}, Downloads: ${f.download_count})`);
                });
            }
            responseString = responseLines.join('\n') + '\n';
          } catch (dbErr) {
            console.error("Database error in command: LISTFILES (file query)", dbErr);
            responseString = `Error retrieving files. A database error occurred.\n`;
          }
        break;

    case 'FILEDESC':
        // ... (existing FILEDESC logic with refined parsing and error handling)
        if (!session.loggedIn || !session.userId) { responseString = "You must be logged in to change a file description.\n"; break; }
        const fileIdArg = args[0];
        if (!fileIdArg) { responseString = "Usage: FILEDESC <file_id> /// <description>\nFile ID is required.\n"; break; }
        const fileIdToDesc = parseInt(fileIdArg);
        if (isNaN(fileIdToDesc)) { responseString = "Invalid File ID. Must be a number.\nUsage: FILEDESC <file_id> /// <description>\n"; break; }
        const filedescCommandAndFileIdPart = `${cmd} ${fileIdArg}`;
        const filedescPotentialDescFullString = inputString.substring(filedescCommandAndFileIdPart.length).trim();
        const filedescSeparator = "///";
        const filedescSeparatorActualIndex = filedescPotentialDescFullString.indexOf(filedescSeparator);
        if (filedescSeparatorActualIndex === -1 ) { responseString = "Separator '///' missing.\nUsage: FILEDESC <file_id> /// <description>\n"; break; }
        const newFileDesc = filedescPotentialDescFullString.substring(filedescSeparatorActualIndex + filedescSeparator.length).trim();
        if (!newFileDesc) { responseString = "Description cannot be empty when using '///'.\nUsage: FILEDESC <file_id> /// <description>\n"; break; }
        try {
            const fileListing = await new Promise((resolve, reject) => {
              db.get("SELECT id, uploader_user_id FROM file_listings WHERE id = ?", [fileIdToDesc], (err, row) => {
                if (err) { console.error("SQLite Error (FILEDESC get file):", err.message); reject(err); }
                else resolve(row);
              });
            });
            if (!fileListing) { responseString = "File not found.\n"; break; }
            if (session.userId !== fileListing.uploader_user_id && !isSysOp(session)) { responseString = "Access denied. You can only edit descriptions for files you uploaded.\n"; break; }
            await new Promise((resolve, reject) => {
              db.run("UPDATE file_listings SET description = ? WHERE id = ?", [newFileDesc, fileIdToDesc], function(err) {
                if (err) { console.error("SQLite Error (FILEDESC update desc):", err.message); reject(err); }
                else resolve(this);
              });
            });
            responseString = "File description updated.\n";
          } catch (dbErr) {
            console.error("Database error in command: FILEDESC", dbErr);
            responseString = "Error updating file description. A database error occurred.\n";
          }
        break;

    case 'DOWNLOADINFO':
        // ... (existing DOWNLOADINFO logic with input validation)
        if (!session.loggedIn) { responseString = "You must be logged in to download file information.\n"; break; }
        if (args.length !== 1) { responseString = "Usage: DOWNLOADINFO <file_id>\n"; break; }
        const fileIdToDownload = parseInt(args[0]);
        if (isNaN(fileIdToDownload)) { responseString = "Invalid file ID. Please provide a number.\nUsage: DOWNLOADINFO <file_id>\n"; break; }
        try {
            const fileToDownload = await new Promise((resolve, reject) => {
                db.get("SELECT filename FROM file_listings WHERE id = ?", [fileIdToDownload], (err, row) => {
                    if (err) { console.error("SQLite Error (DOWNLOADINFO get filename):", err.message); reject(err); }
                    else resolve(row);
                });
            });
            if (!fileToDownload) { responseString = "File not found.\n"; break; }
            const result = await new Promise((resolve, reject) => {
              db.run("UPDATE file_listings SET download_count = download_count + 1 WHERE id = ?", [fileIdToDownload], function(err) {
                if (err) { console.error("SQLite Error (DOWNLOADINFO update count):", err.message); reject(err); }
                else resolve({ changes: this.changes });
              });
            });
            if (result.changes > 0) { responseString = `Simulated download of [${fileToDownload.filename}]. Download count updated.\n`; }
            else { responseString = "File not found (or error updating count).\n"; }
          } catch (dbErr) {
            console.error("Database error in command: DOWNLOADINFO", dbErr);
            responseString = "Error processing download. A database error occurred.\n";
          }
        break;

    case 'GAME':
        // ... (existing GAME logic with refined parsing)
        const gameAction = args[0] ? args[0].toUpperCase().trim() : null;
        const gameNameArg = args[1] ? args[1].toUpperCase().trim() : null;
        if (!gameAction) { responseString = "Usage: GAME <action|game_name> [START|action_argument] or GAME LIST/QUIT/EXIT.\n"; break; }
        if (gameAction === 'LIST') { responseString = "Available games:\n- NUMBERGUESS\n"; break; }
        if (gameAction === 'QUIT' || gameAction === 'EXIT') {
            if (session.currentGame) {
              if (session.currentGame.name === 'numberGuess') { responseString = numberGuess.quitGame(session); }
              else { responseString = "Unknown game active, attempting to quit generic game state.\n"; delete session.currentGame; }
            } else { responseString = "You are not currently in a game.\n"; }
            break;
        }
        let targetGameName = null; let actualAction = null;
        if (gameAction === 'START' && gameNameArg) { targetGameName = gameNameArg; actualAction = 'START'; }
        else if (gameNameArg === 'START') { targetGameName = gameAction; actualAction = 'START'; }
        else if (gameAction === 'NUMBERGUESS' && !gameNameArg) { targetGameName = 'NUMBERGUESS'; actualAction = 'START'; }
        if (actualAction === 'START') {
            if (session.currentGame) { responseString = `You are already in a game (${session.currentGame.name}). Type QUIT or EXIT to leave it first.\n`; }
            else {
              if (targetGameName === 'NUMBERGUESS') { responseString = numberGuess.startGame(session); }
              else { responseString = "Unknown game to start. Available: NUMBERGUESS. Usage: GAME NUMBERGUESS START\n"; }
            }
        } else { responseString = "Invalid game command. Usage: GAME LIST, GAME <game_name> START, GAME QUIT.\n"; }
        break;

    case 'HELP':
      // ... (existing HELP logic with refactored list generation)
      const helpResponseLines = [];
      helpResponseLines.push("Available commands:");
      helpResponseLines.push("LOOK - View recent messages (on current board)");
      helpResponseLines.push("SAY <message> - Post a message (on current board, login required)");
      // ... (all other help lines) ...
      helpResponseLines.push("LISTBOARDS - List all available message boards");
      helpResponseLines.push("JOINBOARD <board_name_or_id> - Join a specific message board");
      helpResponseLines.push("SENDMAIL <recipient> <subject> /// [body] - Send a private message.");
      helpResponseLines.push("LISTMAIL - List your private messages.");
      helpResponseLines.push("READMAIL <message_id> - Read a specific private message.");
      helpResponseLines.push("DELETEMAIL <message_id> - Delete a specific private message.");
      helpResponseLines.push("LISTFILEAREAS - List all available file areas.");
      helpResponseLines.push("LISTFILES [area_name_or_id] - List files in an area (defaults to 'General Files').");
      helpResponseLines.push("FILEDESC <file_id> /// <description> - Add/change a file's description.");
      helpResponseLines.push("DOWNLOADINFO <file_id> - Simulate downloading a file & update count.");
      helpResponseLines.push("GAME LIST - List available games.");
      helpResponseLines.push("GAME <game_name> START - Start playing a game (e.g., GAME NUMBERGUESS START).");
      helpResponseLines.push("GAME QUIT - Exit the current game.");
      helpResponseLines.push("SETCOLOR <element> <color> - Customize Telnet colors. Type HELP SETCOLOR for details.");
      helpResponseLines.push("REGISTER <username> <password> - Create a new account");
      helpResponseLines.push("LOGIN <username> <password> - Log into your account");
      helpResponseLines.push("LOGOUT - Log out");
      helpResponseLines.push("WHO - List active users");
      helpResponseLines.push("HELP - Show this help message");
      helpResponseLines.push("HELP SETCOLOR - Detailed help for color customization.");
      helpResponseLines.push("QUIT - Disconnect (Telnet only)");
      helpResponseLines.push("\nWhile in a game, most other commands are unavailable. Type 'quit' or 'exit' to leave the game.");
      if (args.length > 0 && args[0].toUpperCase() === 'SETCOLOR') { // This needs to be before the general help text is assigned
          const helpSetcolorLines = [];
          helpSetcolorLines.push("Usage: SETCOLOR <element> <color>");
          helpSetcolorLines.push("\nCustomizable elements:");
          Object.entries(CUSTOMIZABLE_ELEMENTS).forEach(([k,v]) => {
              helpSetcolorLines.push(`  ${k} - ${v}`);
          });
          helpSetcolorLines.push("\nAvailable colors:");
          helpSetcolorLines.push("  " + AVAILABLE_COLORS.join(', '));
          responseString = helpSetcolorLines.join('\n') + '\n';
          break; // Break for HELP SETCOLOR
      }
      if (isSysOp(session)) {
        helpResponseLines.push("\nSysOp Commands:");
        helpResponseLines.push("KICK <username> - Disconnect a user.");
        helpResponseLines.push("BROADCAST <message> - Send a message to all users.");
        helpResponseLines.push("EDITMESSAGE <id> <new_text> - Edit a public board message.");
        helpResponseLines.push("DELETEMESSAGE <id> - Delete a public board message.");
        helpResponseLines.push("UPLOADINFO <area> <filename> /// [desc] - Add file info (SysOp).");
      }
      responseString = helpResponseLines.join('\n') + '\n';
      break;

    case '':
      responseString = "";
      break;
    default:
      responseString = `Unknown command: ${cmd}\n`;
      break;
  }

  if (cmd === 'LOGIN' && responseString.startsWith("Welcome,")) {
      return responseString;
  }
  return broadcastsToPrepend + responseString;
}

module.exports = {
  createSession,
  getSession,
  endSession,
  processInput,
  parseCommand,
  initializeGeneralBoardCache,
  getAppliedColor,
  COLOR_MAP,
  DEFAULT_COLORS
};
