const sessions = {};
const messages = [];
// IMPORTANT: Passwords are stored in plain text. This is for basic implementation only and is NOT secure.
const users = {};

function generateUniqueId() {
  return Math.random().toString(36).substring(2, 15);
}

function createSession(connectionType) {
  const sessionId = generateUniqueId();
  sessions[sessionId] = { username: 'guest', loggedIn: false, connectionType };
  console.log(`Session created: ${sessionId} (${connectionType})`);
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

function addMessage(username, text) {
  const message = { username, text, timestamp: new Date() };
  messages.push(message);
  console.log(`Message added: ${username} - ${text}`);
  return message;
}

function getMessages(count = 10) {
  return messages.slice(-count);
}

// ANSI Color Codes (subset, can be expanded)
const ANSI_RESET = "\x1b[0m";
const ANSI_BRIGHT = "\x1b[1m";
const ANSI_RED = "\x1b[31m";
const ANSI_GREEN = "\x1b[32m";
const ANSI_YELLOW = "\x1b[33m";
const ANSI_CYAN = "\x1b[36m";
const ANSI_WHITE = "\x1b[37m"; // Or use specific bright white like \x1b[1;37m

function processInput(sessionId, inputString) {
  const session = getSession(sessionId);
  if (!session) {
    // This case should ideally not be hit if session creation is robust
    return "Critical Error: Session not found. Please try reconnecting.\n";
  }

  const parsedCommand = parseCommand(inputString); // Use a different variable name to avoid conflict
  const { command: cmd, args } = parsedCommand; // Destructure from parsedCommand
  const isTelnet = session.connectionType === 'telnet';

  switch (cmd) {
    case 'REGISTER':
      if (args.length !== 2) {
        return "Usage: REGISTER <username> <password>\n";
      }
      const regUsername = args[0];
      const regPassword = args[1];
      if (users[regUsername]) {
        return "Username already taken. Please try another.\n";
      }
      users[regUsername] = { password: regPassword, registrationDate: new Date() };
      // console.log('Users object:', users); // For debugging
      return "Registration successful. You can now LOGIN.\n";

    case 'LOGIN':
      if (args.length !== 2) {
        return "Usage: LOGIN <username> <password>\n";
      }
      const loginUsername = args[0];
      const loginPassword = args[1];
      if (users[loginUsername] && users[loginUsername].password === loginPassword) {
        session.username = loginUsername;
        session.loggedIn = true;
        return `Welcome, ${loginUsername}! Login successful.\n`;
      } else {
        return "Invalid username or password.\n";
      }

    case 'LOGOUT':
      session.username = 'guest';
      session.loggedIn = false;
      return "You have been logged out.\n";

    case 'LOOK':
      const recentMessages = getMessages();
      if (recentMessages.length === 0) {
        return "No messages yet.\n";
      }
      if (isTelnet) {
        return recentMessages.map(msg =>
          `${ANSI_CYAN}[${msg.timestamp.toLocaleTimeString()}]${ANSI_RESET} ${ANSI_BRIGHT}${ANSI_YELLOW}${msg.username}${ANSI_RESET}: ${msg.text}`
        ).join('\n') + '\n';
      } else {
        return recentMessages.map(msg =>
          `[${msg.timestamp.toLocaleTimeString()}] ${msg.username}: ${msg.text}`
        ).join('\n') + '\n';
      }

    case 'SAY':
      if (!session.loggedIn) {
        return "You must be logged in to use the SAY command. Type LOGIN <username> <password>.\n";
      }
      if (args.length === 0) {
        return "What do you want to say? Usage: SAY <message>\n";
      }
      const messageText = args.join(' ');
      addMessage(session.username, messageText);
      return `You said: ${messageText}\n`;

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

    case 'HELP':
      return "Available commands:\n" +
             "LOOK - View recent messages\n" +
             "SAY <message> - Post a message (login required)\n" +
             "REGISTER <username> <password> - Create a new account\n" +
             "LOGIN <username> <password> - Log into your account\n" +
             "LOGOUT - Log out\n" +
             "WHO - List active users\n" +
             "HELP - Show this help message\n" +
             "QUIT - Disconnect (Telnet only)\n"; // Assuming QUIT is handled by Telnet server

    case '': // Handle empty input
      return ""; // Or some prompt like "> "
    default:
      return `Unknown command: ${cmd}\n`;
  }
}

module.exports = {
  createSession,
  getSession,
  endSession,
  processInput,
  // Exporting these for potential direct use or testing, though not strictly required by prompt
  parseCommand,
  addMessage,
  getMessages
};
