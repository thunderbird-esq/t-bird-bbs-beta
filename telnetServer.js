/**
 * @file Telnet server implementation for the BBS.
 * Uses Node.js 'net' module to create a TCP server that interacts with bbsLogic.
 */
const net = require('net');
// Import functions from bbsLogic, including getSession for preference checks.
const { createSession, processInput, endSession, getSession, getAppliedColor, COLOR_MAP, DEFAULT_COLORS } = require('./bbsLogic');

const TELNET_PORT = process.env.TELNET_PORT || 2323;

// ANSI Color Constants are now primarily managed in bbsLogic.js
// However, ANSI_RESET is universal and useful here.
const ANSI_RESET_TELNET = "\x1b[0m"; // Renamed to avoid conflict if bbsLogic.ANSI_RESET is different

/**
 * Generates the ANSI art welcome banner for Telnet clients.
 * Uses color codes directly for simplicity as this banner is static.
 * @returns {string} The formatted welcome banner string with ANSI escape codes.
 */
function getAnsiWelcomeBanner() {
  // Direct use of ANSI codes for the static banner
  const BRIGHT_CYAN = "\x1b[1;36m";
  const CYAN = "\x1b[36m";
  const BLUE = "\x1b[34m";
  const MAGENTA = "\x1b[35m";
  const YELLOW = "\x1b[33m";
  const BRIGHT = "\x1b[1m";
  const GREEN = "\x1b[32m";

  const bannerLines = [
    `   ${BRIGHT_CYAN}■  ▐▌█  ▐▌▄▄▄▄     ▐▌▗▞▀▚▖ ▄▄▄ ▗▖   ▄  ▄▄▄ ▐▌${ANSI_RESET_TELNET}`,
    `  ${CYAN}▗▄▟▙▄▖▐▌▀▄▄▞▘█   █    ▐▌▐▛▀▀▘█    ▐▌   ▄ █    ▐▌${ANSI_RESET_TELNET}`,
    `    ${BLUE}▐▌  ▐▛▀▚▖  █   █ ▗▞▀▜▌▝▚▄▄▖█    ▐▛▀▚▖█ █ ▗▞▀▜▌${ANSI_RESET_TELNET}`,
    `    ${BLUE}▐▌  ▐▌ ▐▌        ▝▚▄▟▌          ▐▙▄▞▘█   ▝▚▄▟▌${ANSI_RESET_TELNET}`,
    `    ${MAGENTA}▐▌                                          ${ANSI_RESET_TELNET}`,
    ``,
    `${YELLOW}           ┌───────────────────────┐${ANSI_RESET_TELNET}`,
    `${YELLOW}           │ ${BRIGHT}NO FEDS // NO COWARDS${ANSI_RESET_TELNET}${YELLOW} │${ANSI_RESET_TELNET}`,
    `${YELLOW}           └───────────────────────┘${ANSI_RESET_TELNET}`,
    ``,
    `${GREEN}       Welcome to THUNDERBIRD BBS (Telnet)!${ANSI_RESET_TELNET}`
  ];
  return bannerLines.join('\r\n') + '\r\n\r\n';
}

/**
 * Writes the command prompt to the socket, applying user-preferred or default colors.
 * @param {net.Socket} socket - The client socket.
 * @param {object} session - The user's session object.
 */
function writePrompt(socket, session) {
    // getAppliedColor and COLOR_MAP are from bbsLogic.
    const promptColorCode = getAppliedColor(session, 'prompt');
    socket.write(`\r\n${promptColorCode}> ${COLOR_MAP.reset || ANSI_RESET_TELNET}`);
}


/**
 * Initializes and starts the Telnet server.
 */
function startTelnetServer() {
  const server = net.createServer(async (socket) => {
    let sessionId;
    let session; // To store the session object for use in prompt writing
    try {
      sessionId = await createSession('telnet');
      socket.sessionId = sessionId;
      session = getSession(sessionId); // Get the session object
      if (!session) throw new Error("Session could not be retrieved after creation.");

      console.log(`Telnet client connected, session created: ${sessionId}`);
      socket.write(getAnsiWelcomeBanner());
      writePrompt(socket, session); // Write initial prompt with color
    } catch (e) {
        console.error("Telnet: Error during session creation or initial write:", e);
        socket.write("Server error during connection setup. Please try again.\r\n");
        socket.end();
        return;
    }

    socket.on('data', async (data) => {
      const commandString = data.toString().trim();
      const currentSessionId = socket.sessionId;
      const currentSession = getSession(currentSessionId); // Get current session for prompt re-coloring

      if (!currentSession) {
        console.error(`Telnet Error: No valid session found for active socket (ID: ${currentSessionId}). Ending connection.`);
        socket.write('Session error. Please reconnect.\r\n');
        socket.end();
        return;
      }

      if (!commandString) {
        writePrompt(socket, currentSession); // Re-issue prompt on empty input
        return;
      }

      if (commandString.toUpperCase() === 'QUIT') {
        socket.write('Goodbye!\r\n');
        socket.end();
        return;
      }

      try {
        const response = await processInput(currentSessionId, commandString);
        socket.write(response.endsWith('\n') ? response : response + '\r\n');
        writePrompt(socket, currentSession); // Re-issue prompt after command response
      } catch (e) {
        console.error(`Error processing command for session ${currentSessionId}:`, e);
        socket.write("An internal error occurred while processing your command. Please try again.\r\n");
        writePrompt(socket, currentSession); // Re-issue prompt even after error
      }
    });

    socket.on('close', () => {
      if (socket.sessionId) {
        endSession(socket.sessionId);
        console.log(`Telnet session ${socket.sessionId} fully closed and cleaned up.`);
      } else {
        console.log('Telnet connection closed without an active session ID.');
      }
    });

    socket.on('error', (err) => {
      if (socket.sessionId) {
        console.error(`Telnet socket error for session ${socket.sessionId}. Error: ${err.message}. Cleaning up session.`);
        endSession(socket.sessionId);
      } else {
        console.error(`Telnet socket error for connection without a session ID: ${err.message}`);
      }
      socket.destroy();
    });
  });

  server.listen(TELNET_PORT, () => {
    console.log(`BBS Telnet server listening on port ${TELNET_PORT}`);
  }).on('error', (err) => {
    console.error(`Telnet server error: ${err.message}`);
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${TELNET_PORT} is already in use. Please choose a different port.`);
    }
  });
}

module.exports = { startTelnetServer };
