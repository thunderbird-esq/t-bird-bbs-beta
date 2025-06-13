/**
 * @file Telnet server implementation for the BBS.
 * Uses Node.js 'net' module to create a TCP server that interacts with bbsLogic.
 */
const net = require('net');
// Import functions from bbsLogic, including getSession for preference checks.
const { createSession, processInput, endSession, getSession, getAppliedColor, COLOR_MAP, DEFAULT_COLORS } = require('./bbsLogic');

const TELNET_PORT = process.env.TELNET_PORT || 2323;

/**
 * Generates the ANSI art welcome banner for Telnet clients.
 * Uses color codes from the imported COLOR_MAP for consistency.
 * @returns {string} The formatted welcome banner string with ANSI escape codes.
 */
function getAnsiWelcomeBanner() {
  const bannerLines = [
    `   ${COLOR_MAP.bright_cyan}■  ▐▌█  ▐▌▄▄▄▄     ▐▌▗▞▀▚▖ ▄▄▄ ▗▖   ▄  ▄▄▄ ▐▌${COLOR_MAP.reset}`,
    `  ${COLOR_MAP.cyan}▗▄▟▙▄▖▐▌▀▄▄▞▘█   █    ▐▌▐▛▀▀▘█    ▐▌   ▄ █    ▐▌${COLOR_MAP.reset}`,
    `    ${COLOR_MAP.blue}▐▌  ▐▛▀▚▖  █   █ ▗▞▀▜▌▝▚▄▄▖█    ▐▛▀▚▖█ █ ▗▞▀▜▌${COLOR_MAP.reset}`,
    `    ${COLOR_MAP.blue}▐▌  ▐▌ ▐▌        ▝▚▄▟▌          ▐▙▄▞▘█   ▝▚▄▟▌${COLOR_MAP.reset}`,
    `    ${COLOR_MAP.magenta}▐▌                                          ${COLOR_MAP.reset}`,
    ``,
    `${COLOR_MAP.yellow}           ┌───────────────────────┐${COLOR_MAP.reset}`,
    `${COLOR_MAP.yellow}           │ ${COLOR_MAP.bright_white}NO FEDS // NO COWARDS${COLOR_MAP.reset}${COLOR_MAP.yellow} │${COLOR_MAP.reset}`, // Changed NO FEDS to bright_white for emphasis
    `${COLOR_MAP.yellow}           └───────────────────────┘${COLOR_MAP.reset}`,
    ``,
    `${COLOR_MAP.green}       Welcome to THUNDERBIRD BBS (Telnet)!${COLOR_MAP.reset}`
  ];
  return bannerLines.join('\r\n') + '\r\n\r\n';
}

/**
 * Writes the command prompt to the socket, applying user-preferred or default colors.
 * @param {net.Socket} socket - The client socket.
 * @param {object} session - The user's session object.
 */
function writePrompt(socket, session) {
    const promptColorCode = getAppliedColor(session, 'prompt');
    socket.write(`\r\n${promptColorCode}> ${COLOR_MAP.reset}`); // Use imported COLOR_MAP.reset
}


/**
 * Initializes and starts the Telnet server.
 */
function startTelnetServer() {
  const server = net.createServer(async (socket) => {
    let sessionId;
    let session;
    try {
      sessionId = await createSession('telnet');
      socket.sessionId = sessionId;
      session = getSession(sessionId);
      if (!session) throw new Error("Session could not be retrieved after creation.");

      console.log(`Telnet client connected, session created: ${sessionId}`);
      socket.write(getAnsiWelcomeBanner());
      writePrompt(socket, session);
    } catch (e) {
        console.error("Telnet: Error during session creation or initial write:", e);
        socket.write("Server error during connection setup. Please try again.\r\n");
        socket.end();
        return;
    }

    socket.on('data', async (data) => {
      const commandString = data.toString().trim();
      const currentSessionId = socket.sessionId;
      const currentSession = getSession(currentSessionId);

      if (!currentSession) {
        console.error(`Telnet Error: No valid session found for active socket (ID: ${currentSessionId}). Ending connection.`);
        socket.write('Session error. Please reconnect.\r\n');
        socket.end();
        return;
      }

      if (!commandString) {
        writePrompt(socket, currentSession);
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
        writePrompt(socket, currentSession);
      } catch (e) {
        console.error(`Error processing command for session ${currentSessionId}:`, e);
        socket.write("An internal error occurred while processing your command. Please try again.\r\n");
        writePrompt(socket, currentSession);
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
