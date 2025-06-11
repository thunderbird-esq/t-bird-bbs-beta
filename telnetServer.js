const net = require('net');
const { createSession, processInput, endSession, getSession } = require('./bbsLogic');

const TELNET_PORT = process.env.TELNET_PORT || 2323;

// ANSI Color Codes
const ANSI_RESET = "\x1b[0m";
const ANSI_BRIGHT = "\x1b[1m";
const ANSI_RED = "\x1b[31m";
const ANSI_GREEN = "\x1b[32m";
const ANSI_YELLOW = "\x1b[33m";
const ANSI_BLUE = "\x1b[34m";
const ANSI_MAGENTA = "\x1b[35m";
const ANSI_CYAN = "\x1b[36m";
const ANSI_WHITE = "\x1b[37m";

function getAnsiWelcomeBanner() {
  const bannerLines = [
    `   ${ANSI_BRIGHT}${ANSI_CYAN}■  ▐▌█  ▐▌▄▄▄▄     ▐▌▗▞▀▚▖ ▄▄▄ ▗▖   ▄  ▄▄▄ ▐▌${ANSI_RESET}`,
    `  ${ANSI_CYAN}▗▄▟▙▄▖▐▌▀▄▄▞▘█   █    ▐▌▐▛▀▀▘█    ▐▌   ▄ █    ▐▌${ANSI_RESET}`,
    `    ${ANSI_BLUE}▐▌  ▐▛▀▚▖  █   █ ▗▞▀▜▌▝▚▄▄▖█    ▐▛▀▚▖█ █ ▗▞▀▜▌${ANSI_RESET}`,
    `    ${ANSI_BLUE}▐▌  ▐▌ ▐▌        ▝▚▄▟▌          ▐▙▄▞▘█   ▝▚▄▟▌${ANSI_RESET}`,
    `    ${ANSI_MAGENTA}▐▌                                          ${ANSI_RESET}`,
    ``,
    `${ANSI_YELLOW}           ┌───────────────────────┐${ANSI_RESET}`,
    `${ANSI_YELLOW}           │ ${ANSI_BRIGHT}NO FEDS // NO COWARDS${ANSI_RESET}${ANSI_YELLOW} │${ANSI_RESET}`,
    `${ANSI_YELLOW}           └───────────────────────┘${ANSI_RESET}`,
    ``,
    `${ANSI_GREEN}       Welcome to THUNDERBIRD BBS (Telnet)!${ANSI_RESET}`
  ];
  return bannerLines.join('\r\n') + '\r\n\r\n';
}

function startTelnetServer() {
  const server = net.createServer((socket) => { // Renamed client to socket for clarity
    const sessionId = createSession('telnet');
    socket.sessionId = sessionId; // Associate sessionId with the socket

    console.log(`Telnet client connected, session created: ${sessionId}`);
    socket.write(getAnsiWelcomeBanner()); // Use the new banner function

    socket.on('data', (data) => {
      const commandString = data.toString().trim();
      if (!commandString) {
        // Optionally send a prompt back if input is empty, or just ignore
        // socket.write('> ');
        return;
      }

      // Retrieve sessionId (though already available in this scope, good practice if refactoring)
      const currentSessionId = socket.sessionId;
      if (!currentSessionId || !getSession(currentSessionId)) {
        console.error(`Error: No valid session found for active socket. Ending connection.`);
        socket.write('Session error. Please reconnect.\r\n');
        socket.end();
        return;
      }

      // Special handling for a 'QUIT' command before sending to processInput
      // if bbsLogic's processInput doesn't handle QUIT in a way that closes the connection.
      if (commandString.toUpperCase() === 'QUIT') {
        socket.write('Goodbye!\r\n');
        socket.end(); // This will trigger the 'close' event
        return;
      }

      const response = processInput(currentSessionId, commandString);
      socket.write(response.endsWith('\n') ? response : response + '\r\n'); // Ensure newline
    });

    socket.on('close', () => { // Changed from 'end' to 'close' for more general connection termination
      const currentSessionId = socket.sessionId;
      if (currentSessionId) {
        endSession(currentSessionId);
        console.log(`Telnet client disconnected, session ended: ${currentSessionId}`);
      } else {
        console.log('Telnet client disconnected, no session ID associated.');
      }
    });

    socket.on('error', (err) => {
      const currentSessionId = socket.sessionId;
      console.error(`Telnet socket error for session ${currentSessionId || 'N/A'}:`, err.message);
      if (currentSessionId) {
        endSession(currentSessionId);
        console.log(`Session ${currentSessionId} ended due to error.`);
      }
    });
  });

  server.listen(TELNET_PORT, () => {
    console.log(`Telnet server listening on port ${TELNET_PORT}`);
  }).on('error', (err) => {
    console.error(`Telnet server error: ${err.message}`);
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${TELNET_PORT} is already in use. Please choose a different port.`);
    }
  });
}

module.exports = { startTelnetServer };
