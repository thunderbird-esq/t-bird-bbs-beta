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
    'username': 'Usernames in messages, lists, etc.', // Maps to 'username_output' in prefs/DB
    'timestamp': 'Timestamps in messages, lists, etc.' // Maps to 'timestamp_output' in prefs/DB
};
// DEFAULT_COLORS stores the *actual ANSI codes* for defaults.
const DEFAULT_COLORS = {
    prompt: COLOR_MAP.bright_green,
    username_output: COLOR_MAP.bright_yellow,
    timestamp_output: COLOR_MAP.cyan,
};

/**
 * Retrieves the ANSI color code for a given UI element type based on user preferences or defaults.
 * @param {object} session - The user's session object, which may contain `session.prefs`.
 * @param {string} elementType - The UI element type (e.g., 'prompt', 'username_output', 'timestamp_output').
 * @returns {string} The ANSI color code.
 */
function getAppliedColor(session, elementType) {
    // session.prefs stores color *names*.
    const colorName = (session && session.prefs && session.prefs[elementType])
                    ? session.prefs[elementType]
                    : Object.keys(COLOR_MAP).find(name => COLOR_MAP[name] === DEFAULT_COLORS[elementType]) || 'white';
    return COLOR_MAP[colorName] || COLOR_MAP.white; // Fallback to white if name is somehow invalid.
}


/**
 * Initializes the cache for the 'General' board details by querying the database.
 * This function should be called once at application startup after initDb.
 * @async
 */
async function initializeGeneralBoardCache() {
  const db = getDb();
  if (!db) {
      console.error("FATAL: Database not available for initializeGeneralBoardCache.");
      // Potentially throw to halt server startup if this is critical.
      return;
  }
  try {
    const row = await new Promise((resolve, reject) => {
      db.get("SELECT id, name FROM boards WHERE name = 'General'", [], (err, row) => {
        if (err) {
          console.error("SQLite Error (initializeGeneralBoardCache):", err.message);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });

    if (row) {
      generalBoardCache = { id: row.id, name: row.name };
      console.log('General board cache initialized:', generalBoardCache);
    } else {
      console.error('FATAL: Could not initialize General board cache. "General" board not found in database.');
      // generalBoardCache remains null. setDefaultBoardForSession will use hardcoded fallbacks.
    }
  } catch (err) {
    console.error('FATAL: Database error during General board cache initialization.', err);
  }
}

/**
 * Checks if the user associated with the current session is a SysOp.
 * @param {object} session - The user's session object.
 * @returns {boolean} True if the user is a SysOp, false otherwise.
 */
function isSysOp(session) {
  return session && session.userRole === 'sysop';
}

/**
 * Sets the default message board for a given session using the cached 'General' board details.
 * If the cache isn't initialized, it uses hardcoded fallback values.
 * @param {object} session - The user's session object to update.
 */
function setDefaultBoardForSession(session) { // Now synchronous
  if (generalBoardCache) {
    session.currentBoardId = generalBoardCache.id;
    session.currentBoardName = generalBoardCache.name;
  } else {
    // Fallback if cache isn't initialized (e.g., DB error on startup).
    console.error('setDefaultBoardForSession: General board cache not initialized! Defaulting to ID 1 / "General".');
    session.currentBoardId = 1;
    session.currentBoardName = 'General';
  }
}

/**
 * Generates a pseudo-unique session ID.
 * @returns {string} A unique session identifier.
 */
function generateUniqueId() {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Creates a new user session.
 * Initializes session properties including username (guest), connection type,
 * default board (synchronously via cache), default color preferences, and broadcast message tracking.
 * @param {string} connectionType - Type of connection ('web' or 'telnet').
 * @returns {string} The newly created session ID. (No longer async if setDefaultBoard is sync)
 */
function createSession(connectionType) { // No longer async
  const sessionId = generateUniqueId();

  // Initialize session.prefs with default color *names*.
  const defaultPrefs = {};
  for (const el in DEFAULT_COLORS) { // el is like 'prompt', 'username_output'
      const defaultColorName = Object.keys(COLOR_MAP).find(name => COLOR_MAP[name] === DEFAULT_COLORS[el]);
      defaultPrefs[el] = defaultColorName || 'white'; // Store the name
  }

  const session = {
    username: 'guest',
    loggedIn: false,
    connectionType: connectionType,
    currentBoardId: undefined,
    currentBoardName: undefined,
    lastSeenBroadcastIndex: globalBroadcastMessages.length > 0 ? globalBroadcastMessages.length - 1 : -1,
    currentGame: null,
    prefs: defaultPrefs, // Initialize with default color names
  };
  sessions[sessionId] = session;
  setDefaultBoardForSession(session); // Set default board (now synchronous)
  console.log(`Session created: ${sessionId} (${connectionType}), board: ${session.currentBoardName}, lastSeenBroadcast: ${session.lastSeenBroadcastIndex}`);
  return sessionId;
}

/**
 * Retrieves an active session by its ID.
 * @param {string} sessionId - The ID of the session to retrieve.
 * @returns {object | undefined} The session object if found, otherwise undefined.
 */
function getSession(sessionId) {
  return sessions[sessionId];
}

/**
 * Ends a user session and removes it from active sessions.
 * @param {string} sessionId - The ID of the session to end.
 * @returns {boolean} True if a session was found and ended, false otherwise.
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
 * Parses a raw input string into a command and its arguments.
 * @param {string} inputString - The raw input string from the user.
 * @returns {{command: string, args: string[]}} Parsed command and arguments.
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

  const parsedCommand = parseCommand(inputString);
  const { command: cmd, args } = parsedCommand;
  const isTelnet = session.connectionType === 'telnet';
  const db = getDb();

  if (session.currentGame) {
    if (session.currentGame.name === 'numberGuess') {
      const lowerInput = inputString.toLowerCase().trim();
      if (lowerInput === 'quit' || lowerInput === 'exit') {
        return numberGuess.quitGame(session);
      }
      return numberGuess.handleGuess(session, inputString);
    }
  }

  let responseString = "";
  let broadcastsToPrepend = "";
  if (globalBroadcastMessages.length > 0) {
    const newMessagesStartIdx = session.lastSeenBroadcastIndex + 1;
    if (newMessagesStartIdx < globalBroadcastMessages.length) {
      for (let i = newMessagesStartIdx; i < globalBroadcastMessages.length; i++) {
        const broadcast = globalBroadcastMessages[i];
        const formattedTimestamp = new Date(broadcast.timestamp).toLocaleTimeString();
        if (isTelnet) {
          broadcastsToPrepend += `${ANSI_BRIGHT}${ANSI_MAGENTA}[BROADCAST ${formattedTimestamp}]${ANSI_RESET} ${broadcast.text}\n`;
        } else {
          broadcastsToPrepend += `[BROADCAST ${formattedTimestamp}] ${broadcast.text}\n`;
        }
      }
      session.lastSeenBroadcastIndex = globalBroadcastMessages.length - 1;
    }
  }

  switch (cmd) {
    case 'REGISTER':
      // ... (existing REGISTER logic with console.error for SQLite errors)
      if (args.length !== 2) {
        responseString = "Usage: REGISTER <username> <password>\n";
        break;
      }
      const regUsername = args[0];
      const regPassword = args[1];

      try {
        const existingUser = await new Promise((resolve, reject) => {
          db.get("SELECT * FROM users WHERE username = ?", [regUsername], (err, row) => {
            if (err) { console.error("SQLite Error (REGISTER get user):", err.message); reject(err); }
            else resolve(row);
          });
        });

        if (existingUser) {
          responseString = "Username already taken. Please try another.\n";
          break;
        }

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
        // This catch block handles errors from the Promises (e.g., db.get/run rejections).
        console.error("Database error in command: REGISTER", dbErr);
        responseString = "Registration failed. A database error occurred.\n";
      }
      break;

    case 'LOGIN':
      // ... (existing LOGIN logic with console.error for SQLite errors)
      if (args.length !== 2) {
        responseString = "Usage: LOGIN <username> <password>\n";
        break;
      }
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
            session.username = user.username;
            session.loggedIn = true;
            session.userId = user.id;
            session.userRole = user.role;

            setDefaultBoardForSession(session); // Now synchronous

            // Initialize/Load user preferences
            session.prefs = {}; // Start with empty or default structure
            for (const el in DEFAULT_COLORS) { // el is like 'prompt', 'username_output'
                const defaultColorName = Object.keys(COLOR_MAP).find(name => COLOR_MAP[name] === DEFAULT_COLORS[el]);
                session.prefs[el] = defaultColorName || 'white'; // Store the name
            }

            const userPrefsRow = await new Promise((resolve, reject) => {
                db.get("SELECT * FROM user_preferences WHERE user_id = ?", [session.userId], (err, row) => {
                    if (err) { console.error("SQLite Error (LOGIN get prefs):", err.message); reject(err); }
                    else resolve(row);
                });
            });

            if (userPrefsRow) {
                if (userPrefsRow.color_prompt && AVAILABLE_COLORS.includes(userPrefsRow.color_prompt)) {
                    session.prefs.prompt = userPrefsRow.color_prompt;
                }
                if (userPrefsRow.color_username_output && AVAILABLE_COLORS.includes(userPrefsRow.color_username_output)) {
                    session.prefs.username_output = userPrefsRow.color_username_output;
                }
                if (userPrefsRow.color_timestamp_output && AVAILABLE_COLORS.includes(userPrefsRow.color_timestamp_output)) {
                    session.prefs.timestamp_output = userPrefsRow.color_timestamp_output;
                }
            }
            // End of preference loading

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
      session.username = 'guest';
      session.loggedIn = false;
      delete session.userId;
      delete session.userRole;
      if(session.currentGame) {
          delete session.currentGame;
          console.log(`Game state cleared for session ${sessionId} due to LOGOUT.`);
      }
      // Reset prefs to default color names on logout
      session.prefs = {};
      for (const el in DEFAULT_COLORS) {
          const defaultColorName = Object.keys(COLOR_MAP).find(name => COLOR_MAP[name] === DEFAULT_COLORS[el]);
          session.prefs[el] = defaultColorName || 'white';
      }
      setDefaultBoardForSession(session);
      responseString = "You have been logged out.\n";
      break;

    case 'LOOK':
      // ... (existing LOOK logic, will apply getAppliedColor later)
      const lookBoardId = session.currentBoardId || 1;
      const lookBoardName = session.currentBoardName || 'General';
      try {
        const messages = await new Promise((resolve, reject) => { // Renamed 'rows' to 'messages'
          const query = `
            SELECT m.body, m.timestamp, u.username
            FROM messages m
            JOIN users u ON m.user_id = u.id
            WHERE m.board_id = ?
            ORDER BY m.timestamp DESC
            LIMIT 10;
          `;
          db.all(query, [lookBoardId], (err, queryRows) => {
            if (err) { console.error("SQLite Error (LOOK get messages):", err.message); reject(err); }
            else resolve(queryRows);
          });
        });

        const responseLines = [];
        responseLines.push(`Messages in [${lookBoardName}]:`);
        if (messages.length === 0) {
          responseLines.push("No messages yet on this board.");
        } else {
          const userColor = isTelnet ? getAppliedColor(session, 'username_output') : '';
          const timeColor = isTelnet ? getAppliedColor(session, 'timestamp_output') : '';
          const resetColor = isTelnet ? COLOR_MAP.reset : '';

          messages.forEach(msg => {
            const localTimestamp = new Date(msg.timestamp).toLocaleTimeString();
            if (isTelnet) {
              responseLines.push(`${timeColor}[${localTimestamp}]${resetColor} ${userColor}${msg.username}${resetColor}: ${msg.body}`);
            } else {
              responseLines.push(`[${localTimestamp}] ${msg.username}: ${msg.body}`);
            }
          });
        }
        responseString = responseLines.join('\n') + '\n';
      } catch (dbErr) {
        console.error("Database error in command: LOOK", dbErr);
        responseString = `Error retrieving messages. A database error occurred.\n`;
      }
      break;

    // ... (other commands remain largely the same, but list generation refactoring and error logging should be checked)
    // ... (SAY, WHO, LISTBOARDS, JOINBOARD, SENDMAIL, LISTMAIL, READMAIL, DELETEMAIL)
    // ... (SysOp Commands: KICK, BROADCAST, EDITMESSAGE, DELETEMESSAGE)
    // ... (File Commands: LISTFILEAREAS, UPLOADINFO, LISTFILES, FILEDESC, DOWNLOADINFO)
    // ... (GAME command)

    case 'SAY':
      if (!session.loggedIn || !session.userId) {
        responseString = "You must be logged in to use the SAY command.\nUsage: LOGIN <username> <password>\n";
        break;
      }
      const messageBody = args.join(' ').trim();
      if (!messageBody) {
        responseString = "Usage: SAY <message>\nMessage cannot be empty.\n";
        break;
      }

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
      const loggedInUsernames = Object.values(sessions)
        .filter(s => s.loggedIn)
        .map(s => s.username);

      const whoResponseLines = [];
      if (loggedInUsernames.length === 0) {
        whoResponseLines.push("No users currently logged in.");
      } else {
        whoResponseLines.push("Active users:");
        const usernameColor = isTelnet ? getAppliedColor(session, 'username_output') : '';
        const resetColor = isTelnet ? COLOR_MAP.reset : '';
        loggedInUsernames.forEach(username => {
            whoResponseLines.push(isTelnet ? `  ${usernameColor}${username}${resetColor}` : `  ${username}`);
        });
      }
      responseString = whoResponseLines.join('\n') + '\n';
      break;

    case 'SETCOLOR':
        if (!session.loggedIn || !session.userId) {
            responseString = "You must be logged in to set colors.\n";
            break;
        }
        const elementTypeArg = args[0]?.toLowerCase();
        const colorNameArg = args[1]?.toLowerCase();

        if (!elementTypeArg || !CUSTOMIZABLE_ELEMENTS[elementTypeArg]) {
            responseString = "Invalid element type. Use HELP SETCOLOR for available elements.\n";
            break;
        }
        if (!colorNameArg || !AVAILABLE_COLORS.includes(colorNameArg)) {
            responseString = `Invalid color name. Use HELP SETCOLOR for available colors.\n`;
            break;
        }

        // Map elementType to the correct session.prefs key and DB column name
        let prefKey = `color_${elementTypeArg}`; // e.g. color_prompt
        let dbColumnName = `color_${elementTypeArg}`;
        if (elementTypeArg === 'username') { // Map 'username' from CUSTOMIZABLE_ELEMENTS to 'username_output' for prefs/DB
            prefKey = 'username_output';
            dbColumnName = 'color_username_output';
        } else if (elementTypeArg === 'timestamp') { // Map 'timestamp' to 'timestamp_output'
            prefKey = 'timestamp_output';
            dbColumnName = 'color_timestamp_output';
        }
        // For 'prompt', prefKey and dbColumnName are already correct (color_prompt)

        try {
            await new Promise((resolve, reject) => {
                const sql = `
                    INSERT INTO user_preferences (user_id, ${dbColumnName})
                    VALUES (?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET ${dbColumnName} = excluded.${dbColumnName};
                `;
                db.run(sql, [session.userId, colorNameArg], function(err) {
                    if (err) { console.error(`SQLite Error (SETCOLOR ${elementTypeArg}):`, err.message); reject(err); }
                    else resolve(this);
                });
            });
            session.prefs[prefKey] = colorNameArg;
            responseString = `Color for ${elementTypeArg} set to ${colorNameArg}.\n`;
        } catch (dbErr) {
            console.error("Database error in command: SETCOLOR", dbErr);
            responseString = "Failed to set color preference. A database error occurred.\n";
        }
        break;

    case 'HELP':
      if (args.length > 0 && args[0].toUpperCase() === 'SETCOLOR') {
          const helpSetcolorLines = [];
          helpSetcolorLines.push("Usage: SETCOLOR <element> <color>");
          helpSetcolorLines.push("\nCustomizable elements:");
          Object.entries(CUSTOMIZABLE_ELEMENTS).forEach(([k,v]) => {
              helpSetcolorLines.push(`  ${k} - ${v}`);
          });
          helpSetcolorLines.push("\nAvailable colors:");
          helpSetcolorLines.push("  " + AVAILABLE_COLORS.join(', '));
          responseString = helpSetcolorLines.join('\n') + '\n';
          break;
      }
      const helpResponseLines = [];
      helpResponseLines.push("Available commands:");
      helpResponseLines.push("LOOK - View recent messages (on current board)");
      helpResponseLines.push("SAY <message> - Post a message (on current board, login required)");
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

    // ... (rest of the switch cases for other commands, ensuring they use responseString and break)
    // Ensure all paths through the switch statement assign to responseString or return directly.

    case '': // Handle empty input
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
  initializeGeneralBoardCache, // Export for server.js startup
  getAppliedColor, // Export for telnetServer.js
  COLOR_MAP, // Export for telnetServer.js (for reset mostly)
  DEFAULT_COLORS // Export for telnetServer.js (for default prompt color if needed)
};
