const sessions = {};
// const messages = []; // Removed, replaced by DB
// const users = {}; // Replaced by database

const bcrypt = require('bcrypt');
const { getDb } = require('./database');
const numberGuess = require('./games/numberGuess.js'); // Import game module
const saltRounds = 10;
let globalBroadcastMessages = []; // For BROADCAST command

// Helper function to check SysOp status
function isSysOp(session) {
  return session && session.userRole === 'sysop';
}

// Helper function to set default board for a session
async function setDefaultBoardForSession(session) {
  const db = getDb();
  try {
    const generalBoard = await new Promise((resolve, reject) => {
      db.get("SELECT id, name FROM boards WHERE name = 'General'", [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (generalBoard) {
      session.currentBoardId = generalBoard.id;
      session.currentBoardName = generalBoard.name;
    } else {
      console.warn("Default 'General' board not found in DB. Using fallback ID 1.");
      session.currentBoardId = 1; // Fallback
      session.currentBoardName = 'General';
    }
  } catch (dbErr) {
    console.error("Error fetching 'General' board:", dbErr.message);
    session.currentBoardId = 1; // Fallback
    session.currentBoardName = 'General';
  }
}

function generateUniqueId() {
  return Math.random().toString(36).substring(2, 15);
}

async function createSession(connectionType) { // Made async
  const sessionId = generateUniqueId();
  const session = {
    username: 'guest',
    loggedIn: false,
    connectionType,
    currentBoardId: undefined,
    currentBoardName: undefined,
    lastSeenBroadcastIndex: globalBroadcastMessages.length > 0 ? globalBroadcastMessages.length - 1 : -1, // Initialize lastSeenBroadcastIndex
  };
  sessions[sessionId] = session;
  await setDefaultBoardForSession(session); // Set default board
  console.log(`Session created: ${sessionId} (${connectionType}), board: ${session.currentBoardName}, lastSeenBroadcast: ${session.lastSeenBroadcastIndex}`);
  return sessionId;
}

function getSession(sessionId) {
  return sessions[sessionId];
}

function endSession(sessionId) {
  if (sessions[sessionId]) {
    console.log(`Session ended: ${sessionId}`);
    delete sessions[sessionId];
    return true;
  }
  return false;
}

function parseCommand(inputString) {
  if (!inputString || inputString.trim() === '') {
    return { command: '', args: [] };
  }
  const parts = inputString.trim().split(/\s+/);
  const command = parts[0].toUpperCase();
  const args = parts.slice(1);
  return { command, args };
}

// Removed: addMessage - DB interaction will be direct in SAY
// Removed: getMessages - DB interaction will be direct in LOOK

// ANSI Color Codes (subset, can be expanded)
const ANSI_RESET = "\x1b[0m";
const ANSI_BRIGHT = "\x1b[1m";
const ANSI_RED = "\x1b[31m";
const ANSI_GREEN = "\x1b[32m";
const ANSI_YELLOW = "\x1b[33m";
const ANSI_CYAN = "\x1b[36m";
const ANSI_WHITE = "\x1b[37m"; // Or use specific bright white like \x1b[1;37m

async function processInput(sessionId, inputString) { // Made async for bcrypt and DB calls
  const session = getSession(sessionId);
  if (!session) {
    return "Critical Error: Session not found. Please try reconnecting.\n";
  }

  const parsedCommand = parseCommand(inputString);
  const { command: cmd, args } = parsedCommand;
  const isTelnet = session.connectionType === 'telnet';
  const db = getDb();

  // Game handling logic - takes precedence if a game is active
  if (session.currentGame) {
    if (session.currentGame.name === 'numberGuess') {
      const lowerInput = inputString.toLowerCase().trim();
      if (lowerInput === 'quit' || lowerInput === 'exit') {
        return numberGuess.quitGame(session);
      }
      return numberGuess.handleGuess(session, inputString);
    }
    // Potentially add other game handlers here with else if
  }

  let responseString = ""; // Initialize response string

  // Handle broadcast message delivery BEFORE command processing
  // (Ensure this doesn't run if game is active and game handles its own I/O)
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
      if (args.length !== 2) {
        return "Usage: REGISTER <username> <password>\n";
      }
      const regUsername = args[0];
      const regPassword = args[1];

      try {
        const existingUser = await new Promise((resolve, reject) => {
          db.get("SELECT * FROM users WHERE username = ?", [regUsername], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        if (existingUser) {
          return "Username already taken. Please try another.\n";
        }

        const hash = await bcrypt.hash(regPassword, saltRounds);
        const registrationDate = new Date().toISOString();
        await new Promise((resolve, reject) => {
          db.run("INSERT INTO users (username, password_hash, registration_date) VALUES (?, ?, ?)",
                 [regUsername, hash, registrationDate], function(err) {
            if (err) reject(err);
            else resolve(this);
          });
        });
        return "Registration successful. You can now LOGIN.\n";
      } catch (dbErr) {
        console.error("REGISTER DB Error:", dbErr.message);
        return "Registration failed due to a server error. Please try again later.\n";
      }

    case 'LOGIN':
      if (args.length !== 2) {
        return "Usage: LOGIN <username> <password>\n";
      }
      const loginUsername = args[0];
      const loginPassword = args[1];

      try {
        const user = await new Promise((resolve, reject) => {
          db.get("SELECT * FROM users WHERE username = ?", [loginUsername], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        if (user) {
          const match = await bcrypt.compare(loginPassword, user.password_hash);
          if (match) {
            session.username = user.username;
            session.loggedIn = true;
            session.userId = user.id; // Store user ID from DB
            session.userRole = user.role; // Store user role from DB

            // Set default board on login
            await setDefaultBoardForSession(session);

            let loginMessage = `Welcome, ${user.username}! Login successful. Current board: ${session.currentBoardName}\n`;

            // Check for unread mail
            const unreadMail = await new Promise((resolve, reject) => {
              db.get("SELECT COUNT(*) AS unread_count FROM private_messages WHERE recipient_id = ? AND is_read = 0",
                     [session.userId], (err, row) => {
                if (err) reject(err); // Should be handled by catch block below
                else resolve(row);
              });
            });

            if (unreadMail && unreadMail.unread_count > 0) {
              loginMessage += `You have ${unreadMail.unread_count} unread private message(s). Type LISTMAIL to read.\n`;
            }

            console.log(`User ${user.username} logged in, set to board: ${session.currentBoardName}`);
            return loginMessage;
          }
        }
        return "Invalid username or password.\n";
      } catch (dbErr) {
        console.error("LOGIN DB Error:", dbErr.message);
        return "Login failed due to a server error. Please try again later.\n";
      }

    case 'LOGOUT':
      // Clear user-specific session data
      session.username = 'guest';
      session.loggedIn = false;
      delete session.userId;
      delete session.userRole;
      // Reset board to default for guest session state
      await setDefaultBoardForSession(session);
      return "You have been logged out.\n";

    case 'LOOK':
      const lookBoardId = session.currentBoardId || 1; // Default to General board if not set
      const lookBoardName = session.currentBoardName || 'General';
      try {
        const rows = await new Promise((resolve, reject) => {
          const query = `
            SELECT m.body, m.timestamp, u.username
            FROM messages m
            JOIN users u ON m.user_id = u.id
            WHERE m.board_id = ?
            ORDER BY m.timestamp DESC
            LIMIT 10;
          `;
          db.all(query, [lookBoardId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });

        let header = `Messages in [${lookBoardName}]:\n`;
        if (rows.length === 0) {
          return header + "No messages yet on this board.\n";
        }

        if (isTelnet) {
          return header + rows.map(msg => {
            const localTimestamp = new Date(msg.timestamp).toLocaleTimeString();
            return `${ANSI_CYAN}[${localTimestamp}]${ANSI_RESET} ${ANSI_BRIGHT}${ANSI_YELLOW}${msg.username}${ANSI_RESET}: ${msg.body}`;
          }).join('\n') + '\n';
        } else {
          return header + rows.map(msg => {
            const localTimestamp = new Date(msg.timestamp).toLocaleTimeString();
            return `[${localTimestamp}] ${msg.username}: ${msg.body}`;
          }).join('\n') + '\n';
        }
      } catch (dbErr) {
        console.error("LOOK DB Error:", dbErr.message);
        return `Error retrieving messages from board ${lookBoardName}.\n`;
      }

    case 'SAY':
      if (!session.loggedIn || !session.userId) { // Ensure userId is in session
        return "You must be logged in to use the SAY command. Type LOGIN <username> <password>.\n";
      }
      if (args.length === 0) {
        return "What do you want to say? Usage: SAY <message>\n";
      }
      const messageBody = args.join(' ');
      const currentTimestamp = new Date().toISOString();
      const sayBoardId = session.currentBoardId || 1; // Default to General if not set

      try {
        await new Promise((resolve, reject) => {
          db.run("INSERT INTO messages (board_id, user_id, body, timestamp) VALUES (?, ?, ?, ?)",
                 [sayBoardId, session.userId, messageBody, currentTimestamp], function(err) {
            if (err) reject(err);
            else resolve(this);
          });
        });
        return "Message posted.\n";
      } catch (dbErr) {
        console.error("SAY DB Error:", dbErr.message);
        return "Failed to post message due to a server error.\n";
      }

    case 'WHO':
      const loggedInUsers = Object.values(sessions)
        .filter(s => s.loggedIn)
        .map(s => s.username);

      if (loggedInUsers.length === 0) {
        return "No users currently logged in.\n";
      }
      if (isTelnet) {
        return "Active users:\n" + loggedInUsers.map(u => `${ANSI_BRIGHT}${ANSI_GREEN}${u}${ANSI_RESET}`).join('\n') + '\n';
      } else {
        return "Active users:\n" + loggedInUsers.join('\n') + '\n';
      }

    case 'LISTBOARDS':
      try {
        const boards = await new Promise((resolve, reject) => {
          db.all("SELECT id, name, description FROM boards ORDER BY id", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });

        if (boards.length === 0) {
          return "No message boards available.\n";
        }

        if (isTelnet) {
          return "Available Message Boards:\n" + boards.map(b =>
            `${ANSI_CYAN}${b.id}.${ANSI_RESET} ${ANSI_BRIGHT}${ANSI_YELLOW}${b.name}${ANSI_RESET} - ${b.description || 'No description'}`
          ).join('\n') + '\n';
        } else {
          return "Available Message Boards:\n" + boards.map(b =>
            `${b.id}. ${b.name} - ${b.description || 'No description'}`
          ).join('\n') + '\n';
        }
      } catch (dbErr) {
        console.error("LISTBOARDS DB Error:", dbErr.message);
        return "Error retrieving message boards.\n";
      }

    case 'JOINBOARD':
      if (args.length !== 1) {
        return "Usage: JOINBOARD <board_name_or_id>\n";
      }
      const boardIdentifier = args[0];
      let query;
      let queryParams;

      if (isNaN(parseInt(boardIdentifier))) { // Search by name
        query = "SELECT id, name FROM boards WHERE name = ?";
        queryParams = [boardIdentifier];
      } else { // Search by ID
        query = "SELECT id, name FROM boards WHERE id = ?";
        queryParams = [parseInt(boardIdentifier)];
      }

      try {
        const board = await new Promise((resolve, reject) => {
          db.get(query, queryParams, (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        if (board) {
          session.currentBoardId = board.id;
          session.currentBoardName = board.name;
          return `Joined board: ${board.name}. Messages for LOOK and SAY will now use this board.\n`;
        } else {
          return "Board not found.\n";
        }
      } catch (dbErr) {
        console.error("JOINBOARD DB Error:", dbErr.message);
        return "Error finding board.\n";
      }

    case 'SENDMAIL':
      if (!session.loggedIn || !session.userId) {
        return "You must be logged in to send mail.\n";
      }

      // cmd is SENDMAIL, args are the rest of the line after "SENDMAIL "
      // We need to re-parse the arguments for SENDMAIL specifically
      const mailArgsString = inputString.substring(cmd.length + 1).trim();
      const firstSpaceIndex = mailArgsString.indexOf(' ');

      if (firstSpaceIndex === -1) { // Only recipient, no subject or body
          return "Usage: SENDMAIL <recipient_username> <subject> /// [optional_message_body]\n";
      }
      const recipientUsername = mailArgsString.substring(0, firstSpaceIndex);
      const subjectAndBodyString = mailArgsString.substring(firstSpaceIndex + 1).trim();

      const separatorIndex = subjectAndBodyString.indexOf('///');
      let subject, body;

      if (separatorIndex === -1) {
          subject = subjectAndBodyString;
          body = ''; // No body if no separator
      } else {
          subject = subjectAndBodyString.substring(0, separatorIndex).trim();
          body = subjectAndBodyString.substring(separatorIndex + 3).trim();
      }

      if (!recipientUsername || !subject) {
        return "Usage: SENDMAIL <recipient_username> <subject> /// [optional_message_body]\n";
      }

      try {
        const recipient = await new Promise((resolve, reject) => {
          db.get("SELECT id FROM users WHERE username = ?", [recipientUsername], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        if (!recipient) {
          return `Recipient user '${recipientUsername}' not found.\n`;
        }

        const senderId = session.userId;
        const recipientId = recipient.id;
        const timestamp = new Date().toISOString();

        await new Promise((resolve, reject) => {
          db.run("INSERT INTO private_messages (sender_id, recipient_id, subject, body, timestamp, is_read) VALUES (?, ?, ?, ?, ?, 0)",
                 [senderId, recipientId, subject, body, timestamp], function(err) {
            if (err) reject(err);
            else resolve(this);
          });
        });
        return "Message sent successfully.\n";
      } catch (dbErr) {
        console.error("SENDMAIL DB Error:", dbErr.message);
        return "Failed to send message due to a server error.\n";
      }

    case 'LISTMAIL':
      if (!session.loggedIn || !session.userId) {
        return "You must be logged in to list your mail.\n";
      }
      try {
        const mails = await new Promise((resolve, reject) => {
          const query = `
            SELECT pm.id, pm.subject, pm.timestamp, pm.is_read, u.username AS sender_username
            FROM private_messages pm
            JOIN users u ON pm.sender_id = u.id
            WHERE pm.recipient_id = ?
            ORDER BY pm.timestamp DESC;
          `;
          db.all(query, [session.userId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });

        if (mails.length === 0) {
          return "You have no private messages.\n";
        }

        let mailList = "Your Private Messages:\n";
        if (isTelnet) {
          mailList += mails.map(m =>
            `${m.is_read ? '  ' : `${ANSI_BRIGHT}${ANSI_GREEN}* ${ANSI_RESET}`}${ANSI_CYAN}${m.id}:${ANSI_RESET} ` +
            `From: ${ANSI_YELLOW}${m.sender_username}${ANSI_RESET} Sub: ${m.subject} ` +
            `(${new Date(m.timestamp).toLocaleString()})`
          ).join('\n');
        } else {
          mailList += mails.map(m =>
            `${m.is_read ? '  ' : '* '}${m.id}: From: ${m.sender_username} Sub: ${m.subject} ` +
            `(${new Date(m.timestamp).toLocaleString()})`
          ).join('\n');
        }
        return mailList + '\n';
      } catch (dbErr) {
        console.error("LISTMAIL DB Error:", dbErr.message);
        return "Error retrieving private messages.\n";
      }

    case 'READMAIL':
      if (!session.loggedIn || !session.userId) {
        return "You must be logged in to read mail.\n";
      }
      if (args.length !== 1 || isNaN(parseInt(args[0]))) {
        return "Usage: READMAIL <message_id>\n";
      }
      const messageIdToRead = parseInt(args[0]);

      try {
        const message = await new Promise((resolve, reject) => {
          const query = `
            SELECT pm.id, pm.subject, pm.body, pm.timestamp, pm.is_read, u.username AS sender_username
            FROM private_messages pm
            JOIN users u ON pm.sender_id = u.id
            WHERE pm.id = ? AND pm.recipient_id = ?;
          `;
          db.get(query, [messageIdToRead, session.userId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        if (!message) {
          return "Message not found or access denied.\n";
        }

        // Mark as read
        if (!message.is_read) {
          await new Promise((resolve, reject) => {
            db.run("UPDATE private_messages SET is_read = 1 WHERE id = ?", [messageIdToRead], function(err) {
              if (err) reject(err);
              else resolve(this);
            });
          });
        }

        return `From: ${message.sender_username}\n` +
               `Subject: ${message.subject}\n` +
               `Date: ${new Date(message.timestamp).toLocaleString()}\n\n` +
               `${message.body}\n`;

      } catch (dbErr) {
        console.error("READMAIL DB Error:", dbErr.message);
        return "Error retrieving message.\n";
      }

    case 'DELETEMAIL':
      if (!session.loggedIn || !session.userId) {
        return "You must be logged in to delete mail.\n";
      }
      if (args.length !== 1 || isNaN(parseInt(args[0]))) {
        return "Usage: DELETEMAIL <message_id>\n";
      }
      const messageIdToDelete = parseInt(args[0]);

      try {
        const result = await new Promise((resolve, reject) => {
          db.run("DELETE FROM private_messages WHERE id = ? AND recipient_id = ?",
                 [messageIdToDelete, session.userId], function(err) {
            if (err) reject(err);
            // this.changes provides the number of rows deleted
            else resolve({ changes: this.changes });
          });
        });

        if (result.changes > 0) {
          return "Message deleted.\n";
        } else {
          return "Message not found or access denied.\n";
        }
      } catch (dbErr) {
        console.error("DELETEMAIL DB Error:", dbErr.message);
        return "Error deleting message.\n";
      }

    case 'KICK':
      if (!isSysOp(session)) {
        responseString = "Access denied.\n";
        break;
      }
      if (args.length !== 1) {
        responseString = "Usage: KICK <username>\n";
        break;
      }
      const userToKick = args[0];
      let kicked = false;
      for (const [sid, targetSession] of Object.entries(sessions)) {
        if (targetSession.username === userToKick && targetSession.loggedIn) {
          // Cannot kick oneself (though SysOp check mostly prevents this)
          if (sid === sessionId) {
            responseString = "You cannot kick yourself.\n";
            kicked = true; // Mark as "handled"
            break;
          }
          delete sessions[sid];
          // Optionally, add to a list of kicked users or notify the kicked user if possible
          // For now, their next command will fail or they'll need to log in again.
          responseString = `User ${userToKick} has been kicked. Their session is invalidated.\n`;
          kicked = true;
          break;
        }
      }
      if (!kicked) {
        responseString = `User ${userToKick} not found or not currently logged in.\n`;
      }
      break;

    case 'BROADCAST':
      if (!isSysOp(session)) {
        responseString = "Access denied.\n";
        break;
      }
      const broadcastMessageText = args.join(' ');
      if (!broadcastMessageText) {
        responseString = "Usage: BROADCAST <message>\n";
        break;
      }
      globalBroadcastMessages.push({ text: broadcastMessageText, timestamp: new Date() });
      responseString = "Broadcast message sent.\n";
      break;

    case 'EDITMESSAGE': // Edit public messages on boards
      if (!isSysOp(session)) {
        responseString = "Access denied.\n";
        break;
      }
      if (args.length < 2) {
        responseString = "Usage: EDITMESSAGE <message_id> <new_text>\n";
        break;
      }
      const editMessageId = parseInt(args[0]);
      const newText = args.slice(1).join(' ');

      if (isNaN(editMessageId)) {
        responseString = "Invalid message ID.\n";
        break;
      }
      try {
        const result = await new Promise((resolve, reject) => {
          db.run("UPDATE messages SET body = ? WHERE id = ?", [newText, editMessageId], function(err) {
            if (err) reject(err);
            else resolve({ changes: this.changes });
          });
        });
        if (result.changes > 0) {
          responseString = "Message updated.\n";
        } else {
          responseString = "Message not found.\n";
        }
      } catch (dbErr) {
        console.error("EDITMESSAGE DB Error:", dbErr.message);
        responseString = "Error updating message.\n";
      }
      break;

    case 'DELETEMESSAGE': // Delete public messages on boards
      if (!isSysOp(session)) {
        responseString = "Access denied.\n";
        break;
      }
      if (args.length !== 1) {
        responseString = "Usage: DELETEMESSAGE <message_id>\n";
        break;
      }
      const deletePublicMessageId = parseInt(args[0]); // Renamed to avoid conflict
      if (isNaN(deletePublicMessageId)) {
        responseString = "Invalid message ID.\n";
        break;
      }
      try {
        const result = await new Promise((resolve, reject) => {
          db.run("DELETE FROM messages WHERE id = ?", [deletePublicMessageId], function(err) {
            if (err) reject(err);
            else resolve({ changes: this.changes });
          });
        });
        if (result.changes > 0) {
          responseString = "Message deleted from board.\n";
        } else {
          responseString = "Message not found on board.\n";
        }
      } catch (dbErr) {
        console.error("DELETEMESSAGE DB Error:", dbErr.message);
        responseString = "Error deleting message from board.\n";
      }
      break;

    case 'LISTFILEAREAS':
      try {
        const areas = await new Promise((resolve, reject) => {
          db.all("SELECT id, name, description FROM file_areas ORDER BY id", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });

        if (areas.length === 0) {
          responseString = "No file areas available.\n";
          break;
        }

        let areaList = "Available File Areas:\n";
        if (isTelnet) {
          areaList += areas.map(a =>
            `${ANSI_CYAN}${a.id}.${ANSI_RESET} ${ANSI_BRIGHT}${ANSI_YELLOW}${a.name}${ANSI_RESET} - ${a.description || 'No description'}`
          ).join('\n');
        } else {
          areaList += areas.map(a =>
            `${a.id}. ${a.name} - ${a.description || 'No description'}`
          ).join('\n');
        }
        responseString = areaList + '\n';
      } catch (dbErr) {
        console.error("LISTFILEAREAS DB Error:", dbErr.message);
        responseString = "Error retrieving file areas.\n";
      }
      break;

    case 'UPLOADINFO': // SysOp only
      if (!isSysOp(session)) {
        responseString = "Access denied.\n";
        break;
      }
      // UPLOADINFO <area_name_or_id> <filename> /// [description]
      // Correct parsing of arguments for UPLOADINFO as it includes '///'
      const uploadInfoFullArgs = inputString.substring(cmd.length + 1).trim(); // e.g., "area filename /// desc"
      const uploadInfoParts = uploadInfoFullArgs.split(' ');
      if (uploadInfoParts.length < 2) {
        responseString = "Usage: UPLOADINFO <area_name_or_id> <filename> /// [description]\n";
        break;
      }
      const areaRef = uploadInfoParts[0];
      const filename = uploadInfoParts[1];
      let description = ""; // Default to empty if '///' is not found or no text after it

      const descSeparatorStr = "///";
      const firstPartForDesc = `${areaRef} ${filename}`;
      // Find the start of the potential description part in the original input string
      const potentialDescStartIndex = inputString.toUpperCase().indexOf(firstPartForDesc.toUpperCase()) + firstPartForDesc.length;
      const restOfStringForDesc = inputString.substring(potentialDescStartIndex).trim();

      const separatorActualIndex = restOfStringForDesc.indexOf(descSeparatorStr);

      if (separatorActualIndex !== -1) {
          description = restOfStringForDesc.substring(separatorActualIndex + descSeparatorStr.length).trim();
      }
      // If no '///', description remains empty, which is fine.

      if (!filename) { // AreaRef is checked by DB query, filename must exist
          responseString = "Usage: UPLOADINFO <area_name_or_id> <filename> /// [description]\n";
          break;
      }

      try {
        // Find area_id
        let areaQuery, areaParams;
        if (isNaN(parseInt(areaRef))) {
          areaQuery = "SELECT id FROM file_areas WHERE name = ?";
          areaParams = [areaRef];
        } else {
          areaQuery = "SELECT id FROM file_areas WHERE id = ?";
          areaParams = [parseInt(areaRef)];
        }
        const area = await new Promise((resolve, reject) => {
          db.get(areaQuery, areaParams, (err, row) => {
            if (err) reject(err); else resolve(row);
          });
        });

        if (!area) {
          responseString = "File area not found.\n";
          break;
        }
        const areaId = area.id;
        const uploaderUserId = session.userId; // SysOp is uploading
        const uploadDate = new Date().toISOString();

        await new Promise((resolve, reject) => {
          db.run("INSERT INTO file_listings (area_id, filename, description, uploader_user_id, upload_date) VALUES (?, ?, ?, ?, ?)",
                 [areaId, filename, description, uploaderUserId, uploadDate], function(err) {
            if (err) {
              if (err.message.includes("UNIQUE constraint failed")) {
                reject(new Error("Filename already exists in this area."));
              } else {
                reject(err);
              }
            } else {
              resolve(this);
            }
          });
        });
        responseString = "File information uploaded successfully.\n";
      } catch (dbErr) {
        console.error("UPLOADINFO DB Error:", dbErr.message);
        responseString = dbErr.message.startsWith("Filename already exists") ? dbErr.message : "Error uploading file information.\n";
      }
      break;

    case 'LISTFILES': // LISTFILES [area_name_or_id]
      let listFilesAreaId;
      let listFilesAreaName = "General Files"; // Default name

      if (args.length === 0) {
        // Default to "General Files" area
        try {
          const generalFilesArea = await new Promise((resolve, reject) => {
            db.get("SELECT id, name FROM file_areas WHERE name = 'General Files'", [], (err, row) => {
              if (err) reject(err); else resolve(row);
            });
          });
          if (generalFilesArea) {
            listFilesAreaId = generalFilesArea.id;
            listFilesAreaName = generalFilesArea.name;
          } else {
            responseString = "Default 'General Files' area not found. Please specify an area.\n";
            break;
          }
        } catch (dbErr) {
          console.error("LISTFILES Default Area DB Error:", dbErr.message);
          responseString = "Error finding default file area.\n";
          break;
        }
      } else {
        // User specified an area
        const areaFileRef = args[0];
        let areaFileQuery, areaFileParams;
        if (isNaN(parseInt(areaFileRef))) {
          areaFileQuery = "SELECT id, name FROM file_areas WHERE name = ?";
          areaFileParams = [areaFileRef];
        } else {
          areaFileQuery = "SELECT id, name FROM file_areas WHERE id = ?";
          areaFileParams = [parseInt(areaFileRef)];
        }
        try {
          const area = await new Promise((resolve, reject) => {
            db.get(areaFileQuery, areaFileParams, (err, row) => {
              if (err) reject(err); else resolve(row);
            });
          });
          if (area) {
            listFilesAreaId = area.id;
            listFilesAreaName = area.name;
          } else {
            responseString = "File area not found.\n";
            break;
          }
        } catch (dbErr) {
          console.error("LISTFILES Specified Area DB Error:", dbErr.message);
          responseString = "Error finding specified file area.\n";
          break;
        }
      }

      try {
        const files = await new Promise((resolve, reject) => {
          const query = `
            SELECT fl.id, fl.filename, fl.description, fl.download_count, u.username AS uploader_username, fl.upload_date
            FROM file_listings fl
            JOIN users u ON fl.uploader_user_id = u.id
            WHERE fl.area_id = ?
            ORDER BY fl.filename;
          `;
          db.all(query, [listFilesAreaId], (err, rows) => {
            if (err) reject(err); else resolve(rows);
          });
        });

        let fileListHeader = `Files in [${listFilesAreaName}]:\n`;
        if (files.length === 0) {
          responseString = fileListHeader + "No files in this area.\n";
          break;
        }

        if (isTelnet) {
          responseString = fileListHeader + files.map(f =>
            `${ANSI_CYAN}${f.id}.${ANSI_RESET} ${ANSI_BRIGHT}${ANSI_YELLOW}${f.filename}${ANSI_RESET} - ${f.description || 'No description'} ` +
            `(Up: ${ANSI_GREEN}${f.uploader_username}${ANSI_RESET} on ${new Date(f.upload_date).toLocaleDateString()}, DLs: ${f.download_count})`
          ).join('\n') + '\n';
        } else {
          responseString = fileListHeader + files.map(f =>
            `${f.id}. ${f.filename} - ${f.description || 'No description'} ` +
            `(Uploaded by: ${f.uploader_username} on ${new Date(f.upload_date).toLocaleDateString()}, Downloads: ${f.download_count})`
          ).join('\n') + '\n';
        }
      } catch (dbErr) {
        console.error("LISTFILES DB Error:", dbErr.message);
        responseString = `Error retrieving files for area ${listFilesAreaName}.\n`;
      }
      break;

    case 'FILEDESC': // FILEDESC <file_id> /// <description>
      if (!session.loggedIn || !session.userId) {
        responseString = "You must be logged in to change a file description.\n";
        break;
      }
      const filedescFullArgs = inputString.substring(cmd.length + 1).trim();
      const filedescParts = filedescFullArgs.split(' ');

      if (filedescParts.length < 2) { // Needs at least file_id and something for ///
          responseString = "Usage: FILEDESC <file_id> /// <description>\n";
          break;
      }
      const fileIdArg = filedescParts[0];
      const fileIdToDesc = parseInt(fileIdArg);

      let newFileDesc = "";
      const fileDescSeparatorStr = "///";
      const potentialFileDescStartIndex = inputString.toUpperCase().indexOf(fileIdArg.toUpperCase()) + fileIdArg.length;
      const restOfStringForFileDesc = inputString.substring(potentialFileDescStartIndex).trim();
      const fileDescSeparatorActualIndex = restOfStringForFileDesc.indexOf(fileDescSeparatorStr);

      if (isNaN(fileIdToDesc) || fileDescSeparatorActualIndex === -1 ) {
          responseString = "Usage: FILEDESC <file_id> /// <description>\n";
          break;
      }
      newFileDesc = restOfStringForFileDesc.substring(fileDescSeparatorActualIndex + fileDescSeparatorStr.length).trim();

      if (!newFileDesc) { // Description cannot be empty if /// is present
          responseString = "Description cannot be empty when using '///'. Usage: FILEDESC <file_id> /// <description>\n";
          break;
      }

      try {
        const fileListing = await new Promise((resolve, reject) => {
          db.get("SELECT id, uploader_user_id FROM file_listings WHERE id = ?", [fileIdToDesc], (err, row) => {
            if (err) reject(err); else resolve(row);
          });
        });

        if (!fileListing) {
          responseString = "File not found.\n";
          break;
        }

        if (session.userId !== fileListing.uploader_user_id && !isSysOp(session)) {
          responseString = "Access denied. You can only edit descriptions for files you uploaded.\n";
          break;
        }

        await new Promise((resolve, reject) => {
          db.run("UPDATE file_listings SET description = ? WHERE id = ?", [newFileDesc, fileIdToDesc], function(err) {
            if (err) reject(err); else resolve(this);
          });
        });
        responseString = "File description updated.\n";
      } catch (dbErr) {
        console.error("FILEDESC DB Error:", dbErr.message);
        responseString = "Error updating file description.\n";
      }
      break;

    case 'DOWNLOADINFO': // DOWNLOADINFO <file_id>
      if (!session.loggedIn) { // Any logged in user can download
        responseString = "You must be logged in to download file information.\n";
        break;
      }
      if (args.length !== 1 || isNaN(parseInt(args[0]))) {
        responseString = "Usage: DOWNLOADINFO <file_id>\n";
        break;
      }
      const fileIdToDownload = parseInt(args[0]);

      try {
        // First, get the filename for the confirmation message
        const fileToDownload = await new Promise((resolve, reject) => {
            db.get("SELECT filename FROM file_listings WHERE id = ?", [fileIdToDownload], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!fileToDownload) {
            responseString = "File not found.\n";
            break;
        }

        // Then, update download_count
        const result = await new Promise((resolve, reject) => {
          db.run("UPDATE file_listings SET download_count = download_count + 1 WHERE id = ?", [fileIdToDownload], function(err) {
            if (err) reject(err);
            else resolve({ changes: this.changes });
          });
        });

        if (result.changes > 0) {
          responseString = `Simulated download of [${fileToDownload.filename}]. Download count updated.\n`;
        } else {
          // This case should ideally not be hit if fileToDownload was found, but as a safeguard:
          responseString = "File not found (or error updating count).\n";
        }
      } catch (dbErr) {
        console.error("DOWNLOADINFO DB Error:", dbErr.message);
        responseString = "Error processing download.\n";
      }
      break;

    case 'GAME':
      const gameAction = args[0] ? args[0].toUpperCase().trim() : null;
      const gameNameArg = args[1] ? args[1].toUpperCase().trim() : null;

      if (!gameAction) {
        responseString = "Usage: GAME <action|game_name> [START|action_argument] or GAME LIST/QUIT/EXIT.\n";
        break;
      }

      if (gameAction === 'LIST') {
        responseString = "Available games:\n- NUMBERGUESS\n";
        break;
      }

      if (gameAction === 'QUIT' || gameAction === 'EXIT') {
        if (session.currentGame) {
          if (session.currentGame.name === 'numberGuess') {
            responseString = numberGuess.quitGame(session);
          }
          // Add other game quit handlers here: else if (session.currentGame.name === 'OTHERGAME') ...
          else {
            responseString = "Unknown game active, attempting to quit generic game state.\n";
            delete session.currentGame; // Generic quit
          }
        } else {
          responseString = "You are not currently in a game.\n";
        }
        break;
      }

      let targetGameName = null;
      let actualAction = null;

      if (gameAction === 'START' && gameNameArg) {
        targetGameName = gameNameArg;
        actualAction = 'START';
      } else if (gameNameArg === 'START') {
        targetGameName = gameAction; // e.g. GAME NUMBERGUESS START
        actualAction = 'START';
      } else if (gameAction === 'NUMBERGUESS' && !gameNameArg) { // e.g., GAME NUMBERGUESS
        targetGameName = 'NUMBERGUESS';
        actualAction = 'START';
      }
      // Add other game start patterns here, e.g. GAME <gameName> for direct start

      if (actualAction === 'START') {
        if (session.currentGame) {
          responseString = `You are already in a game (${session.currentGame.name}). Type QUIT or EXIT to leave it first.\n`;
        } else {
          if (targetGameName === 'NUMBERGUESS') {
            responseString = numberGuess.startGame(session);
          } else {
            responseString = "Unknown game to start. Available: NUMBERGUESS. Usage: GAME NUMBERGUESS START\n";
          }
        }
      } else {
        responseString = "Invalid game command. Usage: GAME LIST, GAME <game_name> START, GAME QUIT.\n";
      }
      break;

    case 'HELP':
      let helpText = "Available commands:\n" +
             "LOOK - View recent messages (on current board)\n" +
             "SAY <message> - Post a message (on current board, login required)\n" +
             "LISTBOARDS - List all available message boards\n" +
             "JOINBOARD <board_name_or_id> - Join a specific message board\n" +
             "SENDMAIL <recipient> <subject> /// [body] - Send a private message.\n" +
             "LISTMAIL - List your private messages.\n" +
             "READMAIL <message_id> - Read a specific private message.\n" +
             "DELETEMAIL <message_id> - Delete a specific private message.\n" +
             "LISTFILEAREAS - List all available file areas.\n" +
             "LISTFILES [area_name_or_id] - List files in an area (defaults to 'General Files').\n" +
             "FILEDESC <file_id> /// <description> - Add/change a file's description.\n" +
             "DOWNLOADINFO <file_id> - Simulate downloading a file & update count.\n" +
             "GAME LIST - List available games.\n" +
             "GAME <game_name> START - Start playing a game (e.g., GAME NUMBERGUESS START).\n" +
             "GAME QUIT - Exit the current game.\n" +
             "REGISTER <username> <password> - Create a new account\n" +
             "LOGIN <username> <password> - Log into your account\n" +
             "LOGOUT - Log out\n" +
             "WHO - List active users\n" +
             "HELP - Show this help message\n" +
             "QUIT - Disconnect (Telnet only)\n" +
             "\nWhile in a game, most other commands are unavailable. Type 'quit' or 'exit' to leave the game.\n";
      if (isSysOp(session)) {
        helpText += "\nSysOp Commands:\n" +
                    "KICK <username> - Disconnect a user.\n" +
                    "BROADCAST <message> - Send a message to all users.\n" +
                    "EDITMESSAGE <id> <new_text> - Edit a public board message.\n" +
                    "DELETEMESSAGE <id> - Delete a public board message.\n" +
                    "UPLOADINFO <area> <filename> /// [desc] - Add file info (SysOp).\n";
      }
      responseString = helpText;
      break;

    case '': // Handle empty input
      responseString = ""; // Or some prompt like "> "
      break;
    default:
      responseString = `Unknown command: ${cmd}\n`;
      break;
  }
  // Prepend broadcasts if any, then return
  return broadcastsToPrepend + responseString;
}

module.exports = {
  createSession,
  getSession,
  endSession,
  processInput,
  parseCommand // parseCommand might still be useful for testing or other utilities
  // Removed addMessage and getMessages from exports as they are no longer used
};
